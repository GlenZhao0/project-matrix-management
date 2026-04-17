import json
import os
import shutil
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models import DocumentSlot, Part, PartType, Project, ProjectSummaryHistory, UploadedFile
from app.services.project_folders import create_project_folders, create_slot_folder
from app.services.project_metadata import METADATA_FILENAME, write_project_metadata


def _parse_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    return datetime.fromisoformat(value)


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


def _load_manifest(backup_dir: str) -> Dict[str, Any]:
    manifest_path = os.path.join(backup_dir, "manifest.json")
    if not os.path.isfile(manifest_path):
        raise ValueError("备份目录中缺少 manifest.json")

    with open(manifest_path, "r", encoding="utf-8") as fp:
        manifest = json.load(fp)

    required_top_level_fields = {
        "format_version",
        "project",
        "parts",
        "slots",
        "uploaded_files",
        "warnings",
    }
    missing_fields = [field for field in required_top_level_fields if field not in manifest]
    if missing_fields:
        raise ValueError(f"manifest.json 缺少字段: {', '.join(missing_fields)}")

    if manifest.get("format_version") != 1:
        raise ValueError("当前仅支持 format_version = 1 的备份目录")

    project_data = manifest.get("project") or {}
    if not project_data.get("customer_name") or not project_data.get("project_name"):
        raise ValueError("manifest.project 缺少 customer_name 或 project_name")

    return manifest


def _load_project_directory_metadata(project_dir: str) -> Dict[str, Any]:
    metadata_path = os.path.join(project_dir, METADATA_FILENAME)
    if not os.path.isfile(metadata_path):
        raise ValueError(f"项目目录中缺少 {METADATA_FILENAME}")

    with open(metadata_path, "r", encoding="utf-8") as fp:
        metadata = json.load(fp)

    required_top_level_fields = {
        "format_version",
        "project",
        "parts",
        "slots",
        "files",
        "summary",
        "summary_history",
    }
    missing_fields = [field for field in required_top_level_fields if field not in metadata]
    if missing_fields:
        raise ValueError(f"{METADATA_FILENAME} 缺少字段: {', '.join(missing_fields)}")

    if metadata.get("format_version") != 1:
        raise ValueError(f"当前仅支持 format_version = 1 的 {METADATA_FILENAME}")

    project_data = metadata.get("project") or {}
    if not project_data.get("customer") or not project_data.get("name"):
        raise ValueError(f"{METADATA_FILENAME}.project 缺少 customer 或 name")

    return metadata


def scan_project_directory_root(root_dir: str) -> List[Dict[str, Any]]:
    root_dir = os.path.abspath(os.path.expanduser(root_dir))
    if not os.path.isdir(root_dir):
        raise ValueError("扫描目录不存在")

    candidates: List[Dict[str, Any]] = []
    child_dirs = [
        entry
        for entry in os.scandir(root_dir)
        if entry.is_dir()
    ]
    child_dirs.sort(key=lambda entry: entry.name.lower())

    for entry in child_dirs:
        metadata_path = os.path.join(entry.path, METADATA_FILENAME)
        if not os.path.isfile(metadata_path):
            continue

        try:
            metadata = _load_project_directory_metadata(entry.path)
        except Exception:
            # Skip malformed candidates and keep the scan resilient.
            continue

        project_data = metadata.get("project") or {}
        updated_at = (
            project_data.get("updated_at")
            or (metadata.get("summary") or {}).get("updated_at")
        )

        if not updated_at:
            updated_at = datetime.fromtimestamp(os.path.getmtime(metadata_path)).isoformat()

        candidates.append(
            {
                "project_name": project_data.get("name") or entry.name,
                "customer_name": project_data.get("customer") or "",
                "internal_code": project_data.get("internal_code"),
                "updated_at": _parse_datetime(updated_at),
                "path": entry.path,
            }
        )

    return candidates


