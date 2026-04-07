from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import subprocess
import os
import shutil
from datetime import datetime

from app.database import get_db
from app.models import DocumentSlot, UploadedFile
from app.schemas import SlotDetailResponse, FileRecordResponse, StagingFileResponse, ImportFromStagingRequest, ImportLocalFileRequest
from app.services.project_folders import get_slot_target_folder_path

router = APIRouter(prefix="/document-slots", tags=["slots"])

@router.get("/staging-files", response_model=List[StagingFileResponse])
def get_staging_files():
    staging_dir = os.path.expanduser(getattr(__import__('config'), 'STAGING_UPLOAD_DIR', '~/projects_inbox'))
    if not os.path.exists(staging_dir):
        return []

    files = []
    try:
        for entry in os.scandir(staging_dir):
            if entry.is_file():
                stat = entry.stat()
                files.append(StagingFileResponse(
                    filename=entry.name,
                    full_path=entry.path,
                    modified_at=datetime.fromtimestamp(stat.st_mtime),
                    size=stat.st_size
                ))
    except OSError:
        return []
    return files

@router.get("/{slot_id}", response_model=SlotDetailResponse)
def get_slot_detail(slot_id: str, db: Session = Depends(get_db)):
    slot = db.query(DocumentSlot).filter(DocumentSlot.id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="槽位不存在")

    target_folder_path, target_folder_exists = get_slot_target_folder_path(slot, db)

    return {
        "slot_id": slot.id,
        "part_id": slot.part_id,
        "group_type": slot.group_type,
        "document_type": slot.document_type,
        "has_file": slot.has_file,
        "latest_filename": slot.latest_filename,
        "latest_upload_at": slot.latest_upload_at,
        "note": slot.note or "",
        "target_folder_path": target_folder_path,
        "target_folder_exists": target_folder_exists,
    }

@router.post("/{slot_id}/open-folder")
def open_slot_folder(slot_id: str, db: Session = Depends(get_db)):
    slot = db.query(DocumentSlot).filter(DocumentSlot.id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="槽位不存在")

    target_folder_path, target_folder_exists = get_slot_target_folder_path(slot, db)
    if not target_folder_path or not target_folder_exists:
        raise HTTPException(status_code=400, detail="目标目录不存在")

    try:
        subprocess.run(["open", target_folder_path], check=True)
        return {"message": "目录已打开"}
    except subprocess.CalledProcessError as exc:
        raise HTTPException(status_code=500, detail=f"打开目录失败: {exc}")

@router.post("/{slot_id}/import-from-staging")
def import_from_staging(slot_id: str, request: ImportFromStagingRequest, db: Session = Depends(get_db)):
    slot = db.query(DocumentSlot).filter(DocumentSlot.id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="槽位不存在")

    target_folder_path, target_folder_exists = get_slot_target_folder_path(slot, db)
    if not target_folder_path or not target_folder_exists:
        raise HTTPException(status_code=400, detail="目标目录不存在")

    staging_dir = os.path.expanduser(getattr(__import__('config'), 'STAGING_UPLOAD_DIR', '~/projects_inbox'))
    if not os.path.abspath(request.staging_file_path).startswith(os.path.abspath(staging_dir)):
        raise HTTPException(status_code=400, detail="文件不在待上传目录中")

    if not os.path.exists(request.staging_file_path):
        raise HTTPException(status_code=400, detail="源文件不存在")

    filename = os.path.basename(request.staging_file_path)
    target_file_path = os.path.join(target_folder_path, filename)
    if os.path.exists(target_file_path):
        raise HTTPException(status_code=400, detail="目标目录已存在同名文件")

    try:
        # 更新旧记录
        db.query(UploadedFile).filter(UploadedFile.slot_id == slot_id, UploadedFile.is_latest == True).update({"is_latest": False})

        # 移动文件
        shutil.move(request.staging_file_path, target_file_path)

        # 新增记录
        new_file = UploadedFile(
            slot_id=slot_id,
            filename=filename,
            uploaded_at=datetime.utcnow(),
            remark=request.remark,
            is_latest=True,
        )
        db.add(new_file)

        # 更新槽位
        slot.has_file = True
        slot.latest_filename = filename
        slot.latest_upload_at = datetime.utcnow()
        if request.remark:
            slot.note = request.remark

        db.commit()
        return {"message": "文件导入成功"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"导入失败: {str(e)}")

