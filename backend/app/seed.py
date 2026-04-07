from datetime import datetime, timedelta
import uuid

from app.database import SessionLocal, init_db
from app.models import Project, Part, DocumentSlot, UploadedFile


def seed_database():
    init_db()
    db = SessionLocal()
    try:
        db.query(UploadedFile).delete()
        db.query(DocumentSlot).delete()
        db.query(Part).delete()
        db.query(Project).delete()
        db.commit()

        project1 = Project(
            id=str(uuid.uuid4()),
            customer_name="客户A",
            project_name="项目1",
            template_name="模板1",
            created_at=datetime.utcnow(),
        )
        project2 = Project(
            id=str(uuid.uuid4()),
            customer_name="客户B",
            project_name="项目2",
            template_name="模板2",
            created_at=datetime.utcnow(),
        )
        db.add_all([project1, project2])
        db.commit()

        _create_parts_and_slots(db, project1.id)
        _create_parts_and_slots(db, project2.id)
        db.commit()

        print("Seed data created successfully.")
    except Exception as e:
        db.rollback()
        print(f"Seed error: {e}")
        raise
    finally:
        db.close()


def _create_parts_and_slots(db, project_id: str):
    part_names = ["Part A", "Part B", "Part C"]
    document_types = ["CBD", "FAI", "CPK", "DFM", "DWG"]
    group_types = ["external", "internal"]

    for sort_order, part_name in enumerate(part_names, start=1):
        part = Part(
            id=str(uuid.uuid4()),
            project_id=project_id,
            part_name=part_name,
            sort_order=sort_order,
        )
        db.add(part)
        db.flush()

        for group_type in group_types:
            for document_type in document_types:
                has_file = (sort_order == 1 and document_type in ["CBD", "CPK", "DWG"]) or (
                    sort_order == 2 and document_type in ["FAI", "DFM"]
                ) or (
                    sort_order == 3 and document_type in ["CBD", "FAI", "DWG"]
                )
                latest_filename = None
                latest_upload_at = None
                note = ""

                if has_file:
                    latest_filename = f"{part_name}_{group_type}_{document_type}.pdf"
                    latest_upload_at = datetime.utcnow() - timedelta(days=sort_order * 2)
                    note = f"{part_name} {group_type} {document_type} 初始记录"

                slot = DocumentSlot(
                    id=str(uuid.uuid4()),
                    project_id=project_id,
                    part_id=part.id,
                    group_type=group_type,
                    document_type=document_type,
                    has_file=has_file,
                    latest_filename=latest_filename,
                    latest_upload_at=latest_upload_at,
                    note=note,
                )
                db.add(slot)
                if has_file:
                    uploaded_file = UploadedFile(
                        id=str(uuid.uuid4()),
                        slot_id=slot.id,
                        filename=latest_filename,
                        uploaded_at=latest_upload_at,
                        remark="初始版本",
                        is_latest=True,
                    )
                    db.add(uploaded_file)
