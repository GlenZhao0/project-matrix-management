import os
from pathlib import Path

# 获取项目根目录  
BASE_DIR = Path(__file__).resolve().parent

# 数据库配置
DATABASE_URL = f"sqlite:///{BASE_DIR}/pdm.db"

# FastAPI 配置
DEBUG = True
API_PREFIX = "/api"
PROJECT_ROOT_DIR = "~/projects_data"
STAGING_UPLOAD_DIR = "~/projects_inbox"

# CORS 配置
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "127.0.0.1:5173",
]
