from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ..auth import get_db
from ..models import Project
from ..schemas import ProjectCreate, ProjectUpdate, ProjectOut, ProjectDetailOut

router = APIRouter(prefix="/projects", tags=["projects"])

# For local development, all projects use user_id=1
LOCAL_USER_ID = 1

@router.get("/test/hello")
def test_endpoint():
    return {"message": "Hello from projects"}

@router.get("", response_model=List[ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return db.query(Project).order_by(Project.updated_at.desc()).all()

@router.post("", response_model=ProjectOut)
def create_project(data: ProjectCreate, db: Session = Depends(get_db)):
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

@router.get("/{project_id}", response_model=ProjectDetailOut)
def get_project(project_id: int, db: Session = Depends(get_db)):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    return proj

@router.put("/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, data: ProjectUpdate, db: Session = Depends(get_db)):
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

@router.delete("/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    proj = db.query(Project).filter(Project.id == project_id).first()
    if not proj:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    db.delete(proj)
    db.commit()
    return {"ok": True}