def _build_import_project_name(db: Session, customer_name: str, project_name: str) -> str:
    base_name = f"{project_name} (Imported)"
    candidate = base_name
    counter = 2

    while (
        db.query(Project)
        .filter(Project.customer_name == customer_name, Project.project_name == candidate)
        .first()
        is not None
    ):
        candidate = f"{base_name} {counter}"
        counter += 1

    return candidate


def _build_directory_import_project_name(
    db: Session,
    customer_name: str,
    project_name: str,
) -> Tuple[str, bool]:
    existing = (
        db.query(Project.id)
        .filter(Project.customer_name == customer_name, Project.project_name == project_name)
        .first()
    )
    if existing is None:
        return project_name, False

    return _build_import_project_name(db, customer_name, project_name), True


def _get_or_create_part_type(part_type_name: Optional[str], db: Session) -> Optional[PartType]:
    if not part_type_name:
        return None

    normalized_name = part_type_name.strip()
    if not normalized_name:
        return None

    part_type = db.query(PartType).filter(PartType.type_name == normalized_name).first()
    if part_type:
        return part_type

    part_type = PartType(
        id=str(uuid.uuid4()),
        type_name=normalized_name,
        created_at=datetime.utcnow(),
    )
    db.add(part_type)
    db.flush()
    return part_type


def _safe_remove_tree(path: Optional[str]) -> None:
    if path and os.path.isdir(path):
        shutil.rmtree(path, ignore_errors=True)


def _has_missing_file_warning(warnings: List[Dict[str, Any]]) -> bool:
    return any(warning.get("code") == "BACKUP_FILE_MISSING" for warning in warnings)


def _is_cleanup_eligible(warnings: List[Dict[str, Any]]) -> bool:
    return not _has_missing_file_warning(warnings)


def _cleanup_imported_backup_dir(backup_dir: str) -> Tuple[str, int, int, List[Dict[str, Any]]]:
    cleanup_warnings: List[Dict[str, Any]] = []
    normalized_backup_dir = os.path.abspath(os.path.expanduser(backup_dir))

    if not os.path.isdir(normalized_backup_dir):
        cleanup_warnings.append(
            _build_warning(
                code="PACKAGE_CLEANUP_FAILED",
                level="warning",
                message="备份包目录不存在，无法清理",
                original_relative_path=normalized_backup_dir,
            )
        )
        return "retained_cleanup_failed", 0, 1, cleanup_warnings

    if not os.path.isfile(os.path.join(normalized_backup_dir, "manifest.json")):
        cleanup_warnings.append(
            _build_warning(
                code="PACKAGE_CLEANUP_FAILED",
                level="warning",
                message="目标目录不是标准备份包目录，已保留",
                original_relative_path=normalized_backup_dir,
            )
        )
        return "retained_cleanup_failed", 0, 1, cleanup_warnings

    try:
        shutil.rmtree(normalized_backup_dir)
        return "deleted", 1, 0, cleanup_warnings
    except Exception as exc:
        cleanup_warnings.append(
            _build_warning(
                code="PACKAGE_CLEANUP_FAILED",
                level="warning",
                message=f"导入成功，但备份包目录删除失败: {exc}",
                original_relative_path=normalized_backup_dir,
            )
        )
        return "retained_cleanup_failed", 0, 1, cleanup_warnings


def _validate_source_reference(
    manifest_items: List[Dict[str, Any]],
    required_field: str,
    item_label: str,
) -> None:
    for item in manifest_items:
        if required_field not in item:
            raise ValueError(f"manifest.{item_label} 缺少字段 {required_field}")


def _normalize_relative_path(relative_path: str) -> str:
    normalized = (relative_path or "").replace("\\", "/").strip()
    if not normalized:
        raise ValueError("metadata 文件缺少 relative_path")
    if os.path.isabs(normalized):
        raise ValueError(f"metadata 文件包含绝对路径: {normalized}")

    parts = [part for part in normalized.split("/") if part not in {"", "."}]
    if any(part == ".." for part in parts):
        raise ValueError(f"metadata 文件包含非法相对路径: {normalized}")

    return "/".join(parts)