@router.post("/{slot_id}/open-latest-file")
def open_latest_file(slot_id: str, db: Session = Depends(get_db)):
    slot = db.query(DocumentSlot).filter(DocumentSlot.id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="槽位不存在")

    if not slot.latest_filename:
        raise HTTPException(status_code=400, detail="槽位无最新文件")

    target_folder_path, _ = get_slot_target_folder_path(slot, db)
    if not target_folder_path:
        raise HTTPException(status_code=400, detail="目标目录不存在")

    file_path = os.path.join(target_folder_path, slot.latest_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=400, detail="最新文件不存在")

    try:
        subprocess.run(["open", file_path], check=True)
        return {"message": "文件已打开"}
    except subprocess.CalledProcessError as exc:
        raise HTTPException(status_code=500, detail=f"打开文件失败: {exc}")

@router.post("/{slot_id}/upload-file")
def upload_file(
    slot_id: str,
    file: UploadFile = File(...),
    remark: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    slot = db.query(DocumentSlot).filter(DocumentSlot.id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="槽位不存在")

    target_folder_path, target_folder_exists = get_slot_target_folder_path(slot, db)
    if not target_folder_path or not target_folder_exists:
        raise HTTPException(status_code=400, detail="目标目录不存在")

    filename = os.path.basename(file.filename)
    target_file_path = os.path.join(target_folder_path, filename)
    if os.path.exists(target_file_path):
        raise HTTPException(status_code=400, detail="目标目录已存在同名文件")

    try:
        content = file.file.read()
        with open(target_file_path, "wb") as dest:
            dest.write(content)

        db.query(UploadedFile).filter(UploadedFile.slot_id == slot_id, UploadedFile.is_latest == True).update({"is_latest": False})

        new_file = UploadedFile(
            slot_id=slot_id,
            filename=filename,
            uploaded_at=datetime.utcnow(),
            remark=remark,
            is_latest=True,
        )
        db.add(new_file)

        slot.has_file = True
        slot.latest_filename = filename
        slot.latest_upload_at = datetime.utcnow()
        if remark:
            slot.note = remark

        db.commit()
        return {"message": "文件上传成功"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"上传失败: {str(e)}")

@router.post("/{slot_id}/import-local-file")
def import_local_file(slot_id: str, request: ImportLocalFileRequest, db: Session = Depends(get_db)):
    slot = db.query(DocumentSlot).filter(DocumentSlot.id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="槽位不存在")

    target_folder_path, target_folder_exists = get_slot_target_folder_path(slot, db)
    if not target_folder_path or not target_folder_exists:
        raise HTTPException(status_code=400, detail="目标目录不存在")

    if not os.path.isabs(request.local_file_path):
        raise HTTPException(status_code=400, detail="请填写绝对路径")

    if not os.path.exists(request.local_file_path):
        raise HTTPException(status_code=400, detail="源文件不存在")

    if not os.path.isfile(request.local_file_path):
        raise HTTPException(status_code=400, detail="源路径不是文件")

    filename = os.path.basename(request.local_file_path)
    target_file_path = os.path.join(target_folder_path, filename)
    if os.path.exists(target_file_path):
        raise HTTPException(status_code=400, detail="目标目录已存在同名文件")

    try:
        # 更新旧记录
        db.query(UploadedFile).filter(UploadedFile.slot_id == slot_id, UploadedFile.is_latest == True).update({"is_latest": False})

        # 移动文件
        shutil.move(request.local_file_path, target_file_path)

        # 新增记录
        new_file = UploadedFile(
            slot_id=slot_id,
            filename=filename,
            uploaded_at=datetime.utcnow(),
            remark=request.remark,
            is_latest=True,
        )
        db.add(new_file)

        # 更新槽位
        slot.has_file = True
        slot.latest_filename = filename
        slot.latest_upload_at = datetime.utcnow()
        if request.remark:
            slot.note = request.remark

        db.commit()
        return {"message": "本地文件导入成功"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"导入失败: {str(e)}")

@router.get("/{slot_id}/files", response_model=List[FileRecordResponse])
def get_slot_files(slot_id: str, db: Session = Depends(get_db)):
    slot = db.query(DocumentSlot).filter(DocumentSlot.id == slot_id).first()
    if not slot:
        raise HTTPException(status_code=404, detail="槽位不存在")

    files = db.query(UploadedFile).filter(UploadedFile.slot_id == slot_id).all()
    return files
