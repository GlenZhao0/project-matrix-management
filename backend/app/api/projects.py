from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
import json
import uuid
from datetime import datetime
import os
import subprocess
import mimetypes
import shutil
import openpyxl
from io import BytesIO
import logging

from app.database import get_db
from app.models import Project, ProjectTemplate, Part, PartType, DocumentSlot, ProjectSummaryHistory, SlotTemplate, SlotTemplateItem, UploadedFile
from app.schemas import (
    ApplyTemplateRequest,
    ApplyTemplateResult,
    DocumentSlotResponse,
    MoveProjectFilesResult,
    MovePartFilesResult,
    ProjectListMutationResponse,
    ProjectListRenameRequest,
    ProjectBackupExportResponse,
    ProjectBackupImportRequest,
    ProjectBackupImportResponse,
    ProjectDirectoryImportRequest,
    ProjectDirectoryImportResponse,
    ProjectDirectoryScanRequest,
    ProjectDirectoryScanResponse,
    ProjectCreate,
    ProjectDeleteInfoResponse,
    ProjectDeleteResponse,
    ProjectPartCreate,
    ProjectPartDeleteInfoResponse,
    ProjectPartUpdate,
    ProjectPartSlotCreate,
    ProjectSummaryUpdate,
    ProjectUpdate,
    ProjectResponse,
    ProjectSummaryHistoryResponse,
    ProjectTemplateResponse,
    SlotTemplateResponse,
    ProjectPartResponse,
    ProjectExistingFileResponse,
    ProjectExistingFilePreviewResponse,
    PartImportResult,
    PartSlotsSummaryResponse,
)
from app.services.project_backup import export_project_backup
from app.services.project_import import import_project_backup, import_project_directory, scan_project_directory_root
from app.services.project_metadata import write_project_metadata
from app.services.project_folders import (
    count_project_physical_files,
    count_part_physical_files,
    create_project_folders,
    create_slot_folder,
    delete_project_folder,
    delete_part_folder,
    get_project_target_folder_path,
    get_part_target_folder_path,
    get_slot_target_folder_path,
    get_staging_upload_dir,
    is_project_folder_in_allowed_delete_scope,
    move_project_files_to_staging,
    move_part_files_to_staging,
    open_part_folder,
)
from app.services.part_type_slots import get_default_slots_for_part_type

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["projects"])
DEFAULT_PROJECT_LIST_NAME = "默认清单"


def _normalize_project_list_name(value: str | None) -> str:
    normalized = (value or "").strip()
    if normalized == "项目清单":
        return DEFAULT_PROJECT_LIST_NAME
    return normalized or DEFAULT_PROJECT_LIST_NAME


def _count_projects_in_list(project_list_name: str, db: Session) -> int:
    normalized_name = _normalize_project_list_name(project_list_name)
    return db.query(func.count(Project.id)).filter(_build_project_list_filter(normalized_name)).scalar() or 0


def _build_project_list_filter(project_list_name: str):
    normalized_name = _normalize_project_list_name(project_list_name)
    if normalized_name == DEFAULT_PROJECT_LIST_NAME:
        return or_(
            Project.project_list_name == normalized_name,
            Project.project_list_name.is_(None),
            func.trim(Project.project_list_name) == "",
            func.trim(Project.project_list_name) == "项目清单",
        )

    return Project.project_list_name == normalized_name


def _project_identity_exists(
    db: Session,
    customer_name: str,
    project_name: str,
    project_id: str | None = None,
) -> bool:
    query = db.query(Project.id).filter(
        Project.customer_name == customer_name,
        Project.project_name == project_name,
    )
    if project_id:
        query = query.filter(Project.id != project_id)
    return query.first() is not None


def _get_project_or_404(project_id: str, db: Session) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return project


def _refresh_project_metadata(project_id: str, db: Session) -> None:
    write_project_metadata(project_id, db)


