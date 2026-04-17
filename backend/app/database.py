from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATABASE_URL = f"sqlite:///{BASE_DIR.parent}/pdm.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _ensure_project_default_template_column():
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(projects)"))
        columns = [row[1] for row in result]
        if "default_slot_template_id" not in columns:
            conn.execute(text("ALTER TABLE projects ADD COLUMN default_slot_template_id VARCHAR(36)"))


def _ensure_slot_template_recommended_part_type_column():
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(slot_templates)"))
        columns = [row[1] for row in result]
        if "recommended_part_type" not in columns:
            conn.execute(text("ALTER TABLE slot_templates ADD COLUMN recommended_part_type VARCHAR(255)"))


def _ensure_project_management_columns():
    with engine.begin() as conn:
        result = conn.execute(text("PRAGMA table_info(projects)"))
        columns = [row[1] for row in result]

        if "project_list_name" not in columns:
            conn.execute(text("ALTER TABLE projects ADD COLUMN project_list_name VARCHAR(255)"))
        if "internal_code" not in columns:
            conn.execute(text("ALTER TABLE projects ADD COLUMN internal_code VARCHAR(255)"))
        if "annual_revenue_estimate" not in columns:
            conn.execute(text("ALTER TABLE projects ADD COLUMN annual_revenue_estimate VARCHAR(255)"))
        if "engineer_name" not in columns:
            conn.execute(text("ALTER TABLE projects ADD COLUMN engineer_name VARCHAR(255)"))
        if "pm_name" not in columns:
            conn.execute(text("ALTER TABLE projects ADD COLUMN pm_name VARCHAR(255)"))
        if "summary_json" not in columns:
            conn.execute(text("ALTER TABLE projects ADD COLUMN summary_json TEXT"))
        if "summary_html" not in columns:
            conn.execute(text("ALTER TABLE projects ADD COLUMN summary_html TEXT"))
        if "summary_updated_at" not in columns:
            conn.execute(text("ALTER TABLE projects ADD COLUMN summary_updated_at DATETIME"))
        if "updated_at" not in columns:
            conn.execute(text("ALTER TABLE projects ADD COLUMN updated_at DATETIME"))

        conn.execute(
            text(
                "UPDATE projects "
                "SET project_list_name = '默认清单' "
                "WHERE project_list_name IS NULL "
                "OR TRIM(project_list_name) = '' "
                "OR TRIM(project_list_name) = '项目清单'"
            )
        )
        conn.execute(text("UPDATE projects SET updated_at = COALESCE(updated_at, created_at)"))


def _ensure_project_summary_history_columns():
    with engine.begin() as conn:
        result = conn.execute(text("PRAGMA table_info(project_summary_histories)"))
        columns = [row[1] for row in result]

        if "summary_json" not in columns:
            conn.execute(text("ALTER TABLE project_summary_histories ADD COLUMN summary_json TEXT"))


def _ensure_system_settings_columns():
    with engine.begin() as conn:
        result = conn.execute(text("PRAGMA table_info(system_settings)"))
        columns = [row[1] for row in result]

        if "theme" not in columns:
            conn.execute(text("ALTER TABLE system_settings ADD COLUMN theme VARCHAR(32)"))

        conn.execute(text("UPDATE system_settings SET theme = 'system' WHERE theme IS NULL OR TRIM(theme) = ''"))


def init_db():
    Base.metadata.create_all(bind=engine)
    _ensure_project_default_template_column()
    _ensure_slot_template_recommended_part_type_column()
    _ensure_project_management_columns()
    _ensure_project_summary_history_columns()
    _ensure_system_settings_columns()
