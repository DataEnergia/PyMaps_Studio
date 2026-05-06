from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ..database import SessionLocal
from ..models import Project
from ..schemas import ProjectCreate, ProjectUpdate, ProjectOut, ProjectDetailOut

router = APIRouter(prefix="/projects", tags=["projects"])

LOCAL_USER_ID = 1

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("", response_model=List[ProjectOut])
def list_projects():
    db = SessionLocal()
    try:
        return db.query(Project).order_by(Project.updated_at.desc()).all()
    finally:
        db.close()

@router.post("", response_model=ProjectOut)
def create_project(data: ProjectCreate):
    db = SessionLocal()
    try:
        proj = Project(
            name=data.name,
            description=data.description,
            spec=data.spec,
            user_id=LOCAL_USER_ID,
        )
        db.add(proj)
        db.commit()
        db.refresh(proj)
        return proj
    finally:
        db.close()

@router.get("/{project_id}", response_model=ProjectDetailOut)
def get_project(project_id: int):
    db = SessionLocal()
    try:
        proj = db.query(Project).filter(Project.id == project_id).first()
        if not proj:
            raise HTTPException(status_code=404, detail="Projeto não encontrado")
        return proj
    finally:
        db.close()

@router.put("/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, data: ProjectUpdate):
    db = SessionLocal()
    try:
        proj = db.query(Project).filter(Project.id == project_id).first()
        if not proj:
            raise HTTPException(status_code=404, detail="Projeto não encontrado")
        if data.name is not None:
            proj.name = data.name
        if data.description is not None:
            proj.description = data.description
        if data.spec is not None:
            proj.spec = data.spec
        db.commit()
        db.refresh(proj)
        return proj
    finally:
        db.close()

@router.delete("/{project_id}")
def delete_project(project_id: int):
    db = SessionLocal()
    try:
        proj = db.query(Project).filter(Project.id == project_id).first()
        if not proj:
            raise HTTPException(status_code=404, detail="Projeto não encontrado")
        db.delete(proj)
        db.commit()
        return {"ok": True}
    finally:
        db.close()
