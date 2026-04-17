from pydantic import BaseModel
from datetime import datetime
from typing import Any, Dict, Optional, List

class ProjectCreate(BaseModel):
    project_list_name: Optional[str] = "默认清单"
    internal_code: Optional[str] = None
    customer_name: str
    project_name: str
    annual_revenue_estimate: Optional[str] = None
    engineer_name: Optional[str] = None
    pm_name: Optional[str] = None
    template_name: Optional[str] = None
    project_template_id: Optional[str] = None


class ProjectUpdate(BaseModel):
    project_list_name: Optional[str] = "默认清单"
    internal_code: Optional[str] = None
    customer_name: str
    project_name: str
    annual_revenue_estimate: Optional[str] = None
    engineer_name: Optional[str] = None
    pm_name: Optional[str] = None
    template_name: Optional[str] = None
    project_template_id: Optional[str] = None


class ProjectSummaryUpdate(BaseModel):
    summary_json: Optional[Dict[str, Any]] = None


class ProjectListRenameRequest(BaseModel):
    old_name: str
    new_name: str


class ProjectListMutationResponse(BaseModel):
    message: str


class ProjectSummaryHistoryResponse(BaseModel):
    id: str
    project_id: str
    version_no: int
    summary_json: Optional[Dict[str, Any]]
    legacy_summary_html: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SystemPathValidationResponse(BaseModel):
    path: str
    exists: bool
    is_directory: bool
    writable: bool
    can_create: bool
    message: str


class SystemPathSettingsUpdateRequest(BaseModel):
    project_root: str
    import_root: str
    export_root: str
    theme: str = "system"


class SystemPathSettingsResponse(BaseModel):
    project_root: str
    import_root: str
    export_root: str
    theme: str = "system"
    validations: Dict[str, SystemPathValidationResponse]
    updated_at: Optional[datetime] = None


class ApplyTemplateRequest(BaseModel):
    template_id: str


class ProjectPartCreate(BaseModel):
    part_no: str
    part_name: str
    part_type: Optional[str] = None
    parent_part_no: Optional[str] = None
    remark: Optional[str] = None
    slot_template_id: Optional[str] = None


class ProjectPartUpdate(BaseModel):
    part_type: Optional[str] = None
    parent_part_no: Optional[str] = None
    remark: Optional[str] = None

class ProjectResponse(BaseModel):
    id: str
    project_list_name: Optional[str]
    internal_code: Optional[str]
    customer_name: str
    project_name: str
    annual_revenue_estimate: Optional[str]
    engineer_name: Optional[str]
    pm_name: Optional[str]
    template_name: Optional[str]
    project_template_id: Optional[str]
    summary_json: Optional[Dict[str, Any]]
    legacy_summary_html: Optional[str] = None
    summary_updated_at: Optional[datetime]
    default_slot_template_id: Optional[str]
    default_slot_template_name: Optional[str]
    root_path: Optional[str]
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

class ProjectDeleteInfoResponse(BaseModel):
    project_id: str
    customer_name: str
    project_name: str
    file_count: int
    folder_exists: bool
    folder_in_allowed_delete_scope: bool
    can_move_files_to_staging: bool
    can_delete_directly: bool
    delete_mode: str
    message: str


class MoveProjectFilesResult(BaseModel):
    moved_count: int
    staging_dir: str


class ProjectDeleteResponse(BaseModel):
    status: str
    message: str
    deleted_folder: bool
    deleted_record: bool


class SlotTemplateResponse(BaseModel):
    id: str
    template_name: str
    description: Optional[str]
    recommended_part_type: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class SlotTemplateItemBase(BaseModel):
    group_type: str
    slot_name: str
    sort_order: int


class SlotTemplateItemResponse(SlotTemplateItemBase):
    id: str

    class Config:
        from_attributes = True


class SlotTemplateUpsertRequest(BaseModel):
    template_name: str
    description: Optional[str] = None
    recommended_part_type: Optional[str] = None
    items: List[SlotTemplateItemBase] = []


class SlotTemplateDetailResponse(SlotTemplateResponse):
    items: List[SlotTemplateItemResponse]

class ProjectTemplateResponse(BaseModel):
    id: str
    template_name: str
    description: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class PartResponse(BaseModel):
    id: str
    part_name: str
    sort_order: int

    class Config:
        from_attributes = True

class ProjectPartResponse(BaseModel):
    id: str
    part_no: Optional[str]
    part_name: str
    part_type: Optional[str]
    parent_part_no: Optional[str]
    remark: Optional[str]

    class Config:
        from_attributes = True


