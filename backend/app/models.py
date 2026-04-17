from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from .database import Base

class ProjectTemplate(Base):
    __tablename__ = "project_templates"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    template_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    projects = relationship("Project", back_populates="project_template")


class SystemSettings(Base):
    __tablename__ = "system_settings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_root = Column(String(1024), nullable=True)
    import_root = Column(String(1024), nullable=True)
    export_root = Column(String(1024), nullable=True)
    theme = Column(String(32), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SlotTemplate(Base):
    __tablename__ = "slot_templates"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    template_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    recommended_part_type = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    items = relationship("SlotTemplateItem", back_populates="slot_template", cascade="all, delete-orphan")
    part_types = relationship("PartType", back_populates="default_slot_template")


class SlotTemplateItem(Base):
    __tablename__ = "slot_template_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    slot_template_id = Column(String(36), ForeignKey("slot_templates.id"), nullable=False)
    group_type = Column(String(50), nullable=False)
    slot_name = Column(String(255), nullable=False)
    sort_order = Column(Integer, default=0)

    slot_template = relationship("SlotTemplate", back_populates="items")


class PartType(Base):
    __tablename__ = "part_types"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    type_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    default_slot_template_id = Column(String(36), ForeignKey("slot_templates.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    default_slot_template = relationship("SlotTemplate", back_populates="part_types")
    parts = relationship("Part", back_populates="part_type")


class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_list_name = Column(String(255), nullable=True)
    internal_code = Column(String(255), nullable=True)
    customer_name = Column(String(255), nullable=False)
    project_name = Column(String(255), nullable=False)
    annual_revenue_estimate = Column(String(255), nullable=True)
    engineer_name = Column(String(255), nullable=True)
    pm_name = Column(String(255), nullable=True)
    template_name = Column(String(255), nullable=True)
    project_template_id = Column(String(36), ForeignKey("project_templates.id"), nullable=True)
    summary_json = Column(Text, nullable=True)
    summary_html = Column(Text, nullable=True)
    summary_updated_at = Column(DateTime, nullable=True)
    root_path = Column(String(1024), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project_template = relationship("ProjectTemplate", back_populates="projects")
    default_slot_template_id = Column(String(36), ForeignKey("slot_templates.id"), nullable=True)
    default_slot_template = relationship("SlotTemplate", foreign_keys=[default_slot_template_id])
    parts = relationship("Part", back_populates="project", cascade="all, delete-orphan")
    document_slots = relationship("DocumentSlot", back_populates="project", cascade="all, delete-orphan")
    summary_histories = relationship("ProjectSummaryHistory", back_populates="project", cascade="all, delete-orphan")

    @property
    def default_slot_template_name(self):
        return self.default_slot_template.template_name if self.default_slot_template else None


class Part(Base):
    __tablename__ = "parts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    part_no = Column(String(255), nullable=True)
    part_name = Column(String(255), nullable=False)
    part_type_id = Column(String(36), ForeignKey("part_types.id"), nullable=True)
    parent_part_id = Column(String(36), ForeignKey("parts.id"), nullable=True)
    remark = Column(Text, nullable=True)
    applied_slot_template_id = Column(String(36), ForeignKey("slot_templates.id"), nullable=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="parts")
    part_type = relationship("PartType", back_populates="parts")
    parent_part = relationship("Part", remote_side=[id], back_populates="children")
    children = relationship("Part", back_populates="parent_part", cascade="all, delete-orphan")
    applied_slot_template = relationship("SlotTemplate")
    document_slots = relationship("DocumentSlot", back_populates="part", cascade="all, delete-orphan")


class ProjectSummaryHistory(Base):
    __tablename__ = "project_summary_histories"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    version_no = Column(Integer, nullable=False)
    summary_json = Column(Text, nullable=True)
    summary_html = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    project = relationship("Project", back_populates="summary_histories")


class DocumentSlot(Base):
    __tablename__ = "document_slots"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    part_id = Column(String(36), ForeignKey("parts.id"), nullable=False)
    group_type = Column(String(50), nullable=False)
    document_type = Column(String(50), nullable=False)
    has_file = Column(Boolean, default=False)
    latest_filename = Column(String(255), nullable=True)
    latest_upload_at = Column(DateTime, nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="document_slots")
    part = relationship("Part", back_populates="document_slots")
    uploaded_files = relationship("UploadedFile", back_populates="slot", cascade="all, delete-orphan")


class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    slot_id = Column(String(36), ForeignKey("document_slots.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    remark = Column(Text, nullable=True)
    is_latest = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    slot = relationship("DocumentSlot", back_populates="uploaded_files")
