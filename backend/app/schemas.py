from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

# ── Auth ──
class UserRegister(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    name: str = Field(..., min_length=2, max_length=100)
    password: str = Field(..., min_length=4, max_length=128)

class UserLogin(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    password: str

class UserOut(BaseModel):
    id: int
    email: str
    name: str
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

# ── Projects ──
class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    spec: Dict[str, Any]

class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    spec: Optional[Dict[str, Any]] = None

class ProjectOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    user_id: int
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

class ProjectDetailOut(ProjectOut):
    spec: Dict[str, Any]
