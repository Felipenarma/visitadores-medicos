"""Agendamiento automático de visitas a médicos prescriptores con venta baja.

Criterio "venta baja": el médico lleva menos unidades (ventas) este mes que a la misma
fecha del mes anterior. La "fecha de hoy" para comparar es la última venta cargada
(no el reloj), así un retraso en la carga de ventas no hace parecer que todos cayeron.

Se ejecuta: cada día 7:00 hora Chile, después de cada carga consolidada de ventas,
y a mano vía POST /api/visits/schedule-low-sales.
"""
from calendar import monthrange
from datetime import datetime, timedelta, date
from typing import Optional

import pytz
from sqlalchemy import func
from sqlalchemy.orm import Session

from .constants import MAX_VISITS_PER_DAY
from .models import Doctor, Sale, Visit
from .scheduling import _build_day_counts, _next_available_slot

CHILE_TZ = pytz.timezone("America/Santiago")
ORIGIN = "low_sales"
LOOKAHEAD_DAYS = 7        # si ya tiene visita agendada en este plazo, no se agenda otra
RECENT_VISIT_DAYS = 7     # si fue visitado hace menos de esto, no se agenda
WINDOW_DAYS = 10          # plazo máximo para encontrar cupo
VISIT_HOUR = 9            # hora por defecto de la visita agendada


def _now_local() -> datetime:
    return datetime.now(CHILE_TZ).replace(tzinfo=None)


def comparison_windows(db: Session, now: Optional[datetime] = None) -> Optional[dict]:
    """Ventanas [inicio, fin] del mes actual y del mismo tramo del mes anterior.
    None si aún no hay ventas cargadas del mes en curso."""
    now = now or _now_local()
    latest = db.query(func.max(Sale.sale_date)).scalar()
    if latest is None:
        return None
    cutoff = min(now, latest)
    if (cutoff.year, cutoff.month) != (now.year, now.month):
        return None  # no hay ventas del mes actual todavía: no se puede comparar
    cur_start = datetime(now.year, now.month, 1)
    cur_end = datetime(cutoff.year, cutoff.month, cutoff.day, 23, 59, 59)
    pm, py = (now.month - 1, now.year) if now.month > 1 else (12, now.year - 1)
    last_prev = monthrange(py, pm)[1]
    prev_start = datetime(py, pm, 1)
    prev_end = datetime(py, pm, min(cutoff.day, last_prev), 23, 59, 59)
    return {"cur_start": cur_start, "cur_end": cur_end, "prev_start": prev_start,
            "prev_end": prev_end, "cutoff": cutoff.date()}


def _units_by_doctor(db: Session, start: datetime, end: datetime, rep_id: Optional[int]) -> dict:
    q = db.query(Sale.doctor_id, func.count(Sale.id)).join(Doctor, Sale.doctor_id == Doctor.id).filter(
        Sale.sale_date >= start, Sale.sale_date <= end,
        Doctor.is_active == True, Doctor.rep_id.isnot(None),  # noqa: E712
    )
    if rep_id:
        q = q.filter(Doctor.rep_id == rep_id)
    return dict(q.group_by(Sale.doctor_id).all())


def find_low_sales_doctors(db: Session, rep_id: Optional[int] = None, now: Optional[datetime] = None) -> dict:
    w = comparison_windows(db, now)
    if w is None:
        return {"ok": False, "reason": "Aún no hay ventas cargadas del mes en curso", "doctors": []}
    prev = _units_by_doctor(db, w["prev_start"], w["prev_end"], rep_id)
    cur = _units_by_doctor(db, w["cur_start"], w["cur_end"], rep_id)
    low_ids = [d for d, p in prev.items() if cur.get(d, 0) < p]
    docs = db.query(Doctor).filter(Doctor.id.in_(low_ids)).all() if low_ids else []
    out = []
    for d in docs:
        p, c = prev[d.id], cur.get(d.id, 0)
        out.append({"doctor": d, "doctor_id": d.id, "name": d.name, "rep_id": d.rep_id,
                    "units_prev": p, "units_cur": c, "drop": p - c})
    out.sort(key=lambda x: (-x["drop"], x["name"] or ""))
    return {"ok": True, "cutoff": w["cutoff"].isoformat(), "doctors": out,
            "prev_label": w["prev_start"].strftime("%m/%Y")}


