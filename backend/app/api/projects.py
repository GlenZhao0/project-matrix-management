from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import uuid
from datetime import datetime
import shutil

from app.database import get_db
from app.models import Project, Part, DocumentSlot
from app.schemas import ProjectCreate, ProjectResponse
from app.services.project_folders import create_project_folders

router = APIRouter(prefix="/projects", tags=["projects"])

@router.get("", response_model=list[ProjectResponse])
def get_projects(db: Session = Depends(get_db)):
    projects = db.query(Project).all()
    return projects

@router.post("", response_model=ProjectResponse)
def create_project(project: ProjectCreate, db: Session = Depends(get_db)):
    root_path = None
    try:
        new_project = Project(
            id=str(uuid.uuid4()),
            customer_name=project.customer_name,
            project_name=project.project_name,
            template_name=project.template_name,
            created_at=datetime.utcnow(),
        )
        db.add(new_project)
        db.flush()

        root_path = create_project_folders(project.customer_name, project.project_name)
        new_project.root_path = root_path

        part_names = ["Part A", "Part B", "Part C"]
        document_types = ["CBD", "FAI", "CPK", "DFM", "DWG"]
        group_types = ["external", "internal"]

        for sort_order, part_name in enumerate(part_names, 1):
            new_part = Part(
                id=str(uuid.uuid4()),
                project_id=new_project.id,
                part_name=part_name,
                sort_order=sort_order,
            )
            db.add(new_part)
            db.flush()

            for group_type in group_types:
                for document_type in document_types:
                    slot = DocumentSlot(
                        id=str(uuid.uuid4()),
                        project_id=new_project.id,
                        part_id=new_part.id,
                        group_type=group_type,
                        document_type=document_type,
                        has_file=False,
                        latest_filename=None,
                        latest_upload_at=None,
                        note="",
                    )
                    db.add(slot)

        db.commit()
        db.refresh(new_project)
        return new_project
    except Exception as e:
        db.rollback()
        if root_path:
            try:
                shutil.rmtree(root_path)
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=f"创建项目失败：{str(e)}")

@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    return project
