from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.projects import _build_project_response
from app.database import get_db
from app.models import Project, Part, DocumentSlot
from app.schemas import MatrixResponse

router = APIRouter(prefix="/projects", tags=["matrix"])

@router.get("/{project_id}/matrix", response_model=MatrixResponse)
def get_project_matrix(project_id: str, db: Session = Depends(get_db)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")

    parts = db.query(Part).filter(Part.project_id == project_id).order_by(Part.sort_order).all()
    document_types = ["CBD", "FAI", "CPK", "DFM", "DWG"]
    slots = db.query(DocumentSlot).filter(DocumentSlot.project_id == project_id).all()

    slot_list = [
        {
            "slot_id": slot.id,
            "part_id": slot.part_id,
            "group_type": slot.group_type,
            "document_type": slot.document_type,
            "has_file": slot.has_file,
            "latest_filename": slot.latest_filename,
            "latest_upload_at": slot.latest_upload_at,
            "note": slot.note or "",
        }
        for slot in slots
    ]

    return {
        "project": _build_project_response(project),
        "parts": parts,
        "document_types": document_types,
        "slots": slot_list,
    }