def _resolve_source_relative_path(project_dir: str, relative_path: str) -> str:
    normalized_relative_path = _normalize_relative_path(relative_path)
    source_path = os.path.abspath(os.path.join(project_dir, *normalized_relative_path.split("/")))
    project_dir_path = os.path.abspath(project_dir)

    if os.path.commonpath([project_dir_path, source_path]) != project_dir_path:
        raise ValueError(f"metadata 文件路径越界: {relative_path}")

    return source_path


def _rewrite_attachment_file_ids(value, file_id_map: Dict[str, str]):
    if isinstance(value, dict):
        rewritten = {
            key: _rewrite_attachment_file_ids(child, file_id_map)
            for key, child in value.items()
        }
        if rewritten.get("type") == "attachment":
            attrs = rewritten.get("attrs") or {}
            if isinstance(attrs, dict):
                uploaded_file_id = attrs.get("uploaded_file_id")
                if isinstance(uploaded_file_id, str) and uploaded_file_id in file_id_map:
                    attrs["uploaded_file_id"] = file_id_map[uploaded_file_id]
        return rewritten

    if isinstance(value, list):
        return [_rewrite_attachment_file_ids(child, file_id_map) for child in value]

    return value


def _select_slot_latest_file(imported_files: List[UploadedFile]) -> Optional[UploadedFile]:
    latest_marked = [item for item in imported_files if item.is_latest]
    candidates = latest_marked or imported_files
    if not candidates:
        return None
    return max(
        candidates,
        key=lambda item: (item.uploaded_at or datetime.min, item.created_at or datetime.min, item.id),
    )


