from datetime import datetime
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import SlotTemplate, SlotTemplateItem
from app.schemas import (
    SlotTemplateResponse,
    SlotTemplateDetailResponse,
    SlotTemplateItemResponse,
    SlotTemplateUpsertRequest,
)

router = APIRouter(prefix="/slot-templates", tags=["slot-templates"])


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _validate_items(payload: SlotTemplateUpsertRequest) -> None:
    for item in payload.items:
        if item.group_type not in {"external", "internal"}:
            raise HTTPException(status_code=400, detail="group_type 必须是 external 或 internal")
        if not item.slot_name.strip():
            raise HTTPException(status_code=400, detail="slot_name 不能为空")


def _get_template_or_404(template_id: str, db: Session) -> SlotTemplate:
    template = (
        db.query(SlotTemplate)
        .options(joinedload(SlotTemplate.items))
        .filter(SlotTemplate.id == template_id)
        .first()
    )
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    return template


def _serialize_template_detail(template: SlotTemplate) -> SlotTemplateDetailResponse:
    sorted_items = sorted(
        template.items,
        key=lambda item: (item.sort_order, item.slot_name.lower(), item.id),
    )
    return SlotTemplateDetailResponse(
        id=template.id,
        template_name=template.template_name,
        description=template.description,
        recommended_part_type=template.recommended_part_type,
        created_at=template.created_at,
        items=[
            SlotTemplateItemResponse(
                id=item.id,
                group_type=item.group_type,
                slot_name=item.slot_name,
                sort_order=item.sort_order,
            )
            for item in sorted_items
        ],
    )


def _ensure_template_name_unique(template_name: str, db: Session, exclude_id: str | None = None) -> None:
    query = db.query(SlotTemplate).filter(func.lower(SlotTemplate.template_name) == template_name.lower())
    if exclude_id:
        query = query.filter(SlotTemplate.id != exclude_id)
    existing = query.first()
    if existing:
        raise HTTPException(status_code=400, detail="模板名称已存在")


def _replace_template_items(template_id: str, items: list, db: Session) -> None:
    db.query(SlotTemplateItem).filter(SlotTemplateItem.slot_template_id == template_id).delete()
    for item in items:
        db.add(
            SlotTemplateItem(
                id=str(uuid.uuid4()),
                slot_template_id=template_id,
                group_type=item.group_type,
                slot_name=item.slot_name.strip(),
                sort_order=item.sort_order,
            )
        )


@router.get("", response_model=list[SlotTemplateResponse])
def list_slot_templates(db: Session = Depends(get_db)):
    templates = db.query(SlotTemplate).order_by(SlotTemplate.template_name).all()
    return templates


@router.get("/{template_id}", response_model=SlotTemplateDetailResponse)
def get_slot_template(template_id: str, db: Session = Depends(get_db)):
    template = _get_template_or_404(template_id, db)
    return _serialize_template_detail(template)


@router.post("", response_model=SlotTemplateDetailResponse)
def create_slot_template(payload: SlotTemplateUpsertRequest, db: Session = Depends(get_db)):
    template_name = _normalize_text(payload.template_name)
    if not template_name:
        raise HTTPException(status_code=400, detail="template_name 不能为空")

    _validate_items(payload)
    _ensure_template_name_unique(template_name, db)

    new_template = SlotTemplate(
        id=str(uuid.uuid4()),
        template_name=template_name,
        description=_normalize_text(payload.description),
        recommended_part_type=_normalize_text(payload.recommended_part_type),
        created_at=datetime.utcnow(),
    )
    db.add(new_template)
    db.flush()

    _replace_template_items(new_template.id, payload.items, db)
    db.commit()

    created_template = _get_template_or_404(new_template.id, db)
    return _serialize_template_detail(created_template)


@router.put("/{template_id}", response_model=SlotTemplateDetailResponse)
def update_slot_template(template_id: str, payload: SlotTemplateUpsertRequest, db: Session = Depends(get_db)):
    template_name = _normalize_text(payload.template_name)
    if not template_name:
        raise HTTPException(status_code=400, detail="template_name 不能为空")

    _validate_items(payload)
    template = _get_template_or_404(template_id, db)
    _ensure_template_name_unique(template_name, db, exclude_id=template_id)

    template.template_name = template_name
    template.description = _normalize_text(payload.description)
    template.recommended_part_type = _normalize_text(payload.recommended_part_type)

    _replace_template_items(template.id, payload.items, db)
    db.commit()

    updated_template = _get_template_or_404(template.id, db)
    return _serialize_template_detail(updated_template)
