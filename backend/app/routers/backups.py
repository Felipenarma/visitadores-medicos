import io
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, defer

from ..database import get_db
from ..models import DataBackup

router = APIRouter(prefix="/api/backups", tags=["backups"])


def _out(b: DataBackup) -> dict:
    return {
        "id": b.id, "filename": b.filename, "size_bytes": b.size_bytes,
        "created_at": b.created_at.isoformat() if b.created_at else None,
        "trigger": b.trigger, "emailed": bool(b.emailed), "email_error": b.email_error,
        "summary": json.loads(b.summary) if b.summary else {},
    }


@router.get("")
def list_backups(db: Session = Depends(get_db)):
    rows = db.query(DataBackup).options(defer(DataBackup.data)) \
        .order_by(DataBackup.created_at.desc(), DataBackup.id.desc()).all()
    return [_out(b) for b in rows]


@router.post("")
def create_backup_now(send_email: bool = Query(True), db: Session = Depends(get_db)):
    from ..backup import create_backup
    return _out(create_backup(db, trigger="manual", send_email=send_email))


@router.get("/latest/download")
def download_latest_backup(max_age_days: int = Query(6, ge=0, le=60), db: Session = Depends(get_db)):
    """Descarga el respaldo más reciente. Si no hay uno de los últimos `max_age_days` días,
    genera uno nuevo en el momento (sin enviar correo). Usado por la descarga automática en el Mac."""
    from datetime import datetime, timedelta
    from ..backup import create_backup
    b = db.query(DataBackup).order_by(DataBackup.created_at.desc(), DataBackup.id.desc()).first()
    if b is None or b.created_at is None or b.created_at < datetime.utcnow() - timedelta(days=max_age_days):
        b = create_backup(db, trigger="manual", send_email=False)
    return StreamingResponse(
        io.BytesIO(b.data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{b.filename}"'},
    )


@router.get("/{backup_id}/download")
def download_backup(backup_id: int, db: Session = Depends(get_db)):
    b = db.query(DataBackup).filter(DataBackup.id == backup_id).first()
    if not b:
        raise HTTPException(status_code=404, detail="Respaldo no encontrado")
    return StreamingResponse(
        io.BytesIO(b.data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{b.filename}"'},
    )
