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

import re
import threading

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


_JOB_LOCK = threading.Lock()  # evita dos revisiones simultáneas en el mismo servidor


def _nr(rut) -> str:
    return re.sub(r"[^0-9K]", "", str(rut or "").upper())


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
    # Se consideran todas las fichas con ventas en alguno de los dos tramos; la comparación
    # se hace por persona (agrupando fichas con el mismo RUT) más abajo.
    all_ids = list(set(prev) | set(cur))
    docs = db.query(Doctor).filter(Doctor.id.in_(all_ids)).all() if all_ids else []
    out = []
    for d in docs:
        p, c = prev.get(d.id, 0), cur.get(d.id, 0)
        out.append({"doctor": d, "doctor_id": d.id, "name": d.name, "rep_id": d.rep_id,
                    "units_prev": p, "units_cur": c, "drop": p - c})
    # Una sola entrada por persona: fichas duplicadas con el mismo RUT se agrupan
    by_key: dict = {}
    for x in out:
        k = _nr(x["doctor"].rut) or f"id:{x['doctor_id']}"
        g = by_key.get(k)
        if g is None:
            x["all_ids"] = {x["doctor_id"]}
            by_key[k] = x
        else:
            g["all_ids"].add(x["doctor_id"])
            g["units_prev"] += x["units_prev"]
            g["units_cur"] += x["units_cur"]
            # preferir la ficha activa con visitador
            if x["doctor"].is_active and x["doctor"].rep_id and not (g["doctor"].is_active and g["doctor"].rep_id):
                for f in ("doctor", "doctor_id", "name", "rep_id"):
                    g[f] = x[f]
    out = [g for g in by_key.values() if g["units_cur"] < g["units_prev"] and g["doctor"].rep_id]
    # incluir también fichas con el mismo RUT que no tuvieron ventas, para revisar sus visitas
    ruts = {_nr(g["doctor"].rut) for g in out if _nr(g["doctor"].rut)}
    if ruts:
        for did, rut in db.query(Doctor.id, Doctor.rut).filter(Doctor.rut.isnot(None)).all():
            k = _nr(rut)
            if k in ruts:
                for g in out:
                    if _nr(g["doctor"].rut) == k:
                        g["all_ids"].add(did)
    for g in out:
        g["drop"] = g["units_prev"] - g["units_cur"]
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
    handled: set = set()  # médicos ya procesados en esta revisión (la sesión no hace autoflush)
    for x in found["doctors"]:
        d = x["doctor"]
        ids = list(x.get("all_ids") or {d.id})
        if handled & set(ids):
            continue
        handled.update(ids)
        note = _note(x, found["cutoff"])

        # Cualquier visita pendiente desde hoy hasta el final de la ventana de agendamiento
        # (antes se miraban solo 7 días y se agendaba hasta 10 → duplicados)
        upcoming = db.query(Visit).filter(
            Visit.doctor_id.in_(ids), Visit.status == "scheduled",
            Visit.scheduled_date >= today, Visit.scheduled_date <= end,
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
            Visit.doctor_id.in_(ids), Visit.status == "completed",
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
            Visit.doctor_id.in_(ids), Visit.status == "scheduled",
            Visit.origin == ORIGIN, Visit.scheduled_date < today,
        ).first()
        item = {"doctor_id": d.id, "nombre": d.name, "rep_id": d.rep_id, "fecha": slot.date().isoformat(),
                "units_cur": x["units_cur"], "units_prev": x["units_prev"]}
        if dry_run:
            (reagendados if stale else creados).append(item)
            continue
        if stale:
            stale.doctor_id = d.id
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


def remove_duplicate_auto_visits(db: Session, dry_run: bool = False, now: Optional[datetime] = None) -> dict:
    """Elimina visitas automáticas (origin=low_sales) repetidas del mismo médico.
    Por médico (agrupando fichas con el mismo RUT) conserva una sola visita automática pendiente:
    la más próxima desde hoy, o si no hay futuras, la más reciente. Si el médico ya tiene una visita
    manual pendiente en el mismo día, la automática de ese día también se elimina.
    Nunca toca visitas manuales ni visitas ya realizadas/canceladas."""
    now = now or _now_local()
    today = datetime(now.year, now.month, now.day)
    autos = db.query(Visit).filter(Visit.origin == ORIGIN, Visit.status == "scheduled").all()
    if not autos:
        return {"eliminadas": 0, "detalle": []}
    doc_ids = {v.doctor_id for v in autos}
    rut_of = {did: _nr(rut) for did, rut in db.query(Doctor.id, Doctor.rut).filter(Doctor.id.in_(doc_ids)).all()}
    key = lambda did: rut_of.get(did) or f"id:{did}"
    manual_days = {(key(v.doctor_id), v.scheduled_date.date()) for v in db.query(Visit).filter(
        Visit.doctor_id.in_(doc_ids), Visit.status == "scheduled", Visit.scheduled_date >= today,
        (Visit.origin.is_(None)) | (Visit.origin != ORIGIN)).all()}
    groups: dict = {}
    for v in autos:
        groups.setdefault(key(v.doctor_id), []).append(v)
    to_delete = []
    for k, vs in groups.items():
        future = sorted([v for v in vs if v.scheduled_date >= today], key=lambda v: (v.scheduled_date, v.id))
        past = sorted([v for v in vs if v.scheduled_date < today], key=lambda v: (v.scheduled_date, v.id))
        keep = future[0] if future else past[-1]
        for v in vs:
            if v is not keep:
                to_delete.append(v)
        if keep.scheduled_date >= today and (k, keep.scheduled_date.date()) in manual_days:
            to_delete.append(keep)
    detalle = [{"visit_id": v.id, "doctor_id": v.doctor_id, "fecha": v.scheduled_date.isoformat()} for v in to_delete]
    if not dry_run and to_delete:
        for v in to_delete:
            db.delete(v)
        db.commit()
    return {"eliminadas": len(to_delete), "detalle": detalle}


def run_low_sales_job() -> None:
    from .database import SessionLocal
    if not _JOB_LOCK.acquire(blocking=False):
        return  # ya hay una revisión corriendo
    db = SessionLocal()
    try:
        remove_duplicate_auto_visits(db)
        schedule_low_sales_visits(db)
    except Exception:
        db.rollback()
    finally:
        db.close()
        _JOB_LOCK.release()
