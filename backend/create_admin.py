#!/usr/bin/env python3
from sqlalchemy.orm import Session
from app.database import engine, Base
from app.models import User
from app.database import SessionLocal
from app.auth import hash_password

# Create tables
Base.metadata.create_all(bind=engine)

# Get a database session
db = SessionLocal()

try:
    # Delete if exists and recreate
    db.query(User).filter(User.email == "admin@example.com").delete()
    db.commit()

    if True:
        # Create admin user using the app's hash_password function
        password = "admin123"
        password_hash = hash_password(password)

        admin_user = User(
            email="admin@example.com",
            name="Administrador",
            password_hash=password_hash
        )
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)

        print("✅ Admin criado com sucesso!")
        print(f"   Email: admin@example.com")
        print(f"   Senha: admin123")
        print(f"   ID: {admin_user.id}")

finally:
    db.close()
