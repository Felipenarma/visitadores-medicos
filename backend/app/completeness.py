"""Indicador de completitud de datos de médicos por visitador.

Un médico tiene "información completa" cuando tiene teléfono, correo, centro médico y especialidad.
Se guarda una foto diaria por visitador (DoctorCompletenessSnapshot) para mostrar evolución.
"""
from datetime import datetime, date, timedelta
import pytz
from sqlalchemy.orm import Session

from .models import Doctor, MedicalRep, DoctorCompletenessSnapshot

CHILE_TZ = pytz.timezone("America/Santiago")

# Valores de relleno que no cuentan como dato real
_PLACEHOLDERS = {"", "-", "--", ".", "0", "na", "n/a", "s/i", "si", "sin", "sin dato", "sin datos",
                 "sin info", "no", "no tiene", "pendiente", "x", "null", "none", "nan"}

FIELDS = ("phone", "email", "medical_center", "specialty")


def has_value(v) -> bool:
    if v is None:
        return False
    s = str(v).strip().lower()
    return s not in _PLACEHOLDERS


def has_email(v) -> bool:
    return has_value(v) and "@" in str(v)


def missing_fields(doc: Doctor) -> list:
    missing = []
    if not has_value(doc.phone):
        missing.append("phone")
    if not has_email(doc.email):
        missing.append("email")
    if not has_value(doc.medical_center):
        missing.append("medical_center")
    if not has_value(doc.specialty):
        missing.append("specialty")
    return missing


LEGACY_COMPLETED = datetime(2000, 1, 1)


def sync_completed_at(doc: Doctor, edited: bool = False) -> bool:
    """Mantiene Doctor.info_completed_at coherente con sus datos.
    edited=True: el cambio viene de una edición (cuenta como avance del visitador).
    edited=False: sincronización pasiva (no cuenta como avance). Devuelve True si cambió."""
    complete = not missing_fields(doc)
    if complete and doc.info_completed_at is None:
        doc.info_completed_at = datetime.utcnow() if edited else LEGACY_COMPLETED
        return True
    if not complete and doc.info_completed_at is not None:
        doc.info_completed_at = None
        return True
    return False


def week_start_utc() -> datetime:
    """Lunes 00:00 hora Chile de la semana actual, expresado en UTC naive."""
    now = datetime.now(CHILE_TZ)
    monday = now.date() - timedelta(days=now.weekday())
    local = CHILE_TZ.localize(datetime(monday.year, monday.month, monday.day))
    return local.astimezone(pytz.utc).replace(tzinfo=None)


def weekly_goal(pending_now: int, done_this_week: int) -> int:
    """Meta semanal: completar ~1/4 de lo que quedaba pendiente al inicio de la semana
    (para cerrar en un mes), mínimo 3 y máximo 10, sin pedir más de lo que hay."""
    base = pending_now + done_this_week
    if base <= 0:
        return 0
    goal = max(3, min(10, -(-base // 4)))
    return min(goal, base)


def today_chile() -> date:
    return datetime.now(CHILE_TZ).date()


def compute_rep_completeness(db: Session, rep_id: int) -> dict:
    docs = db.query(Doctor).filter(Doctor.rep_id == rep_id, Doctor.is_active == True).all()  # noqa: E712
    if any([sync_completed_at(d) for d in docs]):
        db.commit()
    total = len(docs)
    with_phone = sum(1 for d in docs if has_value(d.phone))
    with_email = sum(1 for d in docs if has_email(d.email))
    with_center = sum(1 for d in docs if has_value(d.medical_center))
    with_specialty = sum(1 for d in docs if has_value(d.specialty))
    complete = sum(1 for d in docs if not missing_fields(d))
    return {
        "total": total,
        "with_phone": with_phone,
        "with_email": with_email,
        "with_center": with_center,
        "with_specialty": with_specialty,
        "complete": complete,
        "_docs": docs,
    }


def upsert_snapshot(db: Session, rep_id: int, stats: dict, day: date = None) -> None:
    day = day or today_chile()
    row = db.query(DoctorCompletenessSnapshot).filter(
        DoctorCompletenessSnapshot.rep_id == rep_id,
        DoctorCompletenessSnapshot.snapshot_date == day,
    ).first()
    if row is None:
        row = DoctorCompletenessSnapshot(rep_id=rep_id, snapshot_date=day)
        db.add(row)
    for k in ("total", "with_phone", "with_email", "with_center", "with_specialty", "complete"):
        setattr(row, k, stats[k])
    try:
        db.commit()
    except Exception:
        db.rollback()  # carrera con otro proceso que insertó la misma fila: se ignora


def record_all_snapshots(db: Session) -> int:
    reps = db.query(MedicalRep).filter(MedicalRep.is_active == True).all()  # noqa: E712
    for rep in reps:
        upsert_snapshot(db, rep.id, compute_rep_completeness(db, rep.id))
    return len(reps)


def pct(n: int, total: int) -> float:
    return round(100.0 * n / total, 1) if total else 0.0
