from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func
import uuid
from datetime import datetime
import shutil
import openpyxl
from io import BytesIO
import logging

from app.database import get_db
from app.models import Project, ProjectTemplate, Part, PartType, DocumentSlot, SlotTemplate, SlotTemplateItem
from app.schemas import (
    ApplyTemplateRequest,
    ApplyTemplateResult,
    DocumentSlotResponse,
    MovePartFilesResult,
    ProjectCreate,
    ProjectPartCreate,
    ProjectPartDeleteInfoResponse,
    ProjectPartUpdate,
    ProjectPartSlotCreate,
    ProjectResponse,
    ProjectTemplateResponse,
    SlotTemplateResponse,
    ProjectPartResponse,
    PartImportResult,
    PartSlotsSummaryResponse,
)
from app.services.project_folders import (
    count_part_physical_files,
    create_project_folders,
    create_slot_folder,
    delete_part_folder,
    get_part_target_folder_path,
    get_staging_upload_dir,
    move_part_files_to_staging,
    open_part_folder,
)
from app.services.part_type_slots import get_default_slots_for_part_type

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["projects"])


def create_missing_slots_for_part_from_template(
    db: Session,
    project_id: str,
    part_id: str,
    template: SlotTemplate,
) -> int:
    template_items = (
        db.query(SlotTemplateItem)
        .filter(SlotTemplateItem.slot_template_id == template.id)
        .order_by(SlotTemplateItem.sort_order, SlotTemplateItem.slot_name)
        .all()
    )
    if not template_items:
        raise HTTPException(status_code=400, detail="所选模板没有可创建的槽位项")

    existing_slot_keys = {
        (slot.group_type, slot.document_type)
        for slot in db.query(DocumentSlot)
        .filter(DocumentSlot.project_id == project_id, DocumentSlot.part_id == part_id)
        .all()
    }

    created_count = 0
    for item in template_items:
        slot_key = (item.group_type, item.slot_name)
        if slot_key in existing_slot_keys:
            continue

        db.add(
            DocumentSlot(
                id=str(uuid.uuid4()),
                project_id=project_id,
                part_id=part_id,
                group_type=item.group_type,
                document_type=item.slot_name,
                created_at=datetime.utcnow(),
            )
        )
        existing_slot_keys.add(slot_key)
        created_count += 1

    return created_count


def get_part_delete_info_payload(part: Part, db: Session):
    file_count = count_part_physical_files(part, db)
    child_part_count = (
        db.query(func.count(Part.id))
        .filter(Part.project_id == part.project_id, Part.parent_part_id == part.id)
        .scalar()
        or 0
    )
    _path, folder_exists = get_part_target_folder_path(part, db)

    return {
        "part_id": part.id,
        "part_no": part.part_no,
        "part_name": part.part_name,
        "file_count": file_count,
        "child_part_count": child_part_count,
        "folder_exists": folder_exists,
    }

@router.get("", response_model=list[ProjectResponse])
def get_projects(db: Session = Depends(get_db)):
    projects = db.query(Project).all()
    return projects

@router.post("", response_model=ProjectResponse)
def create_project(project: ProjectCreate, db: Session = Depends(get_db)):
    root_path = None
    try:
        template_name = project.template_name
        if project.project_template_id:
            template = db.query(ProjectTemplate).filter(ProjectTemplate.id == project.project_template_id).first()
            if not template:
                raise HTTPException(status_code=400, detail="项目模板不存在")
            template_name = template.template_name

        new_project = Project(
            id=str(uuid.uuid4()),
            customer_name=project.customer_name,
            project_name=project.project_name,
            template_name=template_name,
            project_template_id=project.project_template_id,
            created_at=datetime.utcnow(),
        )
        db.add(new_project)
        db.flush()

        root_path = create_project_folders(project.customer_name, project.project_name)
        new_project.root_path = root_path

        db.commit()
        db.refresh(new_project)
        return new_project
    except Exception as e:
        db.rollback()
        if root_path:
            try:
                shutil.rmtree(root_path)
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=f"创建项目失败：{str(e)}")

@router.get("/slot-templates", response_model=list[SlotTemplateResponse])
def get_slot_templates(db: Session = Depends(get_db)):
    templates = db.query(SlotTemplate).order_by(SlotTemplate.template_name).all()
    return templates


