from datetime import datetime
import uuid

from app.database import SessionLocal, init_db
from app.models import (
    ProjectTemplate,
    PartType,
    SlotTemplate,
    SlotTemplateItem,
    Project,
)
from app.services.project_folders import create_project_folders


def seed_database():
    init_db()
    db = SessionLocal()
    try:
        db.query(Project).delete()
        db.query(SlotTemplateItem).delete()
        db.query(SlotTemplate).delete()
        db.query(PartType).delete()
        db.query(ProjectTemplate).delete()
        db.commit()

        template1 = ProjectTemplate(
            id=str(uuid.uuid4()),
            template_name="基础项目模板",
            description="适用于标准项目的基础配置模板",
            created_at=datetime.utcnow(),
        )
        template2 = ProjectTemplate(
            id=str(uuid.uuid4()),
            template_name="简化项目模板",
            description="适用于小型项目的轻量模板",
            created_at=datetime.utcnow(),
        )
        db.add_all([template1, template2])
        db.commit()

        slot_template_a = SlotTemplate(
            id=str(uuid.uuid4()),
            template_name="标准文档槽模板A",
            description="外来文件和内部文件常规槽位模板",
            created_at=datetime.utcnow(),
        )
        slot_template_b = SlotTemplate(
            id=str(uuid.uuid4()),
            template_name="简化文档槽模板B",
            description="仅包含核心文档类型的模板",
            created_at=datetime.utcnow(),
        )
        db.add_all([slot_template_a, slot_template_b])
        db.commit()

        slot_items = [
            SlotTemplateItem(
                id=str(uuid.uuid4()),
                slot_template_id=slot_template_a.id,
                group_type="external",
                slot_name="CBD",
                sort_order=1,
            ),
            SlotTemplateItem(
                id=str(uuid.uuid4()),
                slot_template_id=slot_template_a.id,
                group_type="external",
                slot_name="FAI",
                sort_order=2,
            ),
            SlotTemplateItem(
                id=str(uuid.uuid4()),
                slot_template_id=slot_template_a.id,
                group_type="internal",
                slot_name="CPK",
                sort_order=3,
            ),
            SlotTemplateItem(
                id=str(uuid.uuid4()),
                slot_template_id=slot_template_a.id,
                group_type="internal",
                slot_name="DFM",
                sort_order=4,
            ),
            SlotTemplateItem(
                id=str(uuid.uuid4()),
                slot_template_id=slot_template_b.id,
                group_type="external",
                slot_name="CBD",
                sort_order=1,
            ),
            SlotTemplateItem(
                id=str(uuid.uuid4()),
                slot_template_id=slot_template_b.id,
                group_type="internal",
                slot_name="DWG",
                sort_order=2,
            ),
        ]
        db.add_all(slot_items)
        db.commit()

        part_types = [
            PartType(
                id=str(uuid.uuid4()),
                type_name="结构件",
                description="用于大型结构件，推荐默认槽位模板A",
                default_slot_template_id=slot_template_a.id,
                created_at=datetime.utcnow(),
            ),
            PartType(
                id=str(uuid.uuid4()),
                type_name="装配件",
                description="用于装配件，推荐默认槽位模板A",
                default_slot_template_id=slot_template_a.id,
                created_at=datetime.utcnow(),
            ),
            PartType(
                id=str(uuid.uuid4()),
                type_name="标准件",
                description="用于标准件，推荐默认槽位模板B",
                default_slot_template_id=slot_template_b.id,
                created_at=datetime.utcnow(),
            ),
            PartType(
                id=str(uuid.uuid4()),
                type_name="外购件",
                description="用于外购件，可不强绑定槽位模板",
                default_slot_template_id=None,
                created_at=datetime.utcnow(),
            ),
        ]
        db.add_all(part_types)
        db.commit()

        project1 = Project(
            id=str(uuid.uuid4()),
            customer_name="客户A",
            project_name="示例项目1",
            template_name="模板1",
            project_template_id=template1.id,
            default_slot_template_id=slot_template_a.id,
            created_at=datetime.utcnow(),
        )
        project2 = Project(
            id=str(uuid.uuid4()),
            customer_name="客户B",
            project_name="示例项目2",
            template_name="模板2",
            project_template_id=template2.id,
            default_slot_template_id=None,
            created_at=datetime.utcnow(),
        )
        project1.root_path = create_project_folders(project1.customer_name, project1.project_name)
        project2.root_path = create_project_folders(project2.customer_name, project2.project_name)
        db.add_all([project1, project2])
        db.commit()

        print("Seed data created successfully.")
    except Exception as e:
        db.rollback()
        print(f"Seed error: {e}")
        raise
    finally:
        db.close()
