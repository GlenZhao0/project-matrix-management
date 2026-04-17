import json
import os
import shutil
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models import Project, Part, DocumentSlot, UploadedFile
from app.services.project_folders import (
    build_project_folder_name,
    build_slot_target_folder_path,
    get_project_exports_dir,
    sanitize_dir_name,
)


def _serialize_datetime(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return value.isoformat()


def _build_warning(
    code: str,
    level: str,
    message: str,
    **extra: Optional[str],
) -> Dict[str, Any]:
    warning = {
        "code": code,
        "level": level,
        "message": message,
        "source_project_id": None,
        "source_part_id": None,
        "source_slot_id": None,
        "source_uploaded_file_id": None,
        "relative_path": None,
        "original_relative_path": None,
    }
    warning.update(extra)
    return warning


def _build_export_timestamp(now: datetime) -> str:
    return now.strftime("%Y%m%d_%H%M%S")


def _build_export_dir(project: Project, now: datetime) -> str:
    exports_root = get_project_exports_dir()
    project_name = build_project_folder_name(project.customer_name, project.project_name)
    base_name = f"{project_name}_backup_{_build_export_timestamp(now)}"
    export_dir = os.path.join(exports_root, base_name)
    counter = 2
    while os.path.exists(export_dir):
        export_dir = os.path.join(exports_root, f"{base_name}__{counter}")
        counter += 1
    return export_dir


def _build_part_export_keys(parts: List[Part]) -> Tuple[Dict[str, str], List[Dict[str, Any]]]:
    warnings: List[Dict[str, Any]] = []
    counters: Dict[str, int] = {}
    result: Dict[str, str] = {}

    sorted_parts = sorted(
        parts,
        key=lambda part: (
            (part.part_no or "").lower(),
            (part.part_name or "").lower(),
            part.id,
        ),
    )

    for part in sorted_parts:
        raw_key = part.part_no or part.part_name or "unnamed_part"
        base_key = sanitize_dir_name(raw_key) or "unnamed_part"
        occurrence = counters.get(base_key, 0) + 1
        counters[base_key] = occurrence

        export_key = base_key if occurrence == 1 else f"{base_key}__{occurrence}"
        result[part.id] = export_key

        if occurrence > 1:
            warnings.append(
                _build_warning(
                    code="DUPLICATE_EXPORT_PART_KEY_RESOLVED",
                    level="warning",
                    message="导出目录 key 重名，已自动追加后缀",
                    source_part_id=part.id,
                    relative_path=f"parts/{export_key}",
                )
            )

    return result, warnings


def _build_original_relative_path(project_root: Optional[str], source_file_path: Optional[str]) -> Optional[str]:
    if not project_root or not source_file_path:
        return None
    try:
        return os.path.relpath(source_file_path, project_root)
    except ValueError:
        return None


def _copy_uploaded_file_to_export(
    *,
    project: Project,
    slot: DocumentSlot,
    uploaded_file: UploadedFile,
    export_files_root: str,
    export_part_key: str,
    db: Session,
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    slot_folder_path, _exists = build_slot_target_folder_path(slot, db)
    source_file_path = os.path.join(slot_folder_path, uploaded_file.filename) if slot_folder_path else None
    original_relative_path = _build_original_relative_path(project.root_path, source_file_path)

    relative_path = os.path.join(
        "parts",
        export_part_key,
        slot.group_type,
        sanitize_dir_name(slot.document_type) or "unnamed_slot",
        uploaded_file.filename,
    ).replace(os.sep, "/")

    if not source_file_path or not os.path.isfile(source_file_path):
        return None, _build_warning(
            code="MISSING_PHYSICAL_FILE",
            level="warning",
            message="数据库记录存在，但物理文件缺失",
            source_project_id=project.id,
            source_slot_id=slot.id,
            source_uploaded_file_id=uploaded_file.id,
            original_relative_path=original_relative_path,
            relative_path=relative_path,
        )

    destination_path = os.path.join(export_files_root, *relative_path.split("/"))
    os.makedirs(os.path.dirname(destination_path), exist_ok=True)

    final_relative_path = relative_path
    if os.path.exists(destination_path):
        base_name, ext = os.path.splitext(uploaded_file.filename)
        counter = 2
        while os.path.exists(destination_path):
            candidate_filename = f"{base_name}__{counter}{ext}"
            final_relative_path = os.path.join(
                "parts",
                export_part_key,
                slot.group_type,
                sanitize_dir_name(slot.document_type) or "unnamed_slot",
                candidate_filename,
            ).replace(os.sep, "/")
            destination_path = os.path.join(export_files_root, *final_relative_path.split("/"))
            counter += 1

    shutil.copy2(source_file_path, destination_path)

    file_entry = {
        "source_uploaded_file_id": uploaded_file.id,
        "source_slot_id": slot.id,
        "filename": uploaded_file.filename,
        "uploaded_at": _serialize_datetime(uploaded_file.uploaded_at),
        "remark": uploaded_file.remark,
        "is_latest": uploaded_file.is_latest,
        "relative_path": final_relative_path,
        "original_relative_path": original_relative_path,
        "size": os.path.getsize(destination_path),
        "sha256": None,
    }

    duplicate_warning = None
    if final_relative_path != relative_path:
        duplicate_warning = _build_warning(
            code="DUPLICATE_EXPORT_FILE_NAME_RESOLVED",
            level="warning",
            message="导出文件路径冲突，已自动追加后缀",
            source_project_id=project.id,
            source_slot_id=slot.id,
            source_uploaded_file_id=uploaded_file.id,
            original_relative_path=original_relative_path,
            relative_path=final_relative_path,
        )

    return file_entry, duplicate_warning


def export_project_backup(project_id: str, db: Session) -> Dict[str, Any]:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise ValueError("项目不存在")

    now = datetime.utcnow()
    export_dir = _build_export_dir(project, now)
    manifest_path = os.path.join(export_dir, "manifest.json")
    export_files_root = os.path.join(export_dir, "files")
    os.makedirs(export_files_root, exist_ok=True)

    parts = (
        db.query(Part)
        .filter(Part.project_id == project_id)
        .order_by(Part.sort_order, Part.part_no, Part.part_name, Part.id)
        .all()
    )
    slots = (
        db.query(DocumentSlot)
        .filter(DocumentSlot.project_id == project_id)
        .order_by(DocumentSlot.part_id, DocumentSlot.group_type, DocumentSlot.document_type, DocumentSlot.id)
        .all()
    )
    slot_map = {slot.id: slot for slot in slots}
    uploaded_files = (
        db.query(UploadedFile)
        .join(DocumentSlot, UploadedFile.slot_id == DocumentSlot.id)
        .filter(DocumentSlot.project_id == project_id)
        .order_by(UploadedFile.uploaded_at, UploadedFile.id)
        .all()
    )

    part_export_keys, warnings = _build_part_export_keys(parts)

    manifest: Dict[str, Any] = {
        "format_version": 1,
        "exported_at": _serialize_datetime(now),
        "app": {
            "name": "project-matrix-management",
            "version": "1.0",
        },
        "project": {
            "source_project_id": project.id,
            "customer_name": project.customer_name,
            "project_name": project.project_name,
            "template_name": project.template_name,
            "project_template_id": project.project_template_id,
            "default_slot_template_id": project.default_slot_template_id,
            "default_slot_template_name": project.default_slot_template_name,
            "created_at": _serialize_datetime(project.created_at),
        },
        "project_meta": {
            "owner_name": None,
            "product_line": None,
            "handover_source": None,
        },
        "export_context": {
            "root_path_at_export": project.root_path,
        },
        "parts": [],
        "slots": [],
        "uploaded_files": [],
        "warnings": [],
    }

    if not project.root_path:
        warnings.append(
            _build_warning(
                code="ROOT_PATH_MISSING",
                level="warning",
                message="项目 root_path 缺失，导出将无法复制物理文件",
                source_project_id=project.id,
            )
        )

    copied_file_count = 0
    missing_file_count = 0

    for part in parts:
        manifest["parts"].append(
            {
                "source_part_id": part.id,
                "part_no": part.part_no,
                "part_name": part.part_name,
                "part_type": part.part_type.type_name if part.part_type else None,
                "source_parent_part_id": part.parent_part_id,
                "parent_part_no": part.parent_part.part_no if part.parent_part else None,
                "remark": part.remark,
                "created_at": _serialize_datetime(part.created_at),
                "export_part_key": part_export_keys[part.id],
            }
        )

    for slot in slots:
        manifest["slots"].append(
            {
                "source_slot_id": slot.id,
                "source_part_id": slot.part_id,
                "group_type": slot.group_type,
                "document_type": slot.document_type,
                "note": slot.note,
                "has_file": slot.has_file,
                "latest_filename": slot.latest_filename,
                "latest_upload_at": _serialize_datetime(slot.latest_upload_at),
                "created_at": _serialize_datetime(slot.created_at),
            }
        )

    for uploaded_file in uploaded_files:
        slot = slot_map.get(uploaded_file.slot_id)
        if not slot:
            warnings.append(
                _build_warning(
                    code="SOURCE_SLOT_NOT_FOUND",
                    level="warning",
                    message="上传文件关联的槽位不存在，已跳过文件导出",
                    source_project_id=project.id,
                    source_uploaded_file_id=uploaded_file.id,
                )
            )
            missing_file_count += 1
            continue

        file_entry, file_warning = _copy_uploaded_file_to_export(
            project=project,
            slot=slot,
            uploaded_file=uploaded_file,
            export_files_root=export_files_root,
            export_part_key=part_export_keys[slot.part_id],
            db=db,
        )

        if file_entry:
            manifest["uploaded_files"].append(file_entry)
            copied_file_count += 1
        else:
            missing_file_count += 1

        if file_warning:
            warnings.append(file_warning)

    manifest["warnings"] = warnings

    with open(manifest_path, "w", encoding="utf-8") as fp:
        json.dump(manifest, fp, ensure_ascii=False, indent=2)

    return {
        "export_dir": export_dir,
        "manifest_path": manifest_path,
        "copied_file_count": copied_file_count,
        "missing_file_count": missing_file_count,
        "warning_count": len(warnings),
        "warnings": warnings,
    }