def import_project_backup(backup_dir: str, db: Session) -> Dict[str, Any]:
    backup_dir = os.path.abspath(os.path.expanduser(backup_dir))
    if not os.path.isdir(backup_dir):
        raise ValueError("备份目录不存在")

    manifest = _load_manifest(backup_dir)
    project_data = manifest["project"]
    parts_data = manifest.get("parts") or []
    slots_data = manifest.get("slots") or []
    uploaded_files_data = manifest.get("uploaded_files") or []

    _validate_source_reference(parts_data, "source_part_id", "parts")
    _validate_source_reference(slots_data, "source_slot_id", "slots")
    _validate_source_reference(slots_data, "source_part_id", "slots")
    _validate_source_reference(uploaded_files_data, "source_uploaded_file_id", "uploaded_files")
    _validate_source_reference(uploaded_files_data, "source_slot_id", "uploaded_files")
    _validate_source_reference(uploaded_files_data, "relative_path", "uploaded_files")

    warnings: List[Dict[str, Any]] = []
    part_map: Dict[str, Part] = {}
    slot_map: Dict[str, DocumentSlot] = {}
    imported_files_by_slot: Dict[str, List[UploadedFile]] = {}

    imported_part_count = 0
    imported_slot_count = 0
    imported_file_count = 0
    missing_file_count = 0
    new_project_root_path: Optional[str] = None
    package_cleanup_status = "retained_import_failed"
    deleted_package_count = 0
    retained_package_count = 1

    try:
        imported_project_name = _build_import_project_name(
            db,
            customer_name=project_data["customer_name"],
            project_name=project_data["project_name"],
        )

        new_project = Project(
            id=str(uuid.uuid4()),
            customer_name=project_data["customer_name"],
            project_name=imported_project_name,
            template_name=project_data.get("template_name"),
            project_template_id=None,
            default_slot_template_id=None,
            created_at=_parse_datetime(project_data.get("created_at")) or datetime.utcnow(),
        )
        db.add(new_project)
        db.flush()

        new_project_root_path = create_project_folders(new_project.customer_name, new_project.project_name)
        new_project.root_path = new_project_root_path
        db.flush()

        for index, part_data in enumerate(parts_data):
            part_type = _get_or_create_part_type(part_data.get("part_type"), db)
            new_part = Part(
                id=str(uuid.uuid4()),
                project_id=new_project.id,
                part_no=part_data.get("part_no"),
                part_name=part_data.get("part_name") or f"Imported Part {index + 1}",
                part_type_id=part_type.id if part_type else None,
                parent_part_id=None,
                remark=part_data.get("remark"),
                sort_order=index,
                created_at=_parse_datetime(part_data.get("created_at")) or datetime.utcnow(),
            )
            db.add(new_part)
            db.flush()
            part_map[part_data["source_part_id"]] = new_part
            imported_part_count += 1

        for part_data in parts_data:
            source_parent_part_id = part_data.get("source_parent_part_id")
            if not source_parent_part_id:
                continue

            new_part = part_map[part_data["source_part_id"]]
            parent_part = part_map.get(source_parent_part_id)
            if not parent_part:
                warnings.append(
                    _build_warning(
                        code="SOURCE_PARENT_PART_NOT_FOUND",
                        level="warning",
                        message="来源父件不存在，已跳过父子关系恢复",
                        source_project_id=project_data.get("source_project_id"),
                        source_part_id=part_data["source_part_id"],
                    )
                )
                continue

            new_part.parent_part_id = parent_part.id

        for slot_data in slots_data:
            source_part_id = slot_data["source_part_id"]
            new_part = part_map.get(source_part_id)
            if not new_part:
                raise ValueError(f"manifest.slots 引用了不存在的 source_part_id: {source_part_id}")

            new_slot = DocumentSlot(
                id=str(uuid.uuid4()),
                project_id=new_project.id,
                part_id=new_part.id,
                group_type=slot_data.get("group_type"),
                document_type=slot_data.get("document_type"),
                has_file=False,
                latest_filename=None,
                latest_upload_at=None,
                note=slot_data.get("note"),
                created_at=_parse_datetime(slot_data.get("created_at")) or datetime.utcnow(),
            )
            db.add(new_slot)
            db.flush()
            slot_map[slot_data["source_slot_id"]] = new_slot
            imported_slot_count += 1

        files_root = os.path.join(backup_dir, "files")

        for file_data in uploaded_files_data:
            source_slot_id = file_data["source_slot_id"]
            new_slot = slot_map.get(source_slot_id)
            if not new_slot:
                raise ValueError(f"manifest.uploaded_files 引用了不存在的 source_slot_id: {source_slot_id}")

            relative_path = file_data.get("relative_path")
            if not relative_path:
                raise ValueError("manifest.uploaded_files 缺少 relative_path")

            source_file_path = os.path.join(files_root, *relative_path.split("/"))
            if not os.path.isfile(source_file_path):
                warnings.append(
                    _build_warning(
                        code="BACKUP_FILE_MISSING",
                        level="warning",
                        message="备份目录中的文件缺失，已跳过导入",
                        source_project_id=project_data.get("source_project_id"),
                        source_slot_id=source_slot_id,
                        source_uploaded_file_id=file_data["source_uploaded_file_id"],
                        relative_path=relative_path,
                        original_relative_path=file_data.get("original_relative_path"),
                    )
                )
                missing_file_count += 1
                continue

            target_slot_dir = create_slot_folder(new_slot, db)
            target_filename = os.path.basename(relative_path)
            target_file_path = os.path.join(target_slot_dir, target_filename)
            shutil.copy2(source_file_path, target_file_path)

            uploaded_at = _parse_datetime(file_data.get("uploaded_at")) or datetime.utcnow()
            new_uploaded_file = UploadedFile(
                id=str(uuid.uuid4()),
                slot_id=new_slot.id,
                filename=target_filename,
                uploaded_at=uploaded_at,
                remark=file_data.get("remark"),
                is_latest=bool(file_data.get("is_latest")),
                created_at=uploaded_at,
            )
            db.add(new_uploaded_file)
            db.flush()

            imported_files_by_slot.setdefault(source_slot_id, []).append(new_uploaded_file)
            imported_file_count += 1

        for source_slot_id, new_slot in slot_map.items():
            imported_files = imported_files_by_slot.get(source_slot_id, [])
            if not imported_files:
                continue

            latest_file = _select_slot_latest_file(imported_files)
            new_slot.has_file = True
            new_slot.latest_filename = latest_file.filename if latest_file else None
            new_slot.latest_upload_at = latest_file.uploaded_at if latest_file else None

        write_project_metadata(new_project.id, db)
        db.commit()
        db.refresh(new_project)

        if _is_cleanup_eligible(warnings):
            (
                package_cleanup_status,
                deleted_package_count,
                retained_package_count,
                cleanup_warnings,
            ) = _cleanup_imported_backup_dir(backup_dir)
            warnings.extend(cleanup_warnings)
        else:
            package_cleanup_status = "retained_missing_files"
            deleted_package_count = 0
            retained_package_count = 1
            warnings.append(
                _build_warning(
                    code="PACKAGE_CLEANUP_SKIPPED_MISSING_FILES",
                    level="warning",
                    message="存在缺失文件 warning，第一版策略保留备份包目录",
                    source_project_id=project_data.get("source_project_id"),
                    original_relative_path=backup_dir,
                )
            )

        return {
            "new_project_id": new_project.id,
            "imported_part_count": imported_part_count,
            "imported_slot_count": imported_slot_count,
            "imported_file_count": imported_file_count,
            "missing_file_count": missing_file_count,
            "package_cleanup_status": package_cleanup_status,
            "deleted_package_count": deleted_package_count,
            "retained_package_count": retained_package_count,
            "warning_count": len(warnings),
            "warnings": warnings,
        }
    except Exception:
        db.rollback()
        _safe_remove_tree(new_project_root_path)
        raise


