from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import Optional
from ..database import get_db
from ..models import ImageFile

router = APIRouter(prefix="/api/images", tags=["images"])

ALLOWED_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml"}
MAX_SIZE_MB = 5


@router.get("")
def get_images(category: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(ImageFile)
    if category:
        q = q.filter(ImageFile.category == category)
    images = q.order_by(ImageFile.created_at.desc()).all()
    result = []
    for img in images:
        result.append({
            "id": img.id,
            "name": img.name,
            "description": img.description,
            "filename": img.filename,
            "category": img.category,
            "business_line_id": img.business_line_id,
            "business_line_name": img.business_line.name if img.business_line else None,
            "content_type": img.content_type,
            "created_at": img.created_at.isoformat() if img.created_at else None,
            "url": f"/api/images/{img.id}/file",
        })
    return result


@router.post("")
async def upload_image(
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(""),
    category: str = Form("general"),
    business_line_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
):
    content_type = file.content_type or "image/png"
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Tipo de archivo no permitido: {content_type}. Use PNG, JPG, GIF, WebP o SVG.")

    data = await file.read()
    if len(data) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"El archivo supera el límite de {MAX_SIZE_MB}MB.")

    img = ImageFile(
        name=name,
        description=description or None,
        filename=file.filename or "image",
        category=category,
        business_line_id=business_line_id or None,
        content_type=content_type,
        data=data,
    )
    db.add(img)
    db.commit()
    db.refresh(img)

    return {
        "id": img.id,
        "name": img.name,
        "filename": img.filename,
        "category": img.category,
        "url": f"/api/images/{img.id}/file",
    }


@router.get("/{image_id}/file")
def get_image_file(image_id: int, db: Session = Depends(get_db)):
    img = db.query(ImageFile).filter(ImageFile.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Imagen no encontrada")
    return Response(content=img.data, media_type=img.content_type)


@router.delete("/{image_id}")
def delete_image(image_id: int, db: Session = Depends(get_db)):
    img = db.query(ImageFile).filter(ImageFile.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Imagen no encontrada")
    db.delete(img)
    db.commit()
    return {"message": "Imagen eliminada"}