@router.get("/templates", response_model=list[ProjectTemplateResponse])
def get_project_templates(db: Session = Depends(get_db)):
    templates = db.query(ProjectTemplate).order_by(ProjectTemplate.template_name).all()
    return templates


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return project


@router.post("/{project_id}/parts", response_model=ProjectPartResponse)
def create_project_part(project_id: str, payload: ProjectPartCreate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    part_no = payload.part_no.strip()
    part_name = payload.part_name.strip()
    part_type_name = payload.part_type.strip() if payload.part_type else None
    parent_part_no = payload.parent_part_no.strip() if payload.parent_part_no else None
    remark = payload.remark.strip() if payload.remark else None
    slot_template_id = payload.slot_template_id

    if not part_no:
        raise HTTPException(status_code=400, detail="Part No 不能为空")
    if not part_name:
        raise HTTPException(status_code=400, detail="Part Name 不能为空")

    existing_part = (
        db.query(Part)
        .filter(Part.project_id == project_id, Part.part_no == part_no)
        .first()
    )
    if existing_part:
        raise HTTPException(status_code=400, detail="同一项目内 Part No 不能重复")

    part_type = None
    if part_type_name:
        part_type = db.query(PartType).filter(PartType.type_name == part_type_name).first()
        if not part_type:
            part_type = PartType(
                id=str(uuid.uuid4()),
                type_name=part_type_name,
                created_at=datetime.utcnow(),
            )
            db.add(part_type)
            db.flush()

    parent_part = None
    if parent_part_no:
        parent_part = (
            db.query(Part)
            .filter(Part.project_id == project_id, Part.part_no == parent_part_no)
            .first()
        )
        if not parent_part:
            raise HTTPException(status_code=400, detail="Parent Part No 未找到")

    slot_template = None
    if slot_template_id:
        slot_template = (
            db.query(SlotTemplate)
            .filter(SlotTemplate.id == slot_template_id)
            .first()
        )
        if not slot_template:
            raise HTTPException(status_code=404, detail="模板不存在")

    new_part = Part(
        id=str(uuid.uuid4()),
        project_id=project_id,
        part_no=part_no,
        part_name=part_name,
        part_type_id=part_type.id if part_type else None,
        parent_part_id=parent_part.id if parent_part else None,
        remark=remark,
        created_at=datetime.utcnow(),
    )
    db.add(new_part)
    db.flush()

    if slot_template:
        create_missing_slots_for_part_from_template(
            db=db,
            project_id=project_id,
            part_id=new_part.id,
            template=slot_template,
        )

    db.commit()
    db.refresh(new_part)

    return {
        "id": new_part.id,
        "part_no": new_part.part_no,
        "part_name": new_part.part_name,
        "part_type": new_part.part_type.type_name if new_part.part_type else None,
        "parent_part_no": new_part.parent_part.part_no if new_part.parent_part else None,
        "remark": new_part.remark,
    }


@router.post("/{project_id}/parts/{part_id}/slots", response_model=DocumentSlotResponse)
def create_project_part_slot(
    project_id: str,
    part_id: str,
    payload: ProjectPartSlotCreate,
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    part = (
        db.query(Part)
        .filter(Part.id == part_id, Part.project_id == project_id)
        .first()
    )
    if not part:
        raise HTTPException(status_code=404, detail="Part 不存在或不属于当前项目")

    slot_name = payload.slot_name.strip()
    group_type = payload.group_type.strip().lower()

    if not slot_name:
        raise HTTPException(status_code=400, detail="slot_name 不能为空")
    if group_type not in {"external", "internal"}:
        raise HTTPException(status_code=400, detail="group_type 必须是 external 或 internal")

    existing_slot = (
        db.query(DocumentSlot)
        .filter(
            DocumentSlot.project_id == project_id,
            DocumentSlot.part_id == part_id,
            DocumentSlot.group_type == group_type,
            DocumentSlot.document_type == slot_name,
        )
        .first()
    )
    if existing_slot:
        raise HTTPException(status_code=400, detail="该槽位已存在")

    new_slot = DocumentSlot(
        id=str(uuid.uuid4()),
        project_id=project_id,
        part_id=part_id,
        group_type=group_type,
        document_type=slot_name,
        created_at=datetime.utcnow(),
    )
    db.add(new_slot)
    db.commit()
    db.refresh(new_slot)

    return {
        "slot_id": new_slot.id,
        "part_id": new_slot.part_id,
        "group_type": new_slot.group_type,
        "document_type": new_slot.document_type,
        "has_file": new_slot.has_file,
        "latest_filename": new_slot.latest_filename,
        "latest_upload_at": new_slot.latest_upload_at,
        "note": new_slot.note,
    }


@router.put("/{project_id}/parts/{part_id}", response_model=ProjectPartResponse)
def update_project_part(
    project_id: str,
    part_id: str,
    payload: ProjectPartUpdate,
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    part = (
        db.query(Part)
        .filter(Part.id == part_id, Part.project_id == project_id)
        .first()
    )
    if not part:
        raise HTTPException(status_code=404, detail="Part 不存在或不属于当前项目")

    part_type_name = payload.part_type.strip() if payload.part_type else None
    parent_part_no = payload.parent_part_no.strip() if payload.parent_part_no else None
    remark = payload.remark.strip() if payload.remark else None

    part_type = None
    if part_type_name:
        part_type = db.query(PartType).filter(PartType.type_name == part_type_name).first()
        if not part_type:
            part_type = PartType(
                id=str(uuid.uuid4()),
                type_name=part_type_name,
                created_at=datetime.utcnow(),
            )
            db.add(part_type)
            db.flush()

    parent_part = None
    if parent_part_no:
        if parent_part_no == part.part_no:
            raise HTTPException(status_code=400, detail="父件不能是当前 Part 自己")

        parent_part = (
            db.query(Part)
            .filter(Part.project_id == project_id, Part.part_no == parent_part_no)
            .first()
        )
        if not parent_part:
            raise HTTPException(status_code=400, detail="Parent Part No 未找到")

    part.part_type_id = part_type.id if part_type else None
    part.parent_part_id = parent_part.id if parent_part else None
    part.remark = remark

    db.commit()
    db.refresh(part)

    return {
        "id": part.id,
        "part_no": part.part_no,
        "part_name": part.part_name,
        "part_type": part.part_type.type_name if part.part_type else None,
        "parent_part_no": part.parent_part.part_no if part.parent_part else None,
        "remark": part.remark,
    }


@router.get("/{project_id}/parts/{part_id}/delete-info", response_model=ProjectPartDeleteInfoResponse)
def get_project_part_delete_info(
    project_id: str,
    part_id: str,
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    part = (
        db.query(Part)
        .filter(Part.id == part_id, Part.project_id == project_id)
        .first()
    )
    if not part:
        raise HTTPException(status_code=404, detail="Part 不存在或不属于当前项目")

    return get_part_delete_info_payload(part, db)


@router.post("/{project_id}/parts/{part_id}/open-folder")
def open_project_part_folder(
    project_id: str,
    part_id: str,
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    part = (
        db.query(Part)
        .filter(Part.id == part_id, Part.project_id == project_id)
        .first()
    )
    if not part:
        raise HTTPException(status_code=404, detail="Part 不存在或不属于当前项目")

    try:
        open_part_folder(part, db)
        return {"message": "目录已打开"}
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/{project_id}/parts/{part_id}/move-files-to-staging", response_model=MovePartFilesResult)
def move_project_part_files_to_staging(
    project_id: str,
    part_id: str,
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    part = (
        db.query(Part)
        .filter(Part.id == part_id, Part.project_id == project_id)
        .first()
    )
    if not part:
        raise HTTPException(status_code=404, detail="Part 不存在或不属于当前项目")

    try:
        moved_count = move_part_files_to_staging(part, db)
        return MovePartFilesResult(
            moved_count=moved_count,
            staging_dir=get_staging_upload_dir(),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{project_id}/parts/{part_id}")
def delete_project_part(
    project_id: str,
    part_id: str,
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    part = (
        db.query(Part)
        .filter(Part.id == part_id, Part.project_id == project_id)
        .first()
    )
    if not part:
        raise HTTPException(status_code=404, detail="Part 不存在或不属于当前项目")

    delete_info = get_part_delete_info_payload(part, db)
    if delete_info["child_part_count"] > 0:
        raise HTTPException(status_code=400, detail="该 Part 下仍有子 Part，当前阶段不允许删除")

    try:
        delete_part_folder(part, db)
        db.delete(part)
        db.commit()
        return {"message": "Part 删除成功"}
    except RuntimeError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"删除 Part 失败: {exc}")

@router.get("/{project_id}/parts", response_model=list[ProjectPartResponse])
def get_project_parts(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    parts = db.query(Part).filter(Part.project_id == project_id).all()
    sorted_parts = sorted(
        parts,
        key=lambda p: ((p.part_no or "").lower(), (p.part_name or "").lower()),
    )

    part_responses = []
    for part in sorted_parts:
        part_responses.append({
            "id": part.id,
            "part_no": part.part_no,
            "part_name": part.part_name,
            "part_type": part.part_type.type_name if part.part_type else None,
            "parent_part_no": part.parent_part.part_no if part.parent_part else None,
            "remark": part.remark,
        })

    return part_responses

@router.get("/{project_id}/part-slots-summary", response_model=list[PartSlotsSummaryResponse])
def get_part_slots_summary(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    slots = db.query(DocumentSlot).filter(DocumentSlot.project_id == project_id).all()
    return [
        {
            "part_id": slot.part_id,
            "slot_id": slot.id,
            "slot_name": slot.document_type,
            "latest_filename": slot.latest_filename,
            "latest_upload_at": slot.latest_upload_at,
        }
        for slot in slots
    ]


@router.post("/{project_id}/apply-template", response_model=ApplyTemplateResult)
def apply_template_to_project(
    project_id: str,
    payload: ApplyTemplateRequest,
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    template = (
        db.query(SlotTemplate)
        .filter(SlotTemplate.id == payload.template_id)
        .first()
    )
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")

    parts = db.query(Part).filter(Part.project_id == project_id).all()
    part_count = len(parts)

    template_items = (
        db.query(SlotTemplateItem)
        .filter(SlotTemplateItem.slot_template_id == template.id)
        .order_by(SlotTemplateItem.sort_order, SlotTemplateItem.slot_name)
        .all()
    )
    if not template_items:
        raise HTTPException(status_code=400, detail="模板没有可创建的槽位项")

    existing_slots = db.query(DocumentSlot).filter(DocumentSlot.project_id == project_id).all()
    existing_slot_keys = {
        (slot.part_id, slot.group_type, slot.document_type)
        for slot in existing_slots
    }

    created_count = 0
    skipped_count = 0

    for part in parts:
        for item in template_items:
            slot_key = (part.id, item.group_type, item.slot_name)
            if slot_key in existing_slot_keys:
                skipped_count += 1
                continue

            db.add(
                DocumentSlot(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    part_id=part.id,
                    group_type=item.group_type,
                    document_type=item.slot_name,
                    created_at=datetime.utcnow(),
                )
            )
            existing_slot_keys.add(slot_key)
            created_count += 1

    db.commit()

    return ApplyTemplateResult(
        template_id=template.id,
        template_name=template.template_name,
        created_count=created_count,
        skipped_count=skipped_count,
        part_count=part_count,
    )

@router.post("/{project_id}/import-parts-excel", response_model=PartImportResult)
async def import_parts_excel(
    project_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    if not file.filename or not file.filename.lower().endswith('.xlsx'):
        raise HTTPException(status_code=400, detail="仅支持 .xlsx 文件")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="上传文件为空")

    try:
        workbook = openpyxl.load_workbook(BytesIO(content), data_only=True)
        sheet = workbook.worksheets[0]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"无法读取 Excel 文件: {exc}")

    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        raise HTTPException(status_code=400, detail="Excel 文件不能为空")

    header = [str(cell).strip() if cell is not None else "" for cell in rows[0]]
    required_columns = ["Part No", "Part Name", "Part Type", "Parent Part No", "Remark"]
    missing_columns = [col for col in required_columns if col not in header]
    if missing_columns:
        raise HTTPException(status_code=400, detail=f"缺少必需列: {', '.join(missing_columns)}")

    column_index = {name: header.index(name) for name in required_columns}
    existing_part_nos = {
        part.part_no
        for part in db.query(Part).filter(Part.project_id == project_id).all()
        if part.part_no
    }
    seen_part_nos: set[str] = set()
    rows_to_create: list[tuple[Part, str]] = []
    part_type_cache: dict[str, PartType] = {}
    imported_count = 0
    skipped_count = 0
    error_count = 0
    warnings: list[str] = []

    for row_values in rows[1:]:
        if row_values is None:
            skipped_count += 1
            continue

        values = [str(value).strip() if value is not None else "" for value in list(row_values) + [None] * len(header)]
        part_no = values[column_index["Part No"]]
        part_name = values[column_index["Part Name"]]
        part_type_name = values[column_index["Part Type"]]
        parent_part_no = values[column_index["Parent Part No"]]
        remark = values[column_index["Remark"]]

        if not part_no and not part_name:
            skipped_count += 1
            continue

        if not part_no or not part_name:
            error_count += 1
            continue

        if part_no in existing_part_nos or part_no in seen_part_nos:
            skipped_count += 1
            continue

        seen_part_nos.add(part_no)

        part_type_id = None
        if part_type_name:
            part_type = part_type_cache.get(part_type_name)
            if part_type is None:
                part_type = db.query(PartType).filter(PartType.type_name == part_type_name).first()
                if part_type is None:
                    part_type = PartType(
                        id=str(uuid.uuid4()),
                        type_name=part_type_name,
                        created_at=datetime.utcnow(),
                    )
                    db.add(part_type)
                    db.flush()
                part_type_cache[part_type_name] = part_type
            part_type_id = part_type.id

        new_part = Part(
            id=str(uuid.uuid4()),
            project_id=project_id,
            part_no=part_no,
            part_name=part_name,
            part_type_id=part_type_id,
            remark=remark or None,
            created_at=datetime.utcnow(),
        )
        rows_to_create.append((new_part, parent_part_no))
        db.add(new_part)
        imported_count += 1

    db.flush()

    part_no_to_id = {
        part.part_no: part.id
        for part, _ in rows_to_create
        if part.part_no
    }

    for part, parent_part_no in rows_to_create:
        if parent_part_no:
            parent_id = part_no_to_id.get(parent_part_no)
            if parent_id is None:
                parent_part = (
                    db.query(Part)
                    .filter(Part.project_id == project_id, Part.part_no == parent_part_no)
                    .first()
                )
                parent_id = parent_part.id if parent_part else None
            if parent_id:
                part.parent_part_id = parent_id
            else:
                warnings.append(f"父件 {parent_part_no} 未找到，已保留为空")

    db.commit()

    # 为新导入的 Part 创建默认 slots (按 Part Type)
    for part, _ in rows_to_create:
        part_type_name = part.part_type.type_name if part.part_type else None
        default_slots = get_default_slots_for_part_type(part_type_name)
        
        for slot_name in default_slots:
            # 检查是否已存在
            existing_slot = db.query(DocumentSlot).filter(
                DocumentSlot.project_id == project_id,
                DocumentSlot.part_id == part.id,
                DocumentSlot.document_type == slot_name,
                DocumentSlot.group_type == "external"  # 默认 external
            ).first()
            if not existing_slot:
                new_slot = DocumentSlot(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    part_id=part.id,
                    group_type="external",
                    document_type=slot_name,
                    created_at=datetime.utcnow(),
                )
                db.add(new_slot)
    db.commit()

    # 为新创建的 slots 创建目录
    for part, _ in rows_to_create:
        part_type_name = part.part_type.type_name if part.part_type else None
        default_slots = get_default_slots_for_part_type(part_type_name)
        
        for slot_name in default_slots:
            slot = db.query(DocumentSlot).filter(
                DocumentSlot.project_id == project_id,
                DocumentSlot.part_id == part.id,
                DocumentSlot.document_type == slot_name,
                DocumentSlot.group_type == "external"
            ).first()
            if slot:
                try:
                    create_slot_folder(slot, db)
                except Exception as exc:
                    logger.warning("创建 slot 目录失败: %s", exc)
                    # 不影响整体导入结果

    return PartImportResult(
        imported_count=imported_count,
        skipped_count=skipped_count,
        error_count=error_count,
        warnings=warnings,
    )
