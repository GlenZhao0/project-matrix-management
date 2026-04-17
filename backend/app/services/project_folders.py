import os
import re
import logging
import shutil
import subprocess
from typing import Optional, Tuple
from sqlalchemy.orm import Session

from app.models import DocumentSlot, Project, Part
from app.services.system_settings import get_system_path_value

logger = logging.getLogger(__name__)

PROJECT_PARTS = ["Part A", "Part B", "Part C"]
GROUP_DIRS = ["外来文件", "内部文件"]
DOCUMENT_TYPES = ["CBD", "FAI", "CPK", "DFM", "DWG"]
INVALID_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]+')
PROJECT_METADATA_FILENAME = ".project_meta.json"


def sanitize_dir_name(value: str) -> str:
    if not isinstance(value, str):
        return ""

    cleaned = value.strip()
    cleaned = INVALID_FILENAME_CHARS.sub("_", cleaned)
    cleaned = re.sub(r"[\s_]+", "_", cleaned)
    cleaned = cleaned.strip("_")

    if not cleaned:
        return "unnamed"

    return cleaned


def get_project_root_dir() -> str:
    root_dir = get_system_path_value("project_root")
    os.makedirs(root_dir, exist_ok=True)
    return root_dir


def get_project_exports_dir() -> str:
    exports_dir = get_system_path_value("export_root")
    os.makedirs(exports_dir, exist_ok=True)
    return exports_dir


def set_project_exports_dir(path: str) -> str:
    from app.services.system_settings import update_system_path_settings, get_system_path_settings

    current_settings = get_system_path_settings()
    updated_settings = update_system_path_settings(
        project_root=current_settings["project_root"],
        import_root=current_settings["import_root"],
        export_root=path,
    )
    return updated_settings["export_root"]


def get_staging_upload_dir() -> str:
    path = get_system_path_value("import_root")
    os.makedirs(path, exist_ok=True)
    return path


def build_project_folder_name(customer_name: str, project_name: str) -> str:
    safe_customer = sanitize_dir_name(customer_name)
    safe_project = sanitize_dir_name(project_name)
    folder_name = f"{safe_customer}_{safe_project}".strip("_")
    return folder_name or "project"


def create_project_folders(customer_name: str, project_name: str) -> str:
    root_dir = get_project_root_dir()
    project_folder_name = build_project_folder_name(customer_name, project_name)
    project_root_path = os.path.join(root_dir, project_folder_name)

    try:
        os.makedirs(project_root_path, exist_ok=True)
        return project_root_path
    except OSError as exc:
        logger.exception("项目目录创建失败: %s", exc)
        raise RuntimeError(f"项目目录创建失败: {exc}") from exc


def delete_project_folder(project: Project) -> bool:
    if not project.root_path:
        return False

    normalized_path = os.path.abspath(project.root_path)
    project_root_dir = get_project_root_dir()

    if not normalized_path.startswith(project_root_dir + os.sep):
        raise RuntimeError("项目目录不在允许删除范围内")

    if not os.path.isdir(normalized_path):
        return False

    try:
        shutil.rmtree(normalized_path)
        return True
    except Exception as exc:
        logger.exception("删除项目目录失败: %s", exc)
        raise RuntimeError(f"删除项目目录失败: {exc}") from exc


def get_project_target_folder_path(project: Project) -> Tuple[Optional[str], bool]:
    if not project.root_path:
        return None, False

    path = os.path.abspath(project.root_path)
    return path, os.path.isdir(path)


def is_project_folder_in_allowed_delete_scope(project: Project) -> bool:
    project_path, project_exists = get_project_target_folder_path(project)
    if not project_path or not project_exists:
        return False

    project_root_dir = get_project_root_dir()
    return project_path.startswith(project_root_dir + os.sep)


def _remove_empty_child_directories(root_path: str) -> None:
    for current_root, dirs, _files in os.walk(root_path, topdown=False):
        for directory in dirs:
            dir_path = os.path.join(current_root, directory)
            if os.path.isdir(dir_path) and not os.listdir(dir_path):
                os.rmdir(dir_path)


def _is_project_metadata_file(root_path: str, file_path: str) -> bool:
    try:
        return (
            os.path.basename(file_path) == PROJECT_METADATA_FILENAME
            and os.path.dirname(os.path.abspath(file_path)) == os.path.abspath(root_path)
        )
    except OSError:
        return False


def count_project_physical_files(project: Project) -> int:
    project_folder_path, project_folder_exists = get_project_target_folder_path(project)
    if not project_folder_path or not project_folder_exists:
        return 0

    file_count = 0
    for root, _dirs, files in os.walk(project_folder_path):
        for filename in files:
            file_path = os.path.join(root, filename)
            if _is_project_metadata_file(project_folder_path, file_path):
                continue
            if os.path.isfile(file_path):
                file_count += 1

    return file_count


def move_project_files_to_staging(project: Project) -> int:
    project_folder_path, project_folder_exists = get_project_target_folder_path(project)
    if not project_folder_path or not project_folder_exists:
        raise RuntimeError("项目目录不存在")

    if not is_project_folder_in_allowed_delete_scope(project):
        raise RuntimeError("项目目录不在允许自动处理范围内，不能自动转到待上传文件夹")

    staging_dir = get_staging_upload_dir()
    moved_count = 0

    try:
        for root, _dirs, files in os.walk(project_folder_path):
            for filename in files:
                source_path = os.path.join(root, filename)
                if _is_project_metadata_file(project_folder_path, source_path):
                    continue
                if not os.path.isfile(source_path):
                    continue

                target_path = _build_unique_staging_path(staging_dir, filename)
                shutil.move(source_path, target_path)
                moved_count += 1

        _remove_empty_child_directories(project_folder_path)
        return moved_count
    except Exception as exc:
        logger.exception("移动项目文件到待上传目录失败: %s", exc)
        raise RuntimeError(f"移动项目文件失败: {exc}") from exc