def import_project_directory(project_dir: str, db: Session) -> Dict[str, Any]:
    project_dir = os.path.abspath(os.path.expanduser(project_dir))
    if not os.path.isdir(project_dir):
        raise ValueError("项目目录不存在")

    metadata = _load_project_directory_metadata(project_dir)
    project_data = metadata.get("project") or {}
    parts_data = metadata.get("parts") or []
    slots_data = metadata.get("slots") or []
    files_data = metadata.get("files") or []
    summary_data = metadata.get("summary") or {}
    summary_history_data = metadata.get("summary_history") or []

    warnings: List[Dict[str, Any]] = []
    part_map: Dict[str, Part] = {}
    slot_map: Dict[str, DocumentSlot] = {}
    file_id_map: Dict[str, str] = {}
    imported_files_by_slot: Dict[str, List[UploadedFile]] = {}

    imported_part_count = 0
    imported_slot_count = 0
    imported_file_count = 0
    imported_summary_history_count = 0
    missing_file_count = 0
    new_project_root_path: Optional[str] = None

    try:
        target_project_name, renamed_due_to_conflict = _build_directory_import_project_name(
            db,
            customer_name=project_data["customer"],
            project_name=project_data["name"],
        )
        if renamed_due_to_conflict:
            warnings.append(
                _build_warning(
                    code="PROJECT_NAME_CONFLICT_RENAMED",
                    level="warning",
                    message=f"同客户下已有同名项目，已导入为 {target_project_name}",
                    source_project_id=project_data.get("id"),
                )
            )

        new_project = Project(
            id=str(uuid.uuid4()),
            project_list_name=project_data.get("project_list_name"),
            internal_code=project_data.get("internal_code"),
            customer_name=project_data["customer"],
            project_name=target_project_name,
            annual_revenue_estimate=project_data.get("revenue"),
            engineer_name=project_data.get("owner_engineer"),
            pm_name=project_data.get("pm"),
            template_name=None,
            project_template_id=None,
            default_slot_template_id=None,
            created_at=_parse_datetime(project_data.get("created_at")) or datetime.utcnow(),
            updated_at=_parse_datetime(project_data.get("updated_at")) or datetime.utcnow(),
        )
        db.add(new_project)
        db.flush()

        new_project_root_path = create_project_folders(new_project.customer_name, new_project.project_name)
        new_project.root_path = new_project_root_path
        db.flush()

        sorted_parts_data = sorted(
            parts_data,
            key=lambda part: (
                part.get("sort_order") if part.get("sort_order") is not None else 0,
                part.get("created_at") or "",
                part.get("id") or "",
            ),
        )
        for index, part_data in enumerate(sorted_parts_data):
            source_part_id = part_data.get("id")
            if not source_part_id:
                raise ValueError(f"{METADATA_FILENAME}.parts 缺少字段 id")

            part_type = _get_or_create_part_type(part_data.get("part_type"), db)
            new_part = Part(
                id=str(uuid.uuid4()),
                project_id=new_project.id,
                part_no=part_data.get("part_no"),
                part_name=part_data.get("part_name") or f"Imported Part {index + 1}",
                part_type_id=part_type.id if part_type else None,
                parent_part_id=None,
                remark=part_data.get("remark"),
                sort_order=part_data.get("sort_order") if part_data.get("sort_order") is not None else index,
                created_at=_parse_datetime(part_data.get("created_at")) or datetime.utcnow(),
            )
            db.add(new_part)
            db.flush()
            part_map[source_part_id] = new_part
            imported_part_count += 1

        for part_data in sorted_parts_data:
            source_part_id = part_data["id"]
            source_parent_part_id = part_data.get("parent_part_id")
            if not source_parent_part_id:
                continue

            new_part = part_map[source_part_id]
            parent_part = part_map.get(source_parent_part_id)
            if not parent_part:
                warnings.append(
                    _build_warning(
                        code="METADATA_PARENT_PART_NOT_FOUND",
                        level="warning",
                        message="metadata 中的父件不存在，已跳过父子关系恢复",
                        source_project_id=project_data.get("id"),
                        source_part_id=source_part_id,
                    )
                )
                continue

            new_part.parent_part_id = parent_part.id

        sorted_slots_data = sorted(
            slots_data,
            key=lambda slot: (
                slot.get("part_id") or "",
                slot.get("group_type") or "",
                slot.get("document_type") or slot.get("name") or "",
                slot.get("created_at") or "",
                slot.get("id") or "",
            ),
        )
        for slot_data in sorted_slots_data:
            source_slot_id = slot_data.get("id")
            source_part_id = slot_data.get("part_id")
            if not source_slot_id or not source_part_id:
                raise ValueError(f"{METADATA_FILENAME}.slots 缺少字段 id 或 part_id")

            new_part = part_map.get(source_part_id)
            if not new_part:
                raise ValueError(f"{METADATA_FILENAME}.slots 引用了不存在的 part_id: {source_part_id}")

            document_type = slot_data.get("document_type") or slot_data.get("name")
            if not document_type:
                raise ValueError(f"{METADATA_FILENAME}.slots 缺少 document_type")

            new_slot = DocumentSlot(
                id=str(uuid.uuid4()),
                project_id=new_project.id,
                part_id=new_part.id,
                group_type=slot_data.get("group_type"),
                document_type=document_type,
                has_file=False,
                latest_filename=None,
                latest_upload_at=None,
                note=slot_data.get("note"),
                created_at=_parse_datetime(slot_data.get("created_at")) or datetime.utcnow(),
            )
            db.add(new_slot)
            db.flush()
            slot_map[source_slot_id] = new_slot
            imported_slot_count += 1

        for file_data in files_data:
            source_uploaded_file_id = file_data.get("uploaded_file_id")
            source_slot_id = file_data.get("slot_id")
            if not source_uploaded_file_id or not source_slot_id:
                raise ValueError(f"{METADATA_FILENAME}.files 缺少 uploaded_file_id 或 slot_id")

            new_slot = slot_map.get(source_slot_id)
            if not new_slot:
                raise ValueError(f"{METADATA_FILENAME}.files 引用了不存在的 slot_id: {source_slot_id}")

            relative_path = file_data.get("relative_path")
            if not relative_path:
                raise ValueError(f"{METADATA_FILENAME}.files 缺少 relative_path")

            source_file_path = _resolve_source_relative_path(project_dir, relative_path)
            if not os.path.isfile(source_file_path):
                warnings.append(
                    _build_warning(
                        code="PROJECT_FILE_MISSING",
                        level="warning",
                        message="项目目录中的文件缺失，已跳过索引恢复",
                        source_project_id=project_data.get("id"),
                        source_slot_id=source_slot_id,
                        source_uploaded_file_id=source_uploaded_file_id,
                        relative_path=_normalize_relative_path(relative_path),
                    )
                )
                missing_file_count += 1
                continue

            target_slot_dir = create_slot_folder(new_slot, db)
            target_filename = file_data.get("filename") or os.path.basename(source_file_path)
            target_file_path = os.path.join(target_slot_dir, target_filename)
            shutil.copy2(source_file_path, target_file_path)

            uploaded_at = _parse_datetime(file_data.get("uploaded_at")) or _parse_datetime(file_data.get("created_at")) or datetime.utcnow()
            created_at = _parse_datetime(file_data.get("created_at")) or uploaded_at
            new_uploaded_file = UploadedFile(
                id=str(uuid.uuid4()),
                slot_id=new_slot.id,
                filename=target_filename,
                uploaded_at=uploaded_at,
                remark=file_data.get("remark"),
                is_latest=bool(file_data.get("is_latest")),
                created_at=created_at,
            )
            db.add(new_uploaded_file)
            db.flush()

            file_id_map[source_uploaded_file_id] = new_uploaded_file.id
            imported_files_by_slot.setdefault(source_slot_id, []).append(new_uploaded_file)
            imported_file_count += 1

        for source_slot_id, new_slot in slot_map.items():
            imported_files = imported_files_by_slot.get(source_slot_id, [])
            if not imported_files:
                continue

            latest_file = _select_slot_latest_file(imported_files)
            new_slot.has_file = True
            new_slot.latest_filename = latest_file.filename if latest_file else None
            new_slot.latest_upload_at = latest_file.uploaded_at if latest_file else None

        rewritten_summary_json = _rewrite_attachment_file_ids(summary_data.get("summary_json"), file_id_map)
        new_project.summary_json = json.dumps(rewritten_summary_json, ensure_ascii=False) if rewritten_summary_json is not None else None
        new_project.summary_html = summary_data.get("legacy_summary_html") if rewritten_summary_json is None else None
        new_project.summary_updated_at = _parse_datetime(summary_data.get("updated_at"))

        sorted_summary_histories = sorted(
            summary_history_data,
            key=lambda item: (
                item.get("version") if item.get("version") is not None else 0,
                item.get("created_at") or "",
                item.get("id") or "",
            ),
        )
        for history_data in sorted_summary_histories:
            rewritten_history_json = _rewrite_attachment_file_ids(history_data.get("summary_json"), file_id_map)
            history = ProjectSummaryHistory(
                id=str(uuid.uuid4()),
                project_id=new_project.id,
                version_no=history_data.get("version") if history_data.get("version") is not None else imported_summary_history_count + 1,
                summary_json=json.dumps(rewritten_history_json, ensure_ascii=False) if rewritten_history_json is not None else None,
                summary_html=history_data.get("legacy_summary_html") if rewritten_history_json is None else None,
                created_at=_parse_datetime(history_data.get("created_at")) or datetime.utcnow(),
            )
            db.add(history)
            imported_summary_history_count += 1

        db.flush()
        write_project_metadata(new_project.id, db)
        db.commit()
        db.refresh(new_project)

        return {
            "new_project_id": new_project.id,
            "imported_part_count": imported_part_count,
            "imported_slot_count": imported_slot_count,
            "imported_file_count": imported_file_count,
            "imported_summary_history_count": imported_summary_history_count,
            "missing_file_count": missing_file_count,
            "warning_count": len(warnings),
            "warnings": warnings,
        }
    except Exception:
        db.rollback()
        _safe_remove_tree(new_project_root_path)
        raise
