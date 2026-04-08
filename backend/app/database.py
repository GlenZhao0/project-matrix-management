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


def init_db():
    Base.metadata.create_all(bind=engine)
    _ensure_project_default_template_column()
    _ensure_slot_template_recommended_part_type_column()
