from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

class ProjectCreate(BaseModel):
    customer_name: str
    project_name: str
    template_name: Optional[str] = None

class ProjectResponse(BaseModel):
    id: str
    customer_name: str
    project_name: str
    template_name: Optional[str]
    root_path: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class PartResponse(BaseModel):
    id: str
    part_name: str
    sort_order: int

    class Config:
        from_attributes = True

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