class ProjectPartDeleteInfoResponse(BaseModel):
    part_id: str
    part_no: Optional[str]
    part_name: str
    file_count: int
    child_part_count: int
    folder_exists: bool


class MovePartFilesResult(BaseModel):
    moved_count: int
    staging_dir: str

class PartImportResult(BaseModel):
    imported_count: int
    skipped_count: int
    error_count: int
    warnings: Optional[list[str]] = []


class ApplyTemplateResult(BaseModel):
    template_id: str
    template_name: str
    created_count: int
    skipped_count: int
    part_count: int


class ProjectPartSlotCreate(BaseModel):
    slot_name: str
    group_type: str
    sort_order: Optional[int] = None

class DocumentSlotResponse(BaseModel):
    slot_id: str
    part_id: str
    group_type: str
    document_type: str
    has_file: bool
    latest_filename: Optional[str]
    latest_upload_at: Optional[datetime]
    note: Optional[str]

class UploadedFileResponse(BaseModel):
    id: str
    filename: str
    uploaded_at: datetime
    remark: Optional[str]
    is_latest: bool

class MatrixResponse(BaseModel):
    project: ProjectResponse
    parts: List[PartResponse]
    document_types: List[str]
    slots: List[DocumentSlotResponse]

class SlotDetailResponse(BaseModel):
    slot_id: str
    part_id: str
    group_type: str
    document_type: str
    has_file: bool
    latest_filename: Optional[str]
    latest_upload_at: Optional[datetime]
    note: Optional[str]
    target_folder_path: Optional[str]
    target_folder_exists: bool

class FileRecordResponse(BaseModel):
    id: str
    filename: str
    uploaded_at: datetime
    remark: Optional[str]
    is_latest: bool

class StagingFileResponse(BaseModel):
    filename: str
    full_path: str
    modified_at: datetime
    size: int

class DeleteStagingFileRequest(BaseModel):
    filename: str

class ImportFromStagingRequest(BaseModel):
    staging_file_path: str
    remark: Optional[str] = None

class ImportLocalFileRequest(BaseModel):
    local_file_path: str
    remark: Optional[str] = None

class PartSlotsSummaryResponse(BaseModel):
    part_id: str
    slot_id: str
    slot_name: str
    latest_filename: Optional[str]
    latest_upload_at: Optional[datetime]


class ProjectExistingFileResponse(BaseModel):
    uploaded_file_id: str
    slot_id: str
    part_id: str
    filename: str
    file_type: str
    group_type: str
    part_name: Optional[str] = None
    part_no: Optional[str] = None
    slot_name: str
    uploaded_at: datetime
    is_latest: bool


class ProjectExistingFilePreviewResponse(BaseModel):
    uploaded_file_id: str
    filename: str
    file_type: str
    preview_kind: str
    text_content: Optional[str] = None


class ExportWarningResponse(BaseModel):
    code: str
    level: str
    message: str
    source_project_id: Optional[str] = None
    source_part_id: Optional[str] = None
    source_slot_id: Optional[str] = None
    source_uploaded_file_id: Optional[str] = None
    relative_path: Optional[str] = None
    original_relative_path: Optional[str] = None


class ProjectBackupExportResponse(BaseModel):
    export_dir: str
    manifest_path: str
    copied_file_count: int
    missing_file_count: int
    warning_count: int
    warnings: List[ExportWarningResponse]


class ProjectBackupImportRequest(BaseModel):
    backup_dir: str


class ProjectBackupImportResponse(BaseModel):
    new_project_id: str
    imported_part_count: int
    imported_slot_count: int
    imported_file_count: int
    missing_file_count: int
    package_cleanup_status: str
    deleted_package_count: int
    retained_package_count: int
    warning_count: int
    warnings: List[ExportWarningResponse]


class ProjectDirectoryImportRequest(BaseModel):
    project_dir: str


class ProjectDirectoryImportResponse(BaseModel):
    new_project_id: str
    imported_part_count: int
    imported_slot_count: int
    imported_file_count: int
    imported_summary_history_count: int
    missing_file_count: int
    warning_count: int
    warnings: List[ExportWarningResponse]


class ProjectDirectoryScanRequest(BaseModel):
    root_dir: str


class ProjectDirectoryScanCandidateResponse(BaseModel):
    project_name: str
    customer_name: str
    internal_code: Optional[str] = None
    updated_at: Optional[datetime] = None
    path: str


class ProjectDirectoryScanResponse(BaseModel):
    items: List[ProjectDirectoryScanCandidateResponse]


class DirectoryPathResponse(BaseModel):
    path: str


class DirectorySelectionRequest(BaseModel):
    title: Optional[str] = None
    initial_path: Optional[str] = None