def _create_project_summary_snapshot(project: Project, db: Session) -> ProjectSummaryHistory:
    latest_version_no = (
        db.query(func.max(ProjectSummaryHistory.version_no))
        .filter(ProjectSummaryHistory.project_id == project.id)
        .scalar()
        or 0
    )

    history = ProjectSummaryHistory(
        id=str(uuid.uuid4()),
        project_id=project.id,
        version_no=latest_version_no + 1,
        summary_json=project.summary_json,
        summary_html=project.summary_html if not project.summary_json else None,
        created_at=datetime.utcnow(),
    )
    db.add(history)
    return history


def _deserialize_summary_json(value: str | None):
    if not value:
        return None

    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return None


def _serialize_summary_json(value) -> str | None:
    if value is None:
        return None

    return json.dumps(value, ensure_ascii=False)


def _collect_attachment_file_ids(value) -> list[str]:
    file_ids: list[str] = []

    def walk(node):
        if isinstance(node, dict):
            if node.get("type") == "attachment":
                attrs = node.get("attrs") or {}
                uploaded_file_id = attrs.get("uploaded_file_id")
                if isinstance(uploaded_file_id, str) and uploaded_file_id.strip():
                    file_ids.append(uploaded_file_id.strip())

            for child in node.values():
                walk(child)
        elif isinstance(node, list):
            for child in node:
                walk(child)

    walk(value)
    return file_ids


def _validate_summary_attachment_scope(project_id: str, summary_json, db: Session) -> None:
    file_ids = _collect_attachment_file_ids(summary_json)
    if not file_ids:
        return

    existing_ids = {
        file_id
        for (file_id,) in (
            db.query(UploadedFile.id)
            .join(DocumentSlot, UploadedFile.slot_id == DocumentSlot.id)
            .filter(DocumentSlot.project_id == project_id, UploadedFile.id.in_(file_ids))
            .all()
        )
    }

    missing_ids = sorted(set(file_ids) - existing_ids)
    if missing_ids:
        raise HTTPException(status_code=400, detail=f"附件文件不属于当前项目: {', '.join(missing_ids)}")


