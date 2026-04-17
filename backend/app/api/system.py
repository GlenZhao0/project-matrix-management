import os
import subprocess

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import (
    DirectoryPathResponse,
    DirectorySelectionRequest,
    SystemPathSettingsResponse,
    SystemPathSettingsUpdateRequest,
)
from app.services.system_settings import (
    get_system_path_settings,
    update_system_path_settings,
    validate_directory_path,
)

router = APIRouter(prefix="/system", tags=["system"])


def _escape_applescript_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _select_directory_with_finder(title: str | None = None, initial_path: str | None = None) -> str:
    prompt = _escape_applescript_string(title or "请选择目录")
    default_location_clause = ""

    if initial_path:
        normalized_path = os.path.abspath(os.path.expanduser(initial_path))
        if os.path.isdir(normalized_path):
            escaped_path = _escape_applescript_string(normalized_path)
            default_location_clause = f'default location POSIX file "{escaped_path}" '

    script = (
        f'set selectedFolder to choose folder with prompt "{prompt}" {default_location_clause}\n'
        'POSIX path of selectedFolder'
    )

    completed = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
        text=True,
    )

    if completed.returncode != 0:
        stderr = (completed.stderr or "").strip()
        if "User canceled" in stderr or "(-128)" in stderr:
            raise ValueError("已取消目录选择")
        raise RuntimeError(stderr or "目录选择失败")

    selected_path = (completed.stdout or "").strip()
    if not selected_path:
        raise RuntimeError("目录选择失败")

    return os.path.abspath(os.path.expanduser(selected_path))


@router.get("/settings", response_model=SystemPathSettingsResponse)
def get_system_settings(db: Session = Depends(get_db)):
    return SystemPathSettingsResponse(**get_system_path_settings(db))


@router.put("/settings", response_model=SystemPathSettingsResponse)
def update_system_settings(payload: SystemPathSettingsUpdateRequest, db: Session = Depends(get_db)):
    return SystemPathSettingsResponse(
        **update_system_path_settings(
            project_root=payload.project_root,
            import_root=payload.import_root,
            export_root=payload.export_root,
            theme=payload.theme,
            db=db,
        )
    )


@router.post("/settings/validate", response_model=SystemPathSettingsResponse)
def validate_system_settings(payload: SystemPathSettingsUpdateRequest):
    project_root = os.path.abspath(os.path.expanduser(payload.project_root))
    import_root = os.path.abspath(os.path.expanduser(payload.import_root))
    export_root = os.path.abspath(os.path.expanduser(payload.export_root))

    return SystemPathSettingsResponse(
        project_root=project_root,
        import_root=import_root,
        export_root=export_root,
        theme=payload.theme,
        validations={
            "project_root": validate_directory_path(project_root),
            "import_root": validate_directory_path(import_root),
            "export_root": validate_directory_path(export_root),
        },
        updated_at=None,
    )


@router.get("/export-root", response_model=DirectoryPathResponse)
def get_export_root(db: Session = Depends(get_db)):
    settings = get_system_path_settings(db)
    return DirectoryPathResponse(path=settings["export_root"])


@router.post("/export-root", response_model=DirectoryPathResponse)
def update_export_root(payload: DirectoryPathResponse, db: Session = Depends(get_db)):
    current_settings = get_system_path_settings(db)
    updated = update_system_path_settings(
        project_root=current_settings["project_root"],
        import_root=current_settings["import_root"],
        export_root=payload.path,
        theme=current_settings["theme"],
        db=db,
    )
    return DirectoryPathResponse(path=updated["export_root"])


@router.post("/select-directory", response_model=DirectoryPathResponse)
def select_directory(payload: DirectorySelectionRequest):
    try:
        return DirectoryPathResponse(
            path=_select_directory_with_finder(payload.title, payload.initial_path)
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"目录选择失败: {exc}")