def get_part_target_folder_path(part: Part, db: Session) -> Tuple[Optional[str], bool]:
    try:
        project = db.query(Project).filter(Project.id == part.project_id).first()
        if not project or not project.root_path:
            return None, False

        path = os.path.join(project.root_path, part.part_name)
        return path, os.path.exists(path)
    except Exception as exc:
        logger.exception("计算 Part 目录路径失败: %s", exc)
        return None, False


def open_part_folder(part: Part, db: Session) -> str:
    target_folder_path, target_folder_exists = get_part_target_folder_path(part, db)
    if not target_folder_path or not target_folder_exists:
        raise RuntimeError("Part 目录不存在")

    try:
        subprocess.run(["open", target_folder_path], check=True)
        return target_folder_path
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"打开目录失败: {exc}") from exc


def _build_unique_staging_path(staging_dir: str, filename: str) -> str:
    base_name, ext = os.path.splitext(filename)
    candidate = os.path.join(staging_dir, filename)
    counter = 1

    while os.path.exists(candidate):
        candidate = os.path.join(staging_dir, f"{base_name}_{counter}{ext}")
        counter += 1

    return candidate


def move_part_files_to_staging(part: Part, db: Session) -> int:
    part_folder_path, part_folder_exists = get_part_target_folder_path(part, db)
    if not part_folder_path or not part_folder_exists:
        raise RuntimeError("Part 目录不存在")

    staging_dir = get_staging_upload_dir()
    moved_count = 0

    try:
        for root, _dirs, files in os.walk(part_folder_path):
            for filename in files:
                source_path = os.path.join(root, filename)
                if not os.path.isfile(source_path):
                    continue

                target_path = _build_unique_staging_path(staging_dir, filename)
                shutil.move(source_path, target_path)
                moved_count += 1

        for root, dirs, _files in os.walk(part_folder_path, topdown=False):
            for directory in dirs:
                dir_path = os.path.join(root, directory)
                if os.path.isdir(dir_path) and not os.listdir(dir_path):
                    os.rmdir(dir_path)
            if os.path.isdir(root) and root != part_folder_path and not os.listdir(root):
                os.rmdir(root)

        return moved_count
    except Exception as exc:
        logger.exception("移动 Part 文件到待上传目录失败: %s", exc)
        raise RuntimeError(f"移动文件失败: {exc}") from exc


def count_part_physical_files(part: Part, db: Session) -> int:
    part_folder_path, part_folder_exists = get_part_target_folder_path(part, db)
    if not part_folder_path or not part_folder_exists:
        return 0

    file_count = 0
    for root, _dirs, files in os.walk(part_folder_path):
        for filename in files:
            if os.path.isfile(os.path.join(root, filename)):
                file_count += 1

    return file_count


def delete_part_folder(part: Part, db: Session) -> bool:
    part_folder_path, part_folder_exists = get_part_target_folder_path(part, db)
    if not part_folder_path or not part_folder_exists:
        return False

    try:
        shutil.rmtree(part_folder_path)
        return True
    except Exception as exc:
        logger.exception("删除 Part 目录失败: %s", exc)
        raise RuntimeError(f"删除 Part 目录失败: {exc}") from exc


def create_slot_folder(slot: DocumentSlot, db: Session) -> str:
    """
    确保槽位的目标目录存在，如果不存在则创建。
    返回目标目录路径。
    """
    try:
        project = db.query(Project).filter(Project.id == slot.project_id).first()
        if not project or not project.root_path:
            raise RuntimeError("项目根目录不存在")

        part = db.query(Part).filter(Part.id == slot.part_id).first()
        if not part:
            raise RuntimeError("Part 不存在")

        group_dir = "外来文件" if slot.group_type == "external" else "内部文件"
        target_path = os.path.join(project.root_path, part.part_name, group_dir, slot.document_type)

        os.makedirs(target_path, exist_ok=True)
        return target_path
    except Exception as exc:
        logger.exception("创建槽位目录失败: %s", exc)
        raise RuntimeError(f"创建槽位目录失败: {exc}") from exc


def get_slot_target_folder_path(slot: DocumentSlot, db: Session) -> Tuple[Optional[str], bool]:
    """
    计算槽位的目标目录路径，并确保目录存在。
    返回 (path, exists)
    """
    try:
        project = db.query(Project).filter(Project.id == slot.project_id).first()
        if not project or not project.root_path:
            return None, False

        part = db.query(Part).filter(Part.id == slot.part_id).first()
        if not part:
            return None, False

        group_dir = "外来文件" if slot.group_type == "external" else "内部文件"
        path = os.path.join(project.root_path, part.part_name, group_dir, slot.document_type)

        # 确保目录存在
        os.makedirs(path, exist_ok=True)
        exists = os.path.exists(path)
        return path, exists
    except Exception as exc:
        logger.exception("计算槽位目标路径失败: %s", exc)
        return None, False


def build_slot_target_folder_path(slot: DocumentSlot, db: Session) -> Tuple[Optional[str], bool]:
    try:
        project = db.query(Project).filter(Project.id == slot.project_id).first()
        if not project or not project.root_path:
            return None, False

        part = db.query(Part).filter(Part.id == slot.part_id).first()
        if not part:
            return None, False

        group_dir = "外来文件" if slot.group_type == "external" else "内部文件"
        path = os.path.join(project.root_path, part.part_name, group_dir, slot.document_type)
        return path, os.path.exists(path)
    except Exception as exc:
        logger.exception("计算槽位原始目标路径失败: %s", exc)
        return None, False
