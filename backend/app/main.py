from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.api.projects import router as projects_router
from app.api.matrix import router as matrix_router
from app.api.slots import router as slots_router
from app.api.slot_templates import router as slot_templates_router
import config

app = FastAPI(
    title="项目资料矩阵管理",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

app.include_router(projects_router, prefix=config.API_PREFIX)
app.include_router(matrix_router, prefix=config.API_PREFIX)
app.include_router(slots_router, prefix=config.API_PREFIX)
app.include_router(slot_templates_router, prefix=config.API_PREFIX)

@app.get("/")
def root():
    return {"message": "项目资料矩阵管理系统 API"}
