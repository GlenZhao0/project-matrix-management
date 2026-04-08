from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

class ProjectCreate(BaseModel):
    customer_name: str
    project_name: str
    template_name: Optional[str] = None
    project_template_id: Optional[str] = None


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
    customer_name: str
    project_name: str
    template_name: Optional[str]
    project_template_id: Optional[str]
    default_slot_template_id: Optional[str]
    default_slot_template_name: Optional[str]
    root_path: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

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
