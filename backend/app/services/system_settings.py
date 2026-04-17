import os
from datetime import datetime
from pathlib import Path
from typing import Any

import config
from app.database import SessionLocal
from app.models import SystemSettings


SETTINGS_SINGLETON_ID = "system-settings"
REPO_ROOT = Path(__file__).resolve().parents[3]


def normalize_path(path: str) -> str:
    return os.path.abspath(os.path.expanduser(path.strip()))


def get_default_system_paths() -> dict[str, str]:
    return {
        "project_root": normalize_path(getattr(config, "PROJECT_ROOT_DIR", "~/projects_data")),
        "import_root": normalize_path(getattr(config, "STAGING_UPLOAD_DIR", "~/projects_inbox")),
        "export_root": normalize_path(str(REPO_ROOT / "exports")),
    }


def normalize_theme(theme: str | None) -> str:
    normalized = (theme or "system").strip().lower()
    if normalized not in {"light", "dark", "system"}:
        return "system"
    return normalized


def validate_directory_path(path: str) -> dict[str, Any]:
    normalized_path = normalize_path(path)
    exists = os.path.exists(normalized_path)
    is_directory = os.path.isdir(normalized_path)

    writable = False
    can_create = False

    if exists and is_directory:
        writable = os.access(normalized_path, os.W_OK)
    elif not exists:
        parent_dir = os.path.dirname(normalized_path) or normalized_path
        can_create = os.path.isdir(parent_dir) and os.access(parent_dir, os.W_OK)

    if exists and not is_directory:
        message = "路径存在，但不是目录"
    elif exists and not writable:
        message = "目录存在，但当前进程没有写权限"
    elif exists:
        message = "目录有效，可直接使用"
    elif can_create:
        message = "目录当前不存在，但父目录可写，系统可在使用时创建"
    else:
        message = "目录不存在，且当前环境无法直接创建"

    return {
        "path": normalized_path,
        "exists": exists,
        "is_directory": is_directory,
        "writable": writable,
        "can_create": can_create,
        "message": message,
    }


def _get_or_create_settings_record(db) -> SystemSettings:
    settings = db.query(SystemSettings).filter(SystemSettings.id == SETTINGS_SINGLETON_ID).first()
    if settings:
        return settings

    defaults = get_default_system_paths()
    settings = SystemSettings(
        id=SETTINGS_SINGLETON_ID,
        project_root=defaults["project_root"],
        import_root=defaults["import_root"],
        export_root=defaults["export_root"],
        theme="system",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def get_system_path_settings(db=None) -> dict[str, Any]:
    owns_session = db is None
    session = db or SessionLocal()

    try:
        settings = _get_or_create_settings_record(session)
        defaults = get_default_system_paths()
        payload = {
            "project_root": normalize_path(settings.project_root or defaults["project_root"]),
            "import_root": normalize_path(settings.import_root or defaults["import_root"]),
            "export_root": normalize_path(settings.export_root or defaults["export_root"]),
            "theme": normalize_theme(settings.theme),
            "updated_at": settings.updated_at,
        }
        payload["validations"] = {
            key: validate_directory_path(payload[key])
            for key in ("project_root", "import_root", "export_root")
        }
        return payload
    finally:
        if owns_session:
            session.close()


def update_system_path_settings(
    *,
    project_root: str,
    import_root: str,
    export_root: str,
    theme: str,
    db=None,
) -> dict[str, Any]:
    owns_session = db is None
    session = db or SessionLocal()

    try:
        settings = _get_or_create_settings_record(session)
        settings.project_root = normalize_path(project_root)
        settings.import_root = normalize_path(import_root)
        settings.export_root = normalize_path(export_root)
        settings.theme = normalize_theme(theme)
        settings.updated_at = datetime.utcnow()
        session.commit()
        session.refresh(settings)
        return get_system_path_settings(session)
    finally:
        if owns_session:
            session.close()


def get_system_path_value(path_key: str) -> str:
    settings = get_system_path_settings()
    if path_key not in settings:
        raise KeyError(f"unknown system path key: {path_key}")
    return settings[path_key]
