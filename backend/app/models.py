from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

from .database import Base

class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    customer_name = Column(String(255), nullable=False)
    project_name = Column(String(255), nullable=False)
    template_name = Column(String(255), nullable=True)
    root_path = Column(String(1024), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    parts = relationship("Part", back_populates="project", cascade="all, delete-orphan")
    document_slots = relationship("DocumentSlot", back_populates="project", cascade="all, delete-orphan")


class Part(Base):
    __tablename__ = "parts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False)
    part_name = Column(String(255), nullable=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="parts")
    document_slots = relationship("DocumentSlot", back_populates="part", cascade="all, delete-orphan")


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
