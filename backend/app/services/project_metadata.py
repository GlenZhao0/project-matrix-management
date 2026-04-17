import json
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models import DocumentSlot, Part, Project, ProjectSummaryHistory, UploadedFile
from app.services.project_folders import build_slot_target_folder_path

METADATA_FILENAME = ".project_meta.json"
METADATA_FORMAT_VERSION = 1


def _serialize_datetime(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return value.isoformat()


def _deserialize_json_text(value: Optional[str]):
    if not value:
        return None

    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return None


def _infer_file_type(filename: Optional[str]) -> str:
    if not filename:
        return "file"

    dot_index = filename.rfind(".")
    if dot_index == -1 or dot_index == len(filename) - 1:
        return "file"

    return filename[dot_index + 1 :].lower()


def _to_relative_project_path(project_root: str, absolute_path: str) -> str:
    relative_path = os.path.relpath(absolute_path, project_root)
    return relative_path.replace(os.sep, "/")


def _collect_attachment_nodes(value, collector: List[Dict[str, Any]]) -> None:
    if isinstance(value, dict):
        if value.get("type") == "attachment":
            attrs = value.get("attrs") or {}
            if isinstance(attrs, dict):
                collector.append(attrs)

        for child in value.values():
            _collect_attachment_nodes(child, collector)
    elif isinstance(value, list):
        for child in value:
            _collect_attachment_nodes(child, collector)


def _build_file_entry(
    project_root: str,
    uploaded_file: UploadedFile,
    slot: DocumentSlot,
    part: Part,
    db: Session,
) -> Dict[str, Any]:
    slot_folder_path, _slot_folder_exists = build_slot_target_folder_path(slot, db)
    file_path = os.path.join(slot_folder_path, uploaded_file.filename) if slot_folder_path else None
    file_exists = bool(file_path and os.path.isfile(file_path))
    file_stat = os.stat(file_path) if file_exists and file_path else None

    return {
        "uploaded_file_id": uploaded_file.id,
        "slot_id": slot.id,
        "part_id": part.id,
        "part_no": part.part_no,
        "part_name": part.part_name,
        "slot_name": slot.document_type,
        "group_type": slot.group_type,
        "filename": uploaded_file.filename,
        "file_type": _infer_file_type(uploaded_file.filename),
        "relative_path": _to_relative_project_path(project_root, file_path) if file_path else None,
        "size_bytes": file_stat.st_size if file_stat else None,
        "uploaded_at": _serialize_datetime(uploaded_file.uploaded_at),
        "created_at": _serialize_datetime(uploaded_file.created_at),
        "modified_at": _serialize_datetime(datetime.fromtimestamp(file_stat.st_mtime)) if file_stat else None,
        "remark": uploaded_file.remark,
        "is_latest": uploaded_file.is_latest,
        "exists_on_disk": file_exists,
    }


def _build_file_references(
    project_root: str,
    summary_json,
    files_by_id: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    attachment_nodes: List[Dict[str, Any]] = []
    _collect_attachment_nodes(summary_json, attachment_nodes)

    references: List[Dict[str, Any]] = []
    for attrs in attachment_nodes:
        uploaded_file_id = attrs.get("uploaded_file_id")
        if not isinstance(uploaded_file_id, str) or not uploaded_file_id.strip():
            continue

        uploaded_file_id = uploaded_file_id.strip()
        file_entry = files_by_id.get(uploaded_file_id)
        references.append(
            {
                "uploaded_file_id": uploaded_file_id,
                "filename": attrs.get("filename") or (file_entry or {}).get("filename"),
                "file_type": attrs.get("file_type") or (file_entry or {}).get("file_type"),
                "relative_path": (file_entry or {}).get("relative_path"),
                "slot_id": (file_entry or {}).get("slot_id"),
                "part_id": (file_entry or {}).get("part_id"),
                "part_no": attrs.get("part_no") or (file_entry or {}).get("part_no"),
                "slot_name": attrs.get("slot_name") or (file_entry or {}).get("slot_name"),
                "group_type": attrs.get("group_type") or (file_entry or {}).get("group_type"),
                "exists_on_disk": (file_entry or {}).get("exists_on_disk"),
                "attrs": attrs,
            }
        )

    return references


def write_project_metadata(project_id: str, db: Session) -> str:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise RuntimeError("项目不存在，无法写入 metadata")
    if not project.root_path:
        raise RuntimeError("项目根目录不存在，无法写入 metadata")

    project_root = os.path.abspath(project.root_path)
    os.makedirs(project_root, exist_ok=True)

    parts = (
        db.query(Part)
        .filter(Part.project_id == project_id)
        .order_by(Part.sort_order, Part.created_at, Part.id)
        .all()
    )
    slots = (
        db.query(DocumentSlot)
        .filter(DocumentSlot.project_id == project_id)
        .order_by(DocumentSlot.part_id, DocumentSlot.group_type, DocumentSlot.document_type, DocumentSlot.created_at, DocumentSlot.id)
        .all()
    )
    uploaded_files = (
        db.query(UploadedFile)
        .join(DocumentSlot, UploadedFile.slot_id == DocumentSlot.id)
        .filter(DocumentSlot.project_id == project_id)
        .order_by(UploadedFile.uploaded_at, UploadedFile.created_at, UploadedFile.id)
        .all()
    )
    summary_histories = (
        db.query(ProjectSummaryHistory)
        .filter(ProjectSummaryHistory.project_id == project_id)
        .order_by(ProjectSummaryHistory.version_no, ProjectSummaryHistory.created_at, ProjectSummaryHistory.id)
        .all()
    )

    part_map = {part.id: part for part in parts}
    slot_map = {slot.id: slot for slot in slots}

    file_entries = [
        _build_file_entry(project_root, uploaded_file, slot_map[uploaded_file.slot_id], part_map[slot_map[uploaded_file.slot_id].part_id], db)
        for uploaded_file in uploaded_files
        if uploaded_file.slot_id in slot_map and slot_map[uploaded_file.slot_id].part_id in part_map
    ]
    files_by_id = {entry["uploaded_file_id"]: entry for entry in file_entries}
    current_summary_json = _deserialize_json_text(project.summary_json)

    metadata = {
        "format_version": METADATA_FORMAT_VERSION,
        "generated_at": _serialize_datetime(datetime.utcnow()),
        "project": {
            "id": project.id,
            "name": project.project_name,
            "customer": project.customer_name,
            "internal_code": project.internal_code,
            "project_list_name": project.project_list_name,
            "revenue": project.annual_revenue_estimate,
            "owner_engineer": project.engineer_name,
            "pm": project.pm_name,
            "created_at": _serialize_datetime(project.created_at),
            "updated_at": _serialize_datetime(project.updated_at),
        },
        "parts": [
            {
                "id": part.id,
                "part_no": part.part_no,
                "part_name": part.part_name,
                "part_type": part.part_type.type_name if part.part_type else None,
                "parent_part_id": part.parent_part_id,
                "parent_part_no": part.parent_part.part_no if part.parent_part else None,
                "remark": part.remark,
                "sort_order": part.sort_order,
                "created_at": _serialize_datetime(part.created_at),
            }
            for part in parts
        ],
        "slots": [
            {
                "id": slot.id,
                "project_id": slot.project_id,
                "part_id": slot.part_id,
                "group_type": slot.group_type,
                "document_type": slot.document_type,
                "name": slot.document_type,
                "sort_order": None,
                "has_file": slot.has_file,
                "latest_filename": slot.latest_filename,
                "latest_upload_at": _serialize_datetime(slot.latest_upload_at),
                "note": slot.note,
                "created_at": _serialize_datetime(slot.created_at),
            }
            for slot in slots
        ],
        "files": file_entries,
        "summary": {
            "summary_json": current_summary_json,
            "legacy_summary_html": project.summary_html,
            "updated_at": _serialize_datetime(project.summary_updated_at),
        },
        "summary_history": [
            {
                "id": history.id,
                "version": history.version_no,
                "created_at": _serialize_datetime(history.created_at),
                "summary_json": _deserialize_json_text(history.summary_json),
                "legacy_summary_html": history.summary_html,
            }
            for history in summary_histories
        ],
        "file_references": _build_file_references(project_root, current_summary_json, files_by_id),
    }

    metadata_path = os.path.join(project_root, METADATA_FILENAME)
    with open(metadata_path, "w", encoding="utf-8") as fp:
        json.dump(metadata, fp, ensure_ascii=False, indent=2)

    return metadata_path