def _build_project_response(project: Project) -> ProjectResponse:
    return ProjectResponse(
        id=project.id,
        project_list_name=project.project_list_name,
        internal_code=project.internal_code,
        customer_name=project.customer_name,
        project_name=project.project_name,
        annual_revenue_estimate=project.annual_revenue_estimate,
        engineer_name=project.engineer_name,
        pm_name=project.pm_name,
        template_name=project.template_name,
        project_template_id=project.project_template_id,
        summary_json=_deserialize_summary_json(project.summary_json),
        legacy_summary_html=project.summary_html,
        summary_updated_at=project.summary_updated_at,
        default_slot_template_id=project.default_slot_template_id,
        default_slot_template_name=project.default_slot_template_name,
        root_path=project.root_path,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


def _build_project_summary_history_response(history: ProjectSummaryHistory) -> ProjectSummaryHistoryResponse:
    return ProjectSummaryHistoryResponse(
        id=history.id,
        project_id=history.project_id,
        version_no=history.version_no,
        summary_json=_deserialize_summary_json(history.summary_json),
        legacy_summary_html=history.summary_html,
        created_at=history.created_at,
    )


def _infer_file_type(filename: str | None) -> str:
    if not filename:
        return "file"

    dot_index = filename.rfind(".")
    if dot_index == -1 or dot_index == len(filename) - 1:
        return "file"

    return filename[dot_index + 1 :].lower()


def _resolve_project_uploaded_file(project_id: str, uploaded_file_id: str, db: Session):
    row = (
        db.query(UploadedFile, DocumentSlot, Part)
        .join(DocumentSlot, UploadedFile.slot_id == DocumentSlot.id)
        .join(Part, DocumentSlot.part_id == Part.id)
        .filter(UploadedFile.id == uploaded_file_id, DocumentSlot.project_id == project_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="项目文件不存在")

    uploaded_file, slot, part = row
    target_folder_path, target_folder_exists = get_slot_target_folder_path(slot, db)
    if not target_folder_path or not target_folder_exists:
        raise HTTPException(status_code=400, detail="目标目录不存在")

    file_path = os.path.join(target_folder_path, uploaded_file.filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=400, detail="文件不存在")

    return uploaded_file, slot, part, file_path


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


def get_project_delete_info_payload(project: Project):
    file_count = count_project_physical_files(project)
    _path, folder_exists = get_project_target_folder_path(project)
    folder_in_allowed_delete_scope = is_project_folder_in_allowed_delete_scope(project)
    can_move_files_to_staging = (
        file_count > 0 and folder_exists and folder_in_allowed_delete_scope
    )
    can_delete_directly = file_count == 0

    if file_count > 0 and folder_in_allowed_delete_scope:
        delete_mode = "blocked_has_files"
        message = "项目目录中仍有文件，请先转到待上传文件夹后再删除"
    elif file_count > 0:
        delete_mode = "blocked_manual_cleanup_required"
        message = "项目目录中仍有文件，且目录不在允许自动处理范围内，请先手动处理后再删除"
    elif folder_exists and not folder_in_allowed_delete_scope:
        delete_mode = "db_only"
        message = "项目目录不在允许物理删除范围内，将仅删除项目记录"
    elif folder_exists:
        delete_mode = "direct_delete"
        message = "项目可直接删除"
    else:
        delete_mode = "direct_delete"
        message = "项目目录不存在，可直接删除项目记录"

    return {
        "project_id": project.id,
        "customer_name": project.customer_name,
        "project_name": project.project_name,
        "file_count": file_count,
        "folder_exists": folder_exists,
        "folder_in_allowed_delete_scope": folder_in_allowed_delete_scope,
        "can_move_files_to_staging": can_move_files_to_staging,
        "can_delete_directly": can_delete_directly,
        "delete_mode": delete_mode,
        "message": message,
    }

@router.get("", response_model=list[ProjectResponse])
def get_projects(project_list_name: str | None = Query(default=None), db: Session = Depends(get_db)):
    query = db.query(Project)

    if project_list_name is not None:
        normalized_name = _normalize_project_list_name(project_list_name)
        query = query.filter(_build_project_list_filter(normalized_name))

    projects = query.order_by(Project.updated_at.desc(), Project.created_at.desc()).all()
    return [_build_project_response(project) for project in projects]

@router.post("", response_model=ProjectResponse)
def create_project(project: ProjectCreate, db: Session = Depends(get_db)):
    root_path = None
    try:
        customer_name = project.customer_name.strip()
        project_name = project.project_name.strip()
        internal_code = project.internal_code.strip() if project.internal_code and project.internal_code.strip() else None
        if not customer_name or not project_name:
            raise HTTPException(status_code=400, detail="客户和项目名称不能为空")
        if _project_identity_exists(db, customer_name, project_name):
            raise HTTPException(status_code=409, detail="该客户下已存在同名项目")

        template_name = project.template_name
        if project.project_template_id:
            template = db.query(ProjectTemplate).filter(ProjectTemplate.id == project.project_template_id).first()
            if not template:
                raise HTTPException(status_code=400, detail="项目模板不存在")
            template_name = template.template_name

        new_project = Project(
            id=str(uuid.uuid4()),
            project_list_name=_normalize_project_list_name(project.project_list_name),
            internal_code=internal_code,
            customer_name=customer_name,
            project_name=project_name,
            annual_revenue_estimate=project.annual_revenue_estimate.strip() if project.annual_revenue_estimate else None,
            engineer_name=project.engineer_name.strip() if project.engineer_name else None,
            pm_name=project.pm_name.strip() if project.pm_name else None,
            template_name=template_name,
            project_template_id=project.project_template_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(new_project)
        db.flush()

        root_path = create_project_folders(project.customer_name, project.project_name)
        new_project.root_path = root_path
        _refresh_project_metadata(new_project.id, db)

        db.commit()
        db.refresh(new_project)
        return _build_project_response(new_project)
    except HTTPException:
        db.rollback()
        if root_path:
            try:
                shutil.rmtree(root_path)
            except Exception:
                pass
        raise
    except Exception as e:
        db.rollback()
        if root_path:
            try:
                shutil.rmtree(root_path)
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=f"创建项目失败：{str(e)}")


@router.get("/{project_id}/delete-info", response_model=ProjectDeleteInfoResponse)
def get_project_delete_info(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    return ProjectDeleteInfoResponse(**get_project_delete_info_payload(project))


@router.post("/{project_id}/move-files-to-staging", response_model=MoveProjectFilesResult)
def move_project_files(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    try:
        moved_count = move_project_files_to_staging(project)
        _refresh_project_metadata(project.id, db)
        return MoveProjectFilesResult(
            moved_count=moved_count,
            staging_dir=get_staging_upload_dir(),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(project_id: str, payload: ProjectUpdate, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    customer_name = payload.customer_name.strip()
    project_name = payload.project_name.strip()
    internal_code = payload.internal_code.strip() if payload.internal_code and payload.internal_code.strip() else None
    if not customer_name or not project_name:
        raise HTTPException(status_code=400, detail="客户和项目名称不能为空")
    if _project_identity_exists(db, customer_name, project_name, project.id):
        raise HTTPException(status_code=409, detail="该客户下已存在同名项目")

    template_name = payload.template_name
    if payload.project_template_id:
        template = db.query(ProjectTemplate).filter(ProjectTemplate.id == payload.project_template_id).first()
        if not template:
            raise HTTPException(status_code=400, detail="项目模板不存在")
        template_name = template.template_name

    project.customer_name = customer_name
    project.project_list_name = _normalize_project_list_name(payload.project_list_name)
    project.internal_code = internal_code
    project.project_name = project_name
    project.annual_revenue_estimate = payload.annual_revenue_estimate.strip() if payload.annual_revenue_estimate else None
    project.engineer_name = payload.engineer_name.strip() if payload.engineer_name else None
    project.pm_name = payload.pm_name.strip() if payload.pm_name else None
    project.project_template_id = payload.project_template_id
    project.template_name = template_name
    project.updated_at = datetime.utcnow()

    _refresh_project_metadata(project.id, db)
    db.commit()
    db.refresh(project)
    return _build_project_response(project)


@router.put("/{project_id}/summary", response_model=ProjectResponse)
def update_project_summary(project_id: str, payload: ProjectSummaryUpdate, db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)

    _validate_summary_attachment_scope(project_id, payload.summary_json, db)
    project.summary_json = _serialize_summary_json(payload.summary_json)
    project.summary_html = None
    project.summary_updated_at = datetime.utcnow()
    project.updated_at = datetime.utcnow()
    _create_project_summary_snapshot(project, db)
    db.flush()

    _refresh_project_metadata(project.id, db)
    db.commit()
    db.refresh(project)
    return _build_project_response(project)


@router.post("/project-lists/rename", response_model=ProjectListMutationResponse)
def rename_project_list(payload: ProjectListRenameRequest, db: Session = Depends(get_db)):
    old_name = _normalize_project_list_name(payload.old_name)
    new_name = _normalize_project_list_name(payload.new_name)

    if old_name == DEFAULT_PROJECT_LIST_NAME:
        raise HTTPException(status_code=400, detail="默认清单不支持重命名")
    if new_name == DEFAULT_PROJECT_LIST_NAME:
        raise HTTPException(status_code=400, detail="不能重命名为默认清单")
    if old_name == new_name:
        return ProjectListMutationResponse(message="项目清单名称未变化")
    if _count_projects_in_list(new_name, db) > 0:
        raise HTTPException(status_code=409, detail="项目清单名称已存在")

    projects = db.query(Project).filter(Project.project_list_name == old_name).all()
    if not projects:
        raise HTTPException(status_code=404, detail="项目清单不存在")

    for project in projects:
        project.project_list_name = new_name
        project.updated_at = datetime.utcnow()

    db.commit()
    return ProjectListMutationResponse(message="项目清单已重命名")


@router.delete("/project-lists/{project_list_name}", response_model=ProjectListMutationResponse)
def delete_project_list(project_list_name: str, db: Session = Depends(get_db)):
    normalized_name = _normalize_project_list_name(project_list_name)

    project_count = _count_projects_in_list(normalized_name, db)
    if project_count > 0:
        raise HTTPException(status_code=409, detail="该项目清单下仍有项目，无法删除")

    return ProjectListMutationResponse(message="项目清单已删除")


@router.get("/{project_id}/summary/history", response_model=list[ProjectSummaryHistoryResponse])
def get_project_summary_history(project_id: str, db: Session = Depends(get_db)):
    _get_project_or_404(project_id, db)

    histories = (
        db.query(ProjectSummaryHistory)
        .filter(ProjectSummaryHistory.project_id == project_id)
        .order_by(ProjectSummaryHistory.version_no.desc(), ProjectSummaryHistory.created_at.desc())
        .all()
    )
    return [_build_project_summary_history_response(history) for history in histories]


@router.post("/{project_id}/summary/history/{history_id}/restore", response_model=ProjectResponse)
def restore_project_summary_history(project_id: str, history_id: str, db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    history = (
        db.query(ProjectSummaryHistory)
        .filter(ProjectSummaryHistory.project_id == project_id, ProjectSummaryHistory.id == history_id)
        .first()
    )
    if not history:
        raise HTTPException(status_code=404, detail="历史版本不存在")

    restored_summary_json = _deserialize_summary_json(history.summary_json)
    _validate_summary_attachment_scope(project_id, restored_summary_json, db)

    project.summary_json = history.summary_json
    project.summary_html = history.summary_html if not history.summary_json else None
    project.summary_updated_at = datetime.utcnow()
    project.updated_at = datetime.utcnow()
    _create_project_summary_snapshot(project, db)
    db.flush()
    _refresh_project_metadata(project.id, db)

    db.commit()
    db.refresh(project)
    return _build_project_response(project)


@router.get("/{project_id}/files", response_model=list[ProjectExistingFileResponse])
def get_project_existing_files(project_id: str, db: Session = Depends(get_db)):
    _get_project_or_404(project_id, db)

    rows = (
        db.query(UploadedFile, DocumentSlot, Part)
        .join(DocumentSlot, UploadedFile.slot_id == DocumentSlot.id)
        .join(Part, DocumentSlot.part_id == Part.id)
        .filter(DocumentSlot.project_id == project_id)
        .order_by(UploadedFile.uploaded_at.desc(), UploadedFile.created_at.desc())
        .all()
    )

    return [
        ProjectExistingFileResponse(
            uploaded_file_id=uploaded_file.id,
            slot_id=slot.id,
            part_id=part.id,
            filename=uploaded_file.filename,
            file_type=_infer_file_type(uploaded_file.filename),
            group_type=slot.group_type,
            part_name=part.part_name,
            part_no=part.part_no,
            slot_name=slot.document_type,
            uploaded_at=uploaded_file.uploaded_at,
            is_latest=uploaded_file.is_latest,
        )
        for uploaded_file, slot, part in rows
    ]


@router.post("/{project_id}/files/{uploaded_file_id}/open")
def open_project_existing_file(project_id: str, uploaded_file_id: str, db: Session = Depends(get_db)):
    _get_project_or_404(project_id, db)

    uploaded_file, _slot, _part, file_path = _resolve_project_uploaded_file(project_id, uploaded_file_id, db)

    try:
        subprocess.run(["open", file_path], check=True)
        return {"message": "文件已打开"}
    except subprocess.CalledProcessError as exc:
        raise HTTPException(status_code=500, detail=f"打开文件失败: {exc}")


@router.get("/{project_id}/files/{uploaded_file_id}/preview", response_model=ProjectExistingFilePreviewResponse)
def get_project_existing_file_preview(project_id: str, uploaded_file_id: str, db: Session = Depends(get_db)):
    _get_project_or_404(project_id, db)
    uploaded_file, _slot, _part, file_path = _resolve_project_uploaded_file(project_id, uploaded_file_id, db)
    file_type = _infer_file_type(uploaded_file.filename)

    text_preview_types = {"txt", "md", "csv", "log", "json"}
    image_preview_types = {"png", "jpg", "jpeg", "gif", "webp", "bmp"}

    if file_type in text_preview_types:
      try:
          with open(file_path, "r", encoding="utf-8", errors="replace") as handle:
              text_content = handle.read(200000)
      except OSError as exc:
          raise HTTPException(status_code=500, detail=f"读取文件失败: {exc}")

      return ProjectExistingFilePreviewResponse(
          uploaded_file_id=uploaded_file.id,
          filename=uploaded_file.filename,
          file_type=file_type,
          preview_kind="text",
          text_content=text_content,
      )

    if file_type == "pdf":
        return ProjectExistingFilePreviewResponse(
            uploaded_file_id=uploaded_file.id,
            filename=uploaded_file.filename,
            file_type=file_type,
            preview_kind="pdf",
        )

    if file_type in image_preview_types:
        return ProjectExistingFilePreviewResponse(
            uploaded_file_id=uploaded_file.id,
            filename=uploaded_file.filename,
            file_type=file_type,
            preview_kind="image",
        )

    return ProjectExistingFilePreviewResponse(
        uploaded_file_id=uploaded_file.id,
        filename=uploaded_file.filename,
        file_type=file_type,
        preview_kind="unsupported",
    )


@router.get("/{project_id}/files/{uploaded_file_id}/content")
def get_project_existing_file_content(project_id: str, uploaded_file_id: str, db: Session = Depends(get_db)):
    _get_project_or_404(project_id, db)
    uploaded_file, _slot, _part, file_path = _resolve_project_uploaded_file(project_id, uploaded_file_id, db)
    media_type, _encoding = mimetypes.guess_type(uploaded_file.filename)

    return FileResponse(
        file_path,
        media_type=media_type or "application/octet-stream",
        filename=uploaded_file.filename,
    )


@router.delete("/{project_id}", response_model=ProjectDeleteResponse)
def delete_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    delete_info = get_project_delete_info_payload(project)
    if not delete_info["can_delete_directly"]:
        raise HTTPException(status_code=409, detail=delete_info["message"])

    deleted_folder = False
    status = "deleted"
    message = "项目删除成功"

    if delete_info["folder_exists"] and delete_info["folder_in_allowed_delete_scope"]:
        try:
            deleted_folder = delete_project_folder(project)
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    elif delete_info["folder_exists"]:
        status = "deleted_db_only"
        message = "项目记录已删除，原目录未删除"

    db.delete(project)
    db.commit()
    return ProjectDeleteResponse(
        status=status,
        message=message,
        deleted_folder=deleted_folder,
        deleted_record=True,
    )

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
    return _build_project_response(project)


@router.post("/{project_id}/export-backup", response_model=ProjectBackupExportResponse)
def export_project_backup_dir(project_id: str, db: Session = Depends(get_db)):
    try:
        return export_project_backup(project_id, db)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.exception("导出项目备份目录失败: %s", exc)
        raise HTTPException(status_code=500, detail=f"导出项目备份目录失败: {exc}")


@router.post("/backup/import", response_model=ProjectBackupImportResponse)
def import_project_backup_dir(payload: ProjectBackupImportRequest, db: Session = Depends(get_db)):
    try:
        return import_project_backup(payload.backup_dir, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("导入项目备份目录失败: %s", exc)
        raise HTTPException(status_code=500, detail=f"导入项目备份目录失败: {exc}")


@router.post("/directory/import", response_model=ProjectDirectoryImportResponse)
def import_project_directory_route(payload: ProjectDirectoryImportRequest, db: Session = Depends(get_db)):
    try:
        return import_project_directory(payload.project_dir, db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("导入项目目录失败: %s", exc)
        raise HTTPException(status_code=500, detail=f"导入项目目录失败: {exc}")


@router.post("/directory/scan", response_model=ProjectDirectoryScanResponse)
def scan_project_directory_route(payload: ProjectDirectoryScanRequest):
    try:
        return {"items": scan_project_directory_root(payload.root_dir)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("扫描项目目录失败: %s", exc)
        raise HTTPException(status_code=500, detail=f"扫描项目目录失败: {exc}")


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

    _refresh_project_metadata(project_id, db)
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
    db.flush()
    _refresh_project_metadata(project_id, db)
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

    _refresh_project_metadata(project_id, db)
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
        _refresh_project_metadata(project_id, db)
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
        db.flush()
        _refresh_project_metadata(project_id, db)
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

    _refresh_project_metadata(project_id, db)
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
    _refresh_project_metadata(project_id, db)
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
