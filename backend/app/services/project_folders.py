import os
import re
import logging
from sqlalchemy.orm import Session

import config
from app.models import DocumentSlot, Project, Part

logger = logging.getLogger(__name__)

PROJECT_PARTS = ["Part A", "Part B", "Part C"]
GROUP_DIRS = ["外来文件", "内部文件"]
DOCUMENT_TYPES = ["CBD", "FAI", "CPK", "DFM", "DWG"]
INVALID_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]+')


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
    root_dir = getattr(config, "PROJECT_ROOT_DIR", "~/projects_data")
    return os.path.abspath(os.path.expanduser(root_dir))


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

        for part_name in PROJECT_PARTS:
            part_path = os.path.join(project_root_path, part_name)
            os.makedirs(part_path, exist_ok=True)

            for group_dir in GROUP_DIRS:
                group_path = os.path.join(part_path, group_dir)
                os.makedirs(group_path, exist_ok=True)

                for document_type in DOCUMENT_TYPES:
                    document_path = os.path.join(group_path, document_type)
                    os.makedirs(document_path, exist_ok=True)

        return project_root_path
    except OSError as exc:
        logger.exception("项目目录创建失败: %s", exc)
        raise RuntimeError(f"项目目录创建失败: {exc}") from exc


def get_slot_target_folder_path(slot: DocumentSlot, db: Session) -> tuple[str | None, bool]:
    """
    计算槽位的目标目录路径，并检查是否存在。
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
        exists = os.path.exists(path)
        return path, exists
    except Exception as exc:
        logger.exception("计算槽位目标路径失败: %s", exc)
        return None, False