def _note(x: dict, cutoff: str) -> str:
    day = int(cutoff[-2:])
    return (f"Venta baja: {x['units_cur']} uds este mes vs {x['units_prev']} al día {day} "
            f"del mes anterior. Visita agendada automáticamente.")


def _merge_note(existing: Optional[str], note: str) -> str:
    """Conserva las notas del visitador y reemplaza solo la línea automática de venta baja."""
    lines = [l for l in (existing or "").splitlines() if not l.startswith("Venta baja:")]
    return "\n".join(lines + [note]).strip()


def schedule_low_sales_visits(db: Session, rep_id: Optional[int] = None, dry_run: bool = False,
                              now: Optional[datetime] = None) -> dict:
    now = now or _now_local()
    found = find_low_sales_doctors(db, rep_id, now)
    if not found["ok"]:
        return {"ok": False, "reason": found["reason"], "creados": [], "reagendados": [], "omitidos": []}

    today = datetime(now.year, now.month, now.day)
    start = today + timedelta(days=1, hours=VISIT_HOUR)  # desde mañana, 9:00
    end = start + timedelta(days=WINDOW_DAYS)
    day_counts = _build_day_counts(db, today, end)

    creados, reagendados, etiquetados, omitidos, sin_cupo = [], [], [], [], []
    for x in found["doctors"]:
        d = x["doctor"]
        note = _note(x, found["cutoff"])

        upcoming = db.query(Visit).filter(
            Visit.doctor_id == d.id, Visit.status == "scheduled",
            Visit.scheduled_date >= today, Visit.scheduled_date < today + timedelta(days=LOOKAHEAD_DAYS + 1),
        ).order_by(Visit.scheduled_date).first()
        if upcoming:
            if not dry_run:
                if upcoming.origin != ORIGIN:
                    etiquetados.append({"doctor_id": d.id, "nombre": d.name,
                                        "fecha": upcoming.scheduled_date.date().isoformat()})
                upcoming.origin = ORIGIN
                upcoming.notes = _merge_note(upcoming.notes, note)  # actualiza cifras
            omitidos.append({"doctor_id": d.id, "nombre": d.name, "motivo": "ya tiene visita próxima"})
            continue

        recent = db.query(Visit.id).filter(
            Visit.doctor_id == d.id, Visit.status == "completed",
            func.coalesce(Visit.actual_date, Visit.scheduled_date) >= today - timedelta(days=RECENT_VISIT_DAYS),
        ).first()
        if recent:
            omitidos.append({"doctor_id": d.id, "nombre": d.name, "motivo": "visitado en los últimos 7 días"})
            continue

        slot = _next_available_slot(day_counts, d.rep_id, start, end, MAX_VISITS_PER_DAY)
        if slot is None:
            sin_cupo.append({"doctor_id": d.id, "nombre": d.name})
            continue
        day_counts[(d.rep_id, slot.date())] = day_counts.get((d.rep_id, slot.date()), 0) + 1

        # Reutiliza una visita automática anterior que quedó sin hacer, en vez de duplicar
        stale = db.query(Visit).filter(
            Visit.doctor_id == d.id, Visit.status == "scheduled",
            Visit.origin == ORIGIN, Visit.scheduled_date < today,
        ).first()
        item = {"doctor_id": d.id, "nombre": d.name, "rep_id": d.rep_id, "fecha": slot.date().isoformat(),
                "units_cur": x["units_cur"], "units_prev": x["units_prev"]}
        if dry_run:
            (reagendados if stale else creados).append(item)
            continue
        if stale:
            stale.scheduled_date = slot
            stale.notes = _merge_note(stale.notes, note)
            stale.rep_id = d.rep_id
            reagendados.append(item)
        else:
            db.add(Visit(doctor_id=d.id, rep_id=d.rep_id, scheduled_date=slot, status="scheduled",
                         notes=note, origin=ORIGIN))
            creados.append(item)

    if not dry_run:
        db.commit()
    return {
        "ok": True, "dry_run": dry_run, "cutoff": found["cutoff"],
        "medicos_venta_baja": len(found["doctors"]),
        "creados": creados, "reagendados": reagendados, "etiquetados": etiquetados,
        "omitidos": omitidos, "sin_cupo": sin_cupo,
    }


def run_low_sales_job() -> None:
    from .database import SessionLocal
    db = SessionLocal()
    try:
        schedule_low_sales_visits(db)
    except Exception:
        db.rollback()
    finally:
        db.close()
