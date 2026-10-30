from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, case
import math

def safe_float(v):
    try:
        f = float(v or 0)
        return 0.0 if math.isnan(f) or math.isinf(f) else f
    except Exception:
        return 0.0
from datetime import datetime, timedelta
from ..database import get_db
from ..models import Doctor, MedicalRep, Visit, Sale, BusinessLine, AgentConversationMessage, UserSession, LocationPing
from ..schemas import DashboardStats, RepStats
from ..constants import MAX_VISITS_PER_DAY, count_weekdays, to_net
from ..sales_goals import sales_goal, net_sales_trend

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/debug-sales-total")
def debug_sales_total(
    month: int = Query(default=None),
    year: int = Query(default=None),
    db: Session = Depends(get_db)
):
    """Debug: muestra total real de ventas en DB para el período."""
    now = datetime.utcnow()
    month = month or now.month
    year = year or now.year
    from calendar import monthrange
    _, last_day = monthrange(year, month)
    p_start = datetime(year, month, 1)
    p_end = datetime(year, month, last_day, 23, 59, 59)

    all_sales = db.query(Sale).filter(Sale.sale_date >= p_start, Sale.sale_date <= p_end).all()
    null_date = db.query(Sale).filter(Sale.sale_date.is_(None)).count()
    total = sum(safe_float(s.amount) for s in all_sales)
    zero_amount = sum(1 for s in all_sales if safe_float(s.amount) == 0)
    null_doctor = sum(1 for s in all_sales if s.doctor_id is None)

    from ..models import Doctor, MedicalRep
    inactive_rep_ids = [r.id for r in db.query(MedicalRep).filter(MedicalRep.is_active == False).all()]
    inactive_rep_doctors = db.query(Doctor).filter(Doctor.rep_id.in_(inactive_rep_ids)).all() if inactive_rep_ids else []
    inactive_rep_doc_ids = {d.id for d in inactive_rep_doctors}
    inactive_rep_sales = [s for s in all_sales if s.doctor_id in inactive_rep_doc_ids]
    inactive_rep_total = sum(safe_float(s.amount) for s in inactive_rep_sales)

    return {
        "period": f"{year}-{month:02d}",
        "total_sales_in_db": len(all_sales),
        "total_amount_in_db": round(total, 2),
        "sales_with_zero_amount": zero_amount,
        "sales_with_null_doctor": null_doctor,
        "sales_with_null_date_total": null_date,
        "inactive_rep_doctors_count": len(inactive_rep_doctors),
        "sales_under_inactive_reps": len(inactive_rep_sales),
        "amount_under_inactive_reps": round(inactive_rep_total, 2),
    }


@router.get("/stats", response_model=DashboardStats)
def get_stats(db: Session = Depends(get_db)):
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    week_start = today_start - timedelta(days=today_start.weekday())
    week_end = week_start + timedelta(days=7)

    total_doctors = db.query(func.count(Doctor.id)).filter(Doctor.is_active == True).scalar()
    active_reps = db.query(func.count(MedicalRep.id)).filter(MedicalRep.is_active == True).scalar()
    visits_today = db.query(func.count(Visit.id)).filter(
        Visit.scheduled_date >= today_start,
        Visit.scheduled_date < today_end
    ).scalar()
    visits_this_week = db.query(func.count(Visit.id)).filter(
        Visit.scheduled_date >= week_start,
        Visit.scheduled_date < week_end
    ).scalar()
    total_visits = db.query(func.count(Visit.id)).scalar()
    completed_visits = db.query(func.count(Visit.id)).filter(Visit.status == "completed").scalar()
    missed_visits = db.query(func.count(Visit.id)).filter(Visit.status == "missed").scalar()

    return DashboardStats(
        total_doctors=total_doctors,
        active_reps=active_reps,
        visits_today=visits_today,
        visits_this_week=visits_this_week,
        total_visits=total_visits,
        completed_visits=completed_visits,
        missed_visits=missed_visits
    )


@router.get("/today")
def get_today_visits(db: Session = Depends(get_db)):
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    visits = db.query(Visit).filter(
        Visit.scheduled_date >= today_start,
        Visit.scheduled_date < today_end
    ).all()

    result = []
    for v in visits:
        result.append({
            "visit_id": v.id,
            "doctor_name": v.doctor.name if v.doctor else "N/A",
            "doctor_specialty": v.doctor.specialty if v.doctor else None,
            "rep_name": v.rep.name if v.rep else "N/A",
            "rep_id": v.rep_id,
            "scheduled_date": v.scheduled_date.isoformat() if v.scheduled_date else None,
            "status": v.status,
            "notes": v.notes
        })
    return result


@router.get("/visits-by-rep")
def get_visits_by_rep(db: Session = Depends(get_db)):
    reps = db.query(MedicalRep).filter(MedicalRep.is_active == True).all()
    result = []
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    for rep in reps:
        count = db.query(func.count(Visit.id)).filter(
            Visit.rep_id == rep.id,
            Visit.scheduled_date >= month_start
        ).scalar()
        result.append({"rep_name": rep.name, "visits": count, "rep_id": rep.id})
    return result


@router.get("/sales-by-business-line")
def get_sales_by_business_line(db: Session = Depends(get_db)):
    bls = db.query(BusinessLine).all()
    result = []
    for bl in bls:
        count = db.query(func.count(Sale.id)).join(
            Doctor, Sale.doctor_id == Doctor.id
        ).filter(Doctor.business_line_id == bl.id).scalar() or 0
        result.append({"name": bl.name, "value": int(count), "color": bl.color})
    return result


@router.get("/daily-tracking")
def get_daily_tracking(date: str = None, db: Session = Depends(get_db)):
    """Visitas completadas por visitador para una fecha específica (default: hoy)"""
    if date:
        try:
            target_date = datetime.strptime(date, "%Y-%m-%d")
        except ValueError:
            target_date = datetime.utcnow()
    else:
        target_date = datetime.utcnow()

    day_start = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)

    reps = db.query(MedicalRep).filter(MedicalRep.is_active == True).all()
    result = []

    for rep in reps:
        total = db.query(func.count(Visit.id)).filter(
            Visit.rep_id == rep.id,
            Visit.scheduled_date >= day_start,
            Visit.scheduled_date < day_end
        ).scalar() or 0

        completed = db.query(func.count(Visit.id)).filter(
            Visit.rep_id == rep.id,
            Visit.scheduled_date >= day_start,
            Visit.scheduled_date < day_end,
            Visit.status == "completed"
        ).scalar() or 0

        pending = db.query(func.count(Visit.id)).filter(
            Visit.rep_id == rep.id,
            Visit.scheduled_date >= day_start,
            Visit.scheduled_date < day_end,
            Visit.status == "scheduled"
        ).scalar() or 0

        missed = db.query(func.count(Visit.id)).filter(
            Visit.rep_id == rep.id,
            Visit.scheduled_date >= day_start,
            Visit.scheduled_date < day_end,
            Visit.status == "missed"
        ).scalar() or 0

        if total > 0:
            meta_diaria = MAX_VISITS_PER_DAY if count_weekdays(day_start, day_end) > 0 else 0
            result.append({
                "rep_id": rep.id,
                "rep_name": rep.name,
                "total": total,
                "completed": completed,
                "pending": pending,
                "missed": missed,
                "completion_rate": round((completed / total) * 100) if total > 0 else 0,
                "meta_diaria": meta_diaria,
                "cumplimiento_meta": round((completed / meta_diaria) * 100) if meta_diaria > 0 else None
            })

    result.sort(key=lambda x: x["completion_rate"], reverse=True)
    return {
        "date": day_start.strftime("%Y-%m-%d"),
        "meta_diaria_por_visitador": MAX_VISITS_PER_DAY,
        "reps": result
    }


@router.get("/rep/{rep_id}/stats")
def get_rep_stats(rep_id: int, db: Session = Depends(get_db)):
    rep = db.query(MedicalRep).filter(MedicalRep.id == rep_id).first()
    if not rep:
        return {"error": "Visitador no encontrado"}

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    week_start = today_start - timedelta(days=today_start.weekday())
    week_end = week_start + timedelta(days=7)
    month_start = today_start.replace(day=1)

    doctor_count = db.query(func.count(Doctor.id)).filter(
        Doctor.rep_id == rep_id, Doctor.is_active == True
    ).scalar()
    visits_today = db.query(func.count(Visit.id)).filter(
        Visit.rep_id == rep_id,
        Visit.scheduled_date >= today_start,
        Visit.scheduled_date < today_end
    ).scalar()
    visits_week = db.query(func.count(Visit.id)).filter(
        Visit.rep_id == rep_id,
        Visit.scheduled_date >= week_start,
        Visit.scheduled_date < week_end
    ).scalar()
    completed_month = db.query(func.count(Visit.id)).filter(
        Visit.rep_id == rep_id,
        Visit.status == "completed",
        Visit.scheduled_date >= month_start
    ).scalar()
    missed_month = db.query(func.count(Visit.id)).filter(
        Visit.rep_id == rep_id,
        Visit.status == "missed",
        Visit.scheduled_date >= month_start
    ).scalar()

    # Upcoming visits this week
    upcoming = db.query(Visit).filter(
        Visit.rep_id == rep_id,
        Visit.scheduled_date >= today_start,
        Visit.scheduled_date < today_start + timedelta(days=8),  # próximos 7 días
        Visit.status == "scheduled"
    ).order_by(Visit.scheduled_date.asc()).all()

    upcoming_list = []
    for v in upcoming:
        upcoming_list.append({
            "visit_id": v.id,
            "doctor_id": v.doctor_id,
            "doctor_name": v.doctor.name if v.doctor else "N/A",
            "doctor_specialty": v.doctor.specialty if v.doctor else None,
            "scheduled_date": v.scheduled_date.isoformat() if v.scheduled_date else None,
            "status": v.status,
            "origin": getattr(v, "origin", None),
            "notes": v.notes,
        })

    return {
        "rep_id": rep_id,
        "rep_name": rep.name,
        "doctor_count": doctor_count,
        "visits_today": visits_today,
        "visits_this_week": visits_week,
        "completed_this_month": completed_month,
        "missed_this_month": missed_month,
        "upcoming_visits": upcoming_list
    }


@router.get("/doctor-ranking")
def get_doctor_ranking(
    month: int = Query(default=None),
    year: int = Query(default=None),
    rep_id: int = Query(default=None),
    db: Session = Depends(get_db)
):
    """Ranking mensual de médicos por unidades vendidas."""
    now = datetime.utcnow()
    month = month or now.month
    year = year or now.year

    from calendar import monthrange
    _, last_day = monthrange(year, month)
    period_start = datetime(year, month, 1)
    period_end = datetime(year, month, last_day, 23, 59, 59)

    # Si se filtra por rep, limitar a los doctor_ids de ese rep
    rep_doctor_ids = None
    if rep_id:
        rep_doctor_ids = [d.id for d in db.query(Doctor).filter(
            Doctor.rep_id == rep_id, Doctor.is_active == True
        ).all()]

    sales_query = db.query(Sale).filter(
        Sale.sale_date >= period_start,
        Sale.sale_date <= period_end
    )
    if rep_doctor_ids is not None:
        sales_query = sales_query.filter(Sale.doctor_id.in_(rep_doctor_ids))
    sales = sales_query.all()

    # Pre-cargar doctors y reps en memoria
    all_doctors = {d.id: d for d in db.query(Doctor).all()}
    all_reps = {r.id: r for r in db.query(MedicalRep).all()}

    # Clave: doctor_id si existe, si no rut_doctor, si no nombre raw
    # Esto evita duplicados cuando el mismo doctor tiene ventas con y sin rut
    doctor_map = {}
    for s in sales:
        key = s.doctor_id or s.rut_doctor or s.doctor_name_raw
        if not key:
            continue
        if key not in doctor_map:
            doctor = all_doctors.get(s.doctor_id) if s.doctor_id else None
            rep = all_reps.get(doctor.rep_id) if doctor and doctor.rep_id else None
            doctor_map[key] = {
                "doctor_id": doctor.id if doctor else None,
                "doctor_name": doctor.name if doctor else (s.doctor_name_raw or "Sin nombre"),
                "rut_doctor": (doctor.rut if doctor and doctor.rut else None) or s.rut_doctor or "",
                "specialty": doctor.specialty if doctor else None,
                "rep_name": rep.name if rep else "Sin visitador",
                "rep_id": rep.id if rep else None,
                "units": 0,
                "total_amount": 0.0,
                "categorias": set(),
            }
        doctor_map[key]["units"] += 1
        doctor_map[key]["total_amount"] += safe_float(s.amount)
        if s.categoria:
            doctor_map[key]["categorias"].add(s.categoria)

    result = []
    for item in doctor_map.values():
        item["categorias"] = list(item["categorias"])
        result.append(item)

    result.sort(key=lambda x: x["units"], reverse=True)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Médicos nuevos — lógica compartida (tabla mensual, tendencia y export por rango)
# Un médico es "nuevo" en el período si su PRIMERA venta histórica cae dentro de él.
# ─────────────────────────────────────────────────────────────────────────────

def _first_sale_maps(db: Session):
    """Devuelve (primera venta por doctor_id, primera venta por RUT sin doctor_id, ruts con ficha)."""
    first_by_doc = {
        doc_id: d for doc_id, d in db.query(Sale.doctor_id, func.min(Sale.sale_date))
        .filter(Sale.doctor_id.isnot(None), Sale.sale_date.isnot(None))
        .group_by(Sale.doctor_id).all() if d
    }
    first_by_rut = {
        rut: d for rut, d in db.query(Sale.rut_doctor, func.min(Sale.sale_date))
        .filter(Sale.rut_doctor.isnot(None), Sale.rut_doctor != "", Sale.sale_date.isnot(None))
        .group_by(Sale.rut_doctor).all() if d
    }
    # RUTs que ya están vinculados a una ficha de médico (se cuentan vía doctor_id)
    ruts_with_doc = {
        r for (r,) in db.query(Sale.rut_doctor).filter(
            Sale.doctor_id.isnot(None), Sale.rut_doctor.isnot(None)
        ).distinct().all()
    }
    return first_by_doc, first_by_rut, ruts_with_doc


def _new_doctor_keys(db: Session, start: datetime, end: datetime):
    """Claves de médicos cuya primera venta cae en [start, end]."""
    first_by_doc, first_by_rut, ruts_with_doc = _first_sale_maps(db)
    inactive = {d.id for d in db.query(Doctor.id).filter(Doctor.is_active == False).all()}  # noqa: E712
    doc_keys = {
        doc_id: d for doc_id, d in first_by_doc.items()
        if start <= d <= end and doc_id not in inactive
    }
    rut_keys = {
        rut: d for rut, d in first_by_rut.items()
        if start <= d <= end and rut not in ruts_with_doc
    }
    return doc_keys, rut_keys


def _build_new_doctors(db: Session, start: datetime, end: datetime):
    """Lista detallada de médicos nuevos en [start, end] (ventas del período agregadas)."""
    doc_keys, rut_keys = _new_doctor_keys(db, start, end)
    if not doc_keys and not rut_keys:
        return []

    period_sales = db.query(Sale).filter(Sale.sale_date >= start, Sale.sale_date <= end).all()
    all_doctors = {d.id: d for d in db.query(Doctor).all()}
    all_reps = {r.id: r for r in db.query(MedicalRep).all()}
    all_blines = {bl.id: bl for bl in db.query(BusinessLine).all()}

    grouped: dict = {}
    for s in period_sales:
        if s.doctor_id and s.doctor_id in doc_keys:
            key = ("d", s.doctor_id)
        elif not s.doctor_id and s.rut_doctor and s.rut_doctor in rut_keys:
            key = ("r", s.rut_doctor)
        else:
            continue
        grouped.setdefault(key, []).append(s)

    result = []
    for (kind, kval), doc_sales in grouped.items():
        doctor = all_doctors.get(kval) if kind == "d" else None
        first = doc_keys[kval] if kind == "d" else rut_keys[kval]
        rep = all_reps.get(doctor.rep_id) if doctor and doctor.rep_id else None
        bl = all_blines.get(doctor.business_line_id) if doctor and doctor.business_line_id else None
        raw_name = next((x.doctor_name_raw for x in doc_sales if x.doctor_name_raw), None)
        raw_rut = next((x.rut_doctor for x in doc_sales if x.rut_doctor), None)
        result.append({
            "doctor_id": doctor.id if doctor else None,
            "rut_doctor": (doctor.rut if doctor and doctor.rut else None) or raw_rut or "",
            "doctor_name": doctor.name if doctor else (raw_name or "Sin nombre"),
            "specialty": doctor.specialty if doctor else None,
            "email": doctor.email if doctor else None,
            "phone": doctor.phone if doctor else None,
            "primera_venta": first.isoformat() if first else None,
            "rep_name": rep.name if rep else None,
            "rep_id": rep.id if rep else None,
            "productos": sorted(set(x.product for x in doc_sales if x.product)),
            "categorias": sorted(set(x.categoria for x in doc_sales if x.categoria)),
            "business_line_id": doctor.business_line_id if doctor else None,
            "business_line_name": bl.name if bl else None,
            "total_amount": sum(safe_float(x.amount) for x in doc_sales),
            "sales_count": len(doc_sales),
        })

    result.sort(key=lambda x: x["primera_venta"] or "")
    return result


@router.get("/new-doctors")
def get_new_doctors(
    month: int = Query(default=None),
    year: int = Query(default=None),
    db: Session = Depends(get_db)
):
    """Médicos que prescriben por primera vez en el mes indicado."""
    from calendar import monthrange
    now = datetime.utcnow()
    month = month or now.month
    year = year or now.year
    _, last_day = monthrange(year, month)
    return _build_new_doctors(db, datetime(year, month, 1), datetime(year, month, last_day, 23, 59, 59))


@router.get("/new-doctors-range")
def get_new_doctors_range(
    start_month: int = Query(...),
    start_year: int = Query(...),
    end_month: int = Query(...),
    end_year: int = Query(...),
    db: Session = Depends(get_db)
):
    """Médicos nuevos (primera prescripción) entre dos meses, ambos inclusive."""
    from calendar import monthrange
    start = datetime(start_year, start_month, 1)
    _, last_day = monthrange(end_year, end_month)
    end = datetime(end_year, end_month, last_day, 23, 59, 59)
    if end < start:
        start, end = datetime(end_year, end_month, 1), datetime(start_year, start_month, monthrange(start_year, start_month)[1], 23, 59, 59)
    return _build_new_doctors(db, start, end)


@router.get("/new-doctors-trend")
def get_new_doctors_trend(
    months: int = Query(default=12, ge=1, le=36),
    end_month: int = Query(default=None),
    end_year: int = Query(default=None),
    db: Session = Depends(get_db)
):
    """Cantidad de médicos nuevos por mes en los últimos N meses (terminando en end_month/end_year)."""
    from calendar import monthrange
    now = datetime.utcnow()
    end_month = end_month or now.month
    end_year = end_year or now.year

    # Lista de (año, mes) desde el más antiguo al más reciente
    periods = []
    y, m = end_year, end_month
    for _ in range(months):
        periods.append((y, m))
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    periods.reverse()

    start = datetime(periods[0][0], periods[0][1], 1)
    _, last_day = monthrange(end_year, end_month)
    end = datetime(end_year, end_month, last_day, 23, 59, 59)

    doc_keys, rut_keys = _new_doctor_keys(db, start, end)
    doc_rep = {d.id: d.rep_id for d in db.query(Doctor.id, Doctor.rep_id).filter(Doctor.id.in_(list(doc_keys.keys()))).all()} if doc_keys else {}

    buckets = {p: {"con_visitador": 0, "sin_visitador": 0} for p in periods}
    for doc_id, d in doc_keys.items():
        b = buckets.get((d.year, d.month))
        if b is not None:
            b["con_visitador" if doc_rep.get(doc_id) else "sin_visitador"] += 1
    for _rut, d in rut_keys.items():
        b = buckets.get((d.year, d.month))
        if b is not None:
            b["sin_visitador"] += 1

    return [
        {
            "year": y, "month": m,
            "total": buckets[(y, m)]["con_visitador"] + buckets[(y, m)]["sin_visitador"],
            "con_visitador": buckets[(y, m)]["con_visitador"],
            "sin_visitador": buckets[(y, m)]["sin_visitador"],
        }
        for (y, m) in periods
    ]


@router.get("/sales-by-doctor")
def get_sales_by_doctor(
    month: int = Query(default=None),
    year: int = Query(default=None),
    top: int = Query(default=20),
    db: Session = Depends(get_db)
):
    """Unidades vendidas por médico: mes seleccionado vs mes anterior."""
    from calendar import monthrange

    now = datetime.utcnow()
    month = month or now.month
    year = year or now.year

    _, last_day = monthrange(year, month)
    period_start = datetime(year, month, 1)
    period_end = datetime(year, month, last_day, 23, 59, 59)

    prev_month = month - 1 if month > 1 else 12
    prev_year = year if month > 1 else year - 1
    _, prev_last_day = monthrange(prev_year, prev_month)
    prev_start = datetime(prev_year, prev_month, 1)
    prev_end = datetime(prev_year, prev_month, prev_last_day, 23, 59, 59)

    current_sales = db.query(Sale).filter(
        Sale.sale_date >= period_start,
        Sale.sale_date <= period_end
    ).all()

    prev_sales = db.query(Sale).filter(
        Sale.sale_date >= prev_start,
        Sale.sale_date <= prev_end
    ).all()

    # Pre-cargar doctors y reps en memoria para evitar N+1 queries
    all_doctors = {d.id: d for d in db.query(Doctor).all()}
    all_reps = {r.id: r for r in db.query(MedicalRep).all()}

    def build_map(sales):
        m = {}
        for s in sales:
            # Usar doctor_id como clave principal para evitar duplicados
            key = s.doctor_id or s.rut_doctor or s.doctor_name_raw
            if not key:
                continue
            if key not in m:
                doctor = all_doctors.get(s.doctor_id) if s.doctor_id else None
                rep = all_reps.get(doctor.rep_id) if doctor and doctor.rep_id else None
                m[key] = {
                    "doctor_name": (doctor.name if doctor else None) or s.doctor_name_raw or "Sin nombre",
                    "rut": (doctor.rut if doctor and doctor.rut else None) or s.rut_doctor or "",
                    "rep_name": rep.name if rep else "Sin visitador",
                    "units": 0,
                    "amount": 0.0,
                }
            m[key]["units"] += 1
            m[key]["amount"] += safe_float(s.amount)
        return m

    current_map = build_map(current_sales)
    prev_map = build_map(prev_sales)

    result = []
    for key in current_map.keys():
        c = current_map[key]
        p = prev_map.get(key, {"units": 0, "amount": 0.0})
        result.append({
            "doctor_name": c["doctor_name"],
            "rut": c["rut"],
            "rep_name": c["rep_name"],
            "units_current": c["units"],
            "units_prev": p["units"],
            "amount_current": round(c["amount"], 2),
            "amount_prev": round(p["amount"], 2),
        })

    result.sort(key=lambda x: x["units_current"], reverse=True)
    return result[:top]


@router.get("/doctor/{doctor_id}/sales-history")
def get_doctor_sales_history(
    doctor_id: int,
    months: int = Query(default=6),
    db: Session = Depends(get_db)
):
    """Historial de ventas de un médico en los últimos N meses."""
    from calendar import monthrange
    from sqlalchemy import or_
    import re as _re

    def norm_rut(r):
        return _re.sub(r'[\.\-\s]', '', r or '').upper()

    now = datetime.utcnow()

    # Obtener doctor y su RUT normalizado
    doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    doctor_rut_norm = norm_rut(doctor.rut) if doctor and doctor.rut else None

    # Rango total de fechas para un solo query
    months_back = months - 1
    start_m, start_y = now.month - months_back, now.year
    while start_m <= 0:
        start_m += 12
        start_y -= 1
    period_start = datetime(start_y, start_m, 1)
    _, last_day_now = monthrange(now.year, now.month)
    period_end = datetime(now.year, now.month, last_day_now, 23, 59, 59)

    # Un solo query amplio: ventas por doctor_id O rut_doctor no nulo
    if doctor_rut_norm:
        sales = db.query(Sale).filter(
            Sale.sale_date >= period_start,
            Sale.sale_date <= period_end,
            or_(Sale.doctor_id == doctor_id, Sale.rut_doctor.isnot(None))
        ).all()
        # Filtrar en Python por RUT normalizado
        sales = [
            s for s in sales
            if s.doctor_id == doctor_id or norm_rut(s.rut_doctor) == doctor_rut_norm
        ]
    else:
        sales = db.query(Sale).filter(
            Sale.sale_date >= period_start,
            Sale.sale_date <= period_end,
            Sale.doctor_id == doctor_id
        ).all()

    # Agrupar por mes
    from collections import defaultdict
    counts: dict = defaultdict(int)
    for s in sales:
        if s.sale_date:
            counts[(s.sale_date.year, s.sale_date.month)] += 1

    LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
    result = []
    for i in range(months - 1, -1, -1):
        m = now.month - i
        y = now.year
        while m <= 0:
            m += 12
            y -= 1
        result.append({"month": m, "year": y, "units": counts[(y, m)], "label": f"{LABELS[m-1]} {y}"})
    return result


@router.get("/rep/{rep_id}/monthly-trend")
def get_rep_monthly_trend(
    rep_id: int,
    months: int = Query(default=6),
    db: Session = Depends(get_db)
):
    """Tendencia mensual de visitas de un visitador en los últimos N meses."""
    from calendar import monthrange
    from collections import defaultdict

    now = datetime.utcnow()

    months_back = months - 1
    start_m, start_y = now.month - months_back, now.year
    while start_m <= 0:
        start_m += 12
        start_y -= 1
    period_start = datetime(start_y, start_m, 1)
    _, last_day_now = monthrange(now.year, now.month)
    period_end = datetime(now.year, now.month, last_day_now, 23, 59, 59)

    visits = db.query(Visit).filter(
        Visit.rep_id == rep_id,
        Visit.scheduled_date >= period_start,
        Visit.scheduled_date <= period_end,
        Visit.status.in_(["completed", "missed", "cancelled", "scheduled"])
    ).all()

    completed: dict = defaultdict(int)
    missed: dict = defaultdict(int)
    total: dict = defaultdict(int)

    for v in visits:
        key = (v.scheduled_date.year, v.scheduled_date.month)
        total[key] += 1
        if v.status == "completed":
            completed[key] += 1
        elif v.status == "missed":
            missed[key] += 1

    LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
    result = []
    for i in range(months - 1, -1, -1):
        m = now.month - i
        y = now.year
        while m <= 0:
            m += 12
            y -= 1
        key = (y, m)
        result.append({
            "month": m, "year": y,
            "label": LABELS[m - 1],
            "completed": completed[key],
            "missed": missed[key],
            "total": total[key],
        })
    return result


@router.get("/rep/{rep_id}/sales-trend")
def get_rep_sales_trend(
    rep_id: int,
    months: int = Query(default=6, ge=1, le=36),
    db: Session = Depends(get_db)
):
    """Tendencia mensual de venta (bruta con IVA, neta sin IVA y unidades) de un visitador,
    con la meta de cada mes (venta neta del mes anterior + SALES_GROWTH_TARGET)."""
    return net_sales_trend(db, rep_id, months)


@router.get("/rep/{rep_id}/detail")
def get_rep_detail(
    rep_id: int,
    month: int = Query(default=None),
    year: int = Query(default=None),
    db: Session = Depends(get_db)
):
    """Resumen detallado de un visitador: visitas y médicos por semana y mes."""
    rep = db.query(MedicalRep).filter(MedicalRep.id == rep_id).first()
    if not rep:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Visitador no encontrado")

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    # Semana actual (lunes a domingo) — siempre es la semana real
    week_start = today_start - timedelta(days=today_start.weekday())
    week_end = week_start + timedelta(days=7)

    # Mes consultado (default: mes actual)
    from calendar import monthrange
    query_month = month or today_start.month
    query_year = year or today_start.year
    _, last_day = monthrange(query_year, query_month)
    month_start = datetime(query_year, query_month, 1)
    month_end = datetime(query_year, query_month, last_day, 23, 59, 59)

    is_current_month = (query_month == today_start.month and query_year == today_start.year)

    def build_period_summary(start, end):
        visits = db.query(Visit).filter(
            Visit.rep_id == rep_id,
            Visit.scheduled_date >= start,
            Visit.scheduled_date < end
        ).order_by(Visit.scheduled_date.asc()).all()

        total = len(visits)
        completed = sum(1 for v in visits if v.status == "completed")
        missed = sum(1 for v in visits if v.status == "missed")
        pending = sum(1 for v in visits if v.status == "scheduled")
        cancelled = sum(1 for v in visits if v.status == "cancelled")
        completion_rate = round((completed / total) * 100) if total > 0 else 0

        visits_list = []
        for v in visits:
            visits_list.append({
                "visit_id": v.id,
                "doctor_id": v.doctor_id,
                "doctor_name": v.doctor.name if v.doctor else "N/A",
                "doctor_specialty": v.doctor.specialty if v.doctor else None,
                "doctor_address": v.doctor.address if v.doctor else None,
                "scheduled_date": v.scheduled_date.isoformat() if v.scheduled_date else None,
                "actual_date": v.actual_date.isoformat() if v.actual_date else None,
                "status": v.status,
                "notes": v.notes,
            })

        return {
            "total": total,
            "completed": completed,
            "missed": missed,
            "pending": pending,
            "cancelled": cancelled,
            "completion_rate": completion_rate,
            "visits": visits_list,
        }

    week_summary = build_period_summary(week_start, week_end)
    month_summary = build_period_summary(month_start, month_end + timedelta(seconds=1))

    # Médicos visitados (con visita completada) en el periodo
    doctors_visited_ids = set(
        v["doctor_id"] for v in month_summary["visits"]
        if v["status"] == "completed" and v["doctor_id"]
    )

    # Ranking de médicos por ventas en el periodo consultado
    rep_doctor_ids = [d.id for d in db.query(Doctor).filter(
        Doctor.rep_id == rep_id, Doctor.is_active == True
    ).all()]

    period_sales = db.query(Sale).filter(
        Sale.doctor_id.in_(rep_doctor_ids),
        Sale.sale_date >= month_start,
        Sale.sale_date <= month_end
    ).all() if rep_doctor_ids else []

    all_rep_doctors = {d.id: d for d in db.query(Doctor).filter(Doctor.id.in_(rep_doctor_ids)).all()} if rep_doctor_ids else {}

    doctor_map = {}
    for s in period_sales:
        key = s.doctor_id
        if not key:
            continue
        if key not in doctor_map:
            doctor = all_rep_doctors.get(key)
            doctor_map[key] = {
                "doctor_id": key,
                "doctor_name": doctor.name if doctor else (s.doctor_name_raw or "Sin nombre"),
                "rut": (doctor.rut if doctor and doctor.rut else None) or s.rut_doctor or "",
                "specialty": doctor.specialty if doctor else None,
                "units": 0,
                "total_amount": 0.0,
                "categorias": set(),
            }
        doctor_map[key]["units"] += 1
        doctor_map[key]["total_amount"] += safe_float(s.amount)
        if s.categoria:
            doctor_map[key]["categorias"].add(s.categoria)

    doctor_ranking = sorted(
        [{"categorias": list(v["categorias"]), "total_amount": round(v["total_amount"], 2),
          **{k: val for k, val in v.items() if k not in ("categorias", "total_amount")}}
         for v in doctor_map.values()],
        key=lambda x: x["units"],
        reverse=True,
    )

    # Métricas de efectividad
    doctors_with_sales_ids = set(doctor_map.keys())
    doctors_visited_with_sales = doctors_visited_ids & doctors_with_sales_ids
    total_assigned = len(rep_doctor_ids)
    n_visited = len(doctors_visited_ids)
    n_with_sales = len(doctors_with_sales_ids)
    n_visited_with_sales = len(doctors_visited_with_sales)

    effectiveness = {
        "total_assigned": total_assigned,
        "doctors_visited": n_visited,
        "doctors_with_sales": n_with_sales,
        "doctors_visited_with_sales": n_visited_with_sales,
        # % de médicos visitados que generaron recetas
        "conversion_rate": round((n_visited_with_sales / n_visited) * 100) if n_visited > 0 else 0,
        # % de médicos asignados que generaron recetas
        "penetration_rate": round((n_with_sales / total_assigned) * 100) if total_assigned > 0 else 0,
        # % de médicos asignados visitados
        "visit_rate": round((n_visited / total_assigned) * 100) if total_assigned > 0 else 0,
    }

    # Comisiones del mes consultado (mismo criterio que /rep-commissions: incluye médicos
    # inactivos para no perder ventas históricas ya generadas por el rep)
    commission_doctor_ids = [d.id for d in db.query(Doctor).filter(Doctor.rep_id == rep_id).all()]
    commission_sales = db.query(Sale).filter(
        Sale.doctor_id.in_(commission_doctor_ids),
        Sale.sale_date >= month_start,
        Sale.sale_date <= month_end
    ).all() if commission_doctor_ids else []

    commission_doctors_with_sales_ids = set(s.doctor_id for s in commission_sales if s.doctor_id)
    commission_total_amount = sum(safe_float(s.amount) for s in commission_sales)

    commission_new_doctors = []
    for doc_id in commission_doctors_with_sales_ids:
        prior = db.query(Sale).filter(
            Sale.doctor_id == doc_id,
            Sale.sale_date < month_start
        ).first()
        if not prior:
            doc = all_rep_doctors.get(doc_id) or db.query(Doctor).filter(Doctor.id == doc_id).first()
            if doc:
                commission_new_doctors.append(doc.name)

    commission_categories: dict = {}
    for s in commission_sales:
        cat = s.categoria or "Sin categoría"
        commission_categories[cat] = commission_categories.get(cat, 0) + 1

    commissions = {
        "total_amount": round(commission_total_amount, 2),
        "net_amount": round(to_net(commission_total_amount), 0),
        "sales_count": len(commission_sales),
        "doctors_with_sales": len(commission_doctors_with_sales_ids),
        "new_doctors_count": len(commission_new_doctors),
        "new_doctors": commission_new_doctors,
        "categories": commission_categories,
    }

    doctor_count = db.query(func.count(Doctor.id)).filter(
        Doctor.rep_id == rep_id, Doctor.is_active == True
    ).scalar()

    return {
        "rep": {
            "id": rep.id,
            "name": rep.name,
            "email": rep.email,
            "phone": rep.phone,
            "territory": rep.territory,
            "zone": rep.zone,
            "is_active": rep.is_active,
            "doctor_count": doctor_count,
        },
        "effectiveness": effectiveness,
        "is_current_month": is_current_month,
        "query_month": query_month,
        "query_year": query_year,
        "week": {
            "start": week_start.strftime("%Y-%m-%d"),
            "end": (week_end - timedelta(days=1)).strftime("%Y-%m-%d"),
            **week_summary,
        },
        "month": {
            "start": month_start.strftime("%Y-%m-%d"),
            "end": month_end.strftime("%Y-%m-%d"),
            **month_summary,
        },
        "doctor_ranking": doctor_ranking,
        "commissions": commissions,
        "sales_goal": sales_goal(db, rep_id, query_year, query_month),
    }


@router.get("/rep-commissions")
def get_rep_commissions(
    month: int = Query(default=None),
    year: int = Query(default=None),
    db: Session = Depends(get_db)
):
    """Resumen de ventas y médicos nuevos por visitador para cálculo de comisiones."""
    now = datetime.utcnow()
    month = month or now.month
    year = year or now.year

    from calendar import monthrange
    _, last_day = monthrange(year, month)
    period_start = datetime(year, month, 1)
    period_end = datetime(year, month, last_day, 23, 59, 59)

    reps = db.query(MedicalRep).filter(MedicalRep.is_active == True).all()
    result = []

    for rep in reps:
        rep_doctor_ids = [d.id for d in db.query(Doctor).filter(
            Doctor.rep_id == rep.id  # incluye doctores inactivos para no perder ventas
        ).all()]

        sales_period = db.query(Sale).filter(
            Sale.doctor_id.in_(rep_doctor_ids),
            Sale.sale_date >= period_start,
            Sale.sale_date <= period_end
        ).all() if rep_doctor_ids else []

        doctors_with_sales = len(set(s.doctor_id for s in sales_period if s.doctor_id))
        total_amount = sum(safe_float(s.amount) for s in sales_period)
        sales_count = len(sales_period)

        # New doctors this period assigned to this rep
        new_docs = []
        for doc_id in set(s.doctor_id for s in sales_period if s.doctor_id):
            prior = db.query(Sale).filter(
                Sale.doctor_id == doc_id,
                Sale.sale_date < period_start
            ).first()
            if not prior:
                doc = db.query(Doctor).filter(Doctor.id == doc_id).first()
                if doc:
                    new_docs.append(doc.name)

        # Category breakdown global
        cat_breakdown = {}
        for s in sales_period:
            cat = s.categoria or "Sin categoría"
            cat_breakdown[cat] = cat_breakdown.get(cat, 0) + 1

        # Detalle por médico
        doctor_detail_map = {}
        for s in sales_period:
            if not s.doctor_id:
                continue
            key = s.doctor_id
            if key not in doctor_detail_map:
                doc = db.query(Doctor).filter(Doctor.id == s.doctor_id).first()
                doctor_detail_map[key] = {
                    "doctor_id": s.doctor_id,
                    "doctor_name": doc.name if doc else (s.doctor_name_raw or "Sin nombre"),
                    "rut": (doc.rut if doc and doc.rut else None) or "",
                    "specialty": doc.specialty if doc else None,
                    "is_new": doc.name in new_docs if doc else False,
                    "units": 0,
                    "amount": 0.0,
                    "categories": {},
                }
            doctor_detail_map[key]["units"] += 1
            doctor_detail_map[key]["amount"] += safe_float(s.amount)
            cat = s.categoria or "Sin categoría"
            doctor_detail_map[key]["categories"][cat] = doctor_detail_map[key]["categories"].get(cat, 0) + 1

        doctors_detail = sorted(
            [{"amount": round(v["amount"], 2), **{k: val for k, val in v.items() if k != "amount"}} for v in doctor_detail_map.values()],
            key=lambda x: x["units"],
            reverse=True,
        )

        result.append({
            "rep_id": rep.id,
            "rep_name": rep.name,
            "doctors_with_sales": doctors_with_sales,
            "new_doctors": new_docs,
            "new_doctors_count": len(new_docs),
            "total_amount": total_amount,
            "sales_count": sales_count,
            "categories": cat_breakdown,
            "doctors_detail": doctors_detail,
        })

    result.sort(key=lambda x: x["total_amount"], reverse=True)

    # ── Grupo "Sin visitador": médicos sin rep + ventas sin doctor ───────────
    unassigned_docs = db.query(Doctor).filter(
        Doctor.rep_id.is_(None)  # incluye doctores inactivos para no perder ventas
    ).all()
    unassigned_ids = [d.id for d in unassigned_docs]

    # Sales from doctors without a rep (doctor exists but rep_id is NULL)
    ua_sales_with_doc = db.query(Sale).filter(
        Sale.doctor_id.in_(unassigned_ids) if unassigned_ids else False,
        Sale.sale_date >= period_start,
        Sale.sale_date <= period_end
    ).all() if unassigned_ids else []

    # Sales with no doctor record at all (doctor_id = NULL)
    ua_sales_orphaned = db.query(Sale).filter(
        Sale.doctor_id.is_(None),
        Sale.sale_date >= period_start,
        Sale.sale_date <= period_end
    ).all()

    all_ua_sales = ua_sales_with_doc + ua_sales_orphaned

    if all_ua_sales:
        ua_total = sum(safe_float(s.amount) for s in all_ua_sales)
        ua_count = len(all_ua_sales)
        ua_cat: dict = {}
        ua_doc_map: dict = {}

        for s in ua_sales_with_doc:
            key = s.doctor_id
            if key not in ua_doc_map:
                doc = next((d for d in unassigned_docs if d.id == s.doctor_id), None)
                ua_doc_map[key] = {
                    "doctor_id": s.doctor_id,
                    "doctor_name": doc.name if doc else (s.doctor_name_raw or "Sin nombre"),
                    "rut": (doc.rut if doc else "") or "",
                    "specialty": doc.specialty if doc else None,
                    "is_new": False,
                    "units": 0, "amount": 0.0, "categories": {},
                }
            ua_doc_map[key]["units"] += 1
            ua_doc_map[key]["amount"] += safe_float(s.amount)
            cat = s.categoria or "Sin categoría"
            ua_cat[cat] = ua_cat.get(cat, 0) + 1
            ua_doc_map[key]["categories"][cat] = ua_doc_map[key]["categories"].get(cat, 0) + 1

        for s in ua_sales_orphaned:
            # Use a string key so it doesn't collide with integer doctor_ids
            raw_name = (s.doctor_name_raw or "Sin nombre").strip()
            key = f"orphan_{raw_name.lower()}"
            if key not in ua_doc_map:
                ua_doc_map[key] = {
                    "doctor_id": None,
                    "doctor_name": raw_name,
                    "rut": s.rut_doctor or "",
                    "specialty": None,
                    "is_new": False,
                    "units": 0, "amount": 0.0, "categories": {},
                }
            ua_doc_map[key]["units"] += 1
            ua_doc_map[key]["amount"] += safe_float(s.amount)
            cat = s.categoria or "Sin categoría"
            ua_cat[cat] = ua_cat.get(cat, 0) + 1
            ua_doc_map[key]["categories"][cat] = ua_doc_map[key]["categories"].get(cat, 0) + 1

        ua_detail = sorted(
            [{"amount": round(v["amount"], 2), **{k: val for k, val in v.items() if k != "amount"}} for v in ua_doc_map.values()],
            key=lambda x: x["units"], reverse=True
        )

        result.append({
            "rep_id": None,
            "rep_name": "Sin visitador",
            "doctors_with_sales": len(ua_doc_map),
            "new_doctors": [],
            "new_doctors_count": 0,
            "total_amount": ua_total,
            "sales_count": ua_count,
            "categories": ua_cat,
            "doctors_detail": ua_detail,
        })

    # ── Catch-all: ventas del período no contabilizadas en ningún grupo ───────
    # Captura ventas de doctores asignados a reps inactivos u otros casos edge
    accounted_ids = set()
    for group in result:
        for d in group.get("doctors_detail", []):
            if d.get("doctor_id"):
                accounted_ids.add(d["doctor_id"])

    all_period_sales = db.query(Sale).filter(
        Sale.sale_date >= period_start,
        Sale.sale_date <= period_end
    ).all()

    missed = [s for s in all_period_sales
              if s.doctor_id not in accounted_ids and s.doctor_id is not None]
    missed_orphaned = [s for s in all_period_sales if s.doctor_id is None]
    # orphaned ya fueron incluidos en ua_sales_orphaned si all_ua_sales corrió
    # Solo agregar los que no estén ya en el grupo sin visitador
    unaccounted = missed
    if not all_ua_sales:
        unaccounted += missed_orphaned

    if unaccounted:
        uc_total = sum(safe_float(s.amount) for s in unaccounted)
        uc_count = len(unaccounted)
        uc_cat: dict = {}
        uc_doc_map: dict = {}
        for s in unaccounted:
            key = s.doctor_id or f"orphan_{(s.doctor_name_raw or '').strip().lower()}"
            if key not in uc_doc_map:
                uc_doc_map[key] = {
                    "doctor_id": s.doctor_id,
                    "doctor_name": s.doctor_name_raw or "Sin nombre",
                    "rut": s.rut_doctor or "",
                    "specialty": None,
                    "is_new": False,
                    "units": 0, "amount": 0.0, "categories": {},
                }
            uc_doc_map[key]["units"] += 1
            uc_doc_map[key]["amount"] += safe_float(s.amount)
            cat = s.categoria or "Sin categoría"
            uc_cat[cat] = uc_cat.get(cat, 0) + 1
            uc_doc_map[key]["categories"][cat] = uc_doc_map[key]["categories"].get(cat, 0) + 1

        # Agregar al grupo "Sin visitador" existente si ya existe, o crear nuevo
        sin_vis = next((g for g in result if g["rep_id"] is None), None)
        if sin_vis:
            sin_vis["total_amount"] += uc_total
            sin_vis["sales_count"] += uc_count
            sin_vis["doctors_with_sales"] += len(uc_doc_map)
            for cat, cnt in uc_cat.items():
                sin_vis["categories"][cat] = sin_vis["categories"].get(cat, 0) + cnt
            sin_vis["doctors_detail"] += [
                {"amount": round(v["amount"], 2), **{k: val for k, val in v.items() if k != "amount"}}
                for v in uc_doc_map.values()
            ]
        else:
            result.append({
                "rep_id": None,
                "rep_name": "Sin visitador",
                "doctors_with_sales": len(uc_doc_map),
                "new_doctors": [], "new_doctors_count": 0,
                "total_amount": uc_total,
                "sales_count": uc_count,
                "categories": uc_cat,
                "doctors_detail": [
                    {"amount": round(v["amount"], 2), **{k: val for k, val in v.items() if k != "amount"}}
                    for v in uc_doc_map.values()
                ],
            })

    # Monto neto (sin IVA) para cada grupo y médico
    for g in result:
        g["net_amount"] = round(to_net(g["total_amount"]), 0)
        for d in g.get("doctors_detail", []):
            d["net_amount"] = round(to_net(d.get("amount", 0)), 0)

    return result


@router.get("/commissions-comparison")
def get_commissions_comparison(
    month: int = Query(default=None),
    year: int = Query(default=None),
    db: Session = Depends(get_db)
):
    """Compara las ventas del período transcurrido del mes con los MISMOS DÍAS
    del mes anterior, por visitador. Pensado para seguimiento semanal: a medida
    que avanza el mes, se compara día 1 a hoy vs día 1 al mismo día del mes pasado.

    Si el mes/año consultado ya terminó (no es el mes actual), se compara el
    mes completo contra el mes anterior completo (acotado a sus propios días).
    """
    from calendar import monthrange

    now = datetime.utcnow()
    month = month or now.month
    year = year or now.year

    _, days_in_month = monthrange(year, month)
    is_current = (year == now.year and month == now.month)
    as_of_day = now.day if is_current else days_in_month

    current_start = datetime(year, month, 1)
    current_end = datetime(year, month, as_of_day, 23, 59, 59)

    prev_month = month - 1 if month > 1 else 12
    prev_year = year if month > 1 else year - 1
    _, prev_days_in_month = monthrange(prev_year, prev_month)
    prev_as_of_day = min(as_of_day, prev_days_in_month)

    prev_start = datetime(prev_year, prev_month, 1)
    prev_end = datetime(prev_year, prev_month, prev_as_of_day, 23, 59, 59)

    def _period_stats(doctor_ids, start, end):
        if not doctor_ids:
            return {"total_amount": 0.0, "sales_count": 0, "doctors_with_sales": 0}
        sales = db.query(Sale).filter(
            Sale.doctor_id.in_(doctor_ids),
            Sale.sale_date >= start,
            Sale.sale_date <= end,
        ).all()
        return {
            "total_amount": round(sum(safe_float(s.amount) for s in sales), 2),
            "sales_count": len(sales),
            "doctors_with_sales": len(set(s.doctor_id for s in sales if s.doctor_id)),
        }

    def _pct_change(curr, prev):
        if prev == 0:
            return None if curr == 0 else 100.0
        return round(((curr - prev) / prev) * 100, 1)

    reps = db.query(MedicalRep).filter(MedicalRep.is_active == True).all()
    result = []
    for rep in reps:
        doctor_ids = [d.id for d in db.query(Doctor).filter(Doctor.rep_id == rep.id).all()]
        current = _period_stats(doctor_ids, current_start, current_end)
        previous = _period_stats(doctor_ids, prev_start, prev_end)
        result.append({
            "rep_id": rep.id,
            "rep_name": rep.name,
            "current": current,
            "previous": previous,
            "pct_change_amount": _pct_change(current["total_amount"], previous["total_amount"]),
            "pct_change_units": _pct_change(current["sales_count"], previous["sales_count"]),
        })

    result.sort(key=lambda x: x["current"]["total_amount"], reverse=True)

    all_doctor_ids = [d.id for d in db.query(Doctor).all()]
    global_current = _period_stats(all_doctor_ids, current_start, current_end)
    global_previous = _period_stats(all_doctor_ids, prev_start, prev_end)

    return {
        "is_current_month": is_current,
        "as_of_day": as_of_day,
        "current_period": {"start": current_start.strftime("%Y-%m-%d"), "end": current_end.strftime("%Y-%m-%d")},
        "previous_period": {"start": prev_start.strftime("%Y-%m-%d"), "end": prev_end.strftime("%Y-%m-%d")},
        "global": {
            "current": global_current,
            "previous": global_previous,
            "pct_change_amount": _pct_change(global_current["total_amount"], global_previous["total_amount"]),
            "pct_change_units": _pct_change(global_current["sales_count"], global_previous["sales_count"]),
        },
        "reps": result,
    }


@router.get("/rep/{rep_id}/doctor-comparison")
def get_rep_doctor_comparison(
    rep_id: int,
    month: int = Query(default=None),
    year: int = Query(default=None),
    db: Session = Depends(get_db)
):
    """Compara, médico por médico, las unidades/monto vendidos por un visitador
    en el tramo transcurrido del mes vs el MISMO tramo de días del mes anterior.
    Ordenado para destacar primero a los médicos que más bajaron (o dejaron de
    comprar), para que el visitador identifique rápido dónde reforzar visitas.
    """
    from calendar import monthrange

    now = datetime.utcnow()
    month = month or now.month
    year = year or now.year

    _, days_in_month = monthrange(year, month)
    is_current = (year == now.year and month == now.month)
    as_of_day = now.day if is_current else days_in_month

    current_start = datetime(year, month, 1)
    current_end = datetime(year, month, as_of_day, 23, 59, 59)

    prev_month = month - 1 if month > 1 else 12
    prev_year = year if month > 1 else year - 1
    _, prev_days_in_month = monthrange(prev_year, prev_month)
    prev_as_of_day = min(as_of_day, prev_days_in_month)

    prev_start = datetime(prev_year, prev_month, 1)
    prev_end = datetime(prev_year, prev_month, prev_as_of_day, 23, 59, 59)

    doctors = db.query(Doctor).filter(Doctor.rep_id == rep_id).all()
    doctor_ids = [d.id for d in doctors]
    doctors_by_id = {d.id: d for d in doctors}

    def _by_doctor(start, end):
        if not doctor_ids:
            return {}
        sales = db.query(Sale).filter(
            Sale.doctor_id.in_(doctor_ids),
            Sale.sale_date >= start,
            Sale.sale_date <= end,
        ).all()
        agg: dict = {}
        for s in sales:
            if not s.doctor_id:
                continue
            if s.doctor_id not in agg:
                agg[s.doctor_id] = {"units": 0, "amount": 0.0}
            agg[s.doctor_id]["units"] += 1
            agg[s.doctor_id]["amount"] += safe_float(s.amount)
        return agg

    current_by_doc = _by_doctor(current_start, current_end)
    prev_by_doc = _by_doctor(prev_start, prev_end)

    all_ids = set(current_by_doc.keys()) | set(prev_by_doc.keys())

    def _pct_change(curr, prev):
        if prev == 0:
            return None if curr == 0 else 100.0
        return round(((curr - prev) / prev) * 100, 1)

    rows = []
    for doc_id in all_ids:
        doc = doctors_by_id.get(doc_id)
        curr = current_by_doc.get(doc_id, {"units": 0, "amount": 0.0})
        prev = prev_by_doc.get(doc_id, {"units": 0, "amount": 0.0})
        rows.append({
            "doctor_id": doc_id,
            "doctor_name": doc.name if doc else "Sin nombre",
            "specialty": doc.specialty if doc else None,
            "current_units": curr["units"],
            "current_amount": round(curr["amount"], 2),
            "previous_units": prev["units"],
            "previous_amount": round(prev["amount"], 2),
            "pct_change_units": _pct_change(curr["units"], prev["units"]),
            "stopped_buying": prev["units"] > 0 and curr["units"] == 0,
        })

    # Médicos que más bajaron primero (stopped_buying primero, luego por % change ascendente)
    rows.sort(key=lambda r: (
        0 if r["stopped_buying"] else 1,
        r["pct_change_units"] if r["pct_change_units"] is not None else 999,
    ))

    return {
        "rep_id": rep_id,
        "is_current_month": is_current,
        "as_of_day": as_of_day,
        "current_period": {"start": current_start.strftime("%Y-%m-%d"), "end": current_end.strftime("%Y-%m-%d")},
        "previous_period": {"start": prev_start.strftime("%Y-%m-%d"), "end": prev_end.strftime("%Y-%m-%d")},
        "doctors": rows,
    }


@router.get("/live-locations")
def get_live_locations(
    stale_minutes: int = Query(default=15),
    db: Session = Depends(get_db)
):
    """Última posición conocida de cada visitador con sesión activa (heartbeat cada ~5 min).

    'online' = tuvo actividad dentro de los últimos `stale_minutes` minutos.
    Se toma la sesión abierta (logout_at IS NULL) más reciente por rep_id.
    """
    now = datetime.utcnow()
    open_sessions = (
        db.query(UserSession)
        .filter(UserSession.logout_at.is_(None))
        .order_by(UserSession.rep_id, UserSession.last_activity.desc())
        .all()
    )
    latest_by_rep: dict = {}
    for s in open_sessions:
        if s.rep_id not in latest_by_rep:
            latest_by_rep[s.rep_id] = s

    reps = {r.id: r for r in db.query(MedicalRep).filter(MedicalRep.is_active == True).all()}
    result = []
    for rep_id, session in latest_by_rep.items():
        rep = reps.get(rep_id)
        if not rep:
            continue
        if session.latitude is None or session.longitude is None:
            continue
        minutes_since = max(0, int((now - session.last_activity).total_seconds() / 60)) if session.last_activity else None
        result.append({
            "rep_id": rep_id,
            "rep_name": rep.name,
            "lat": session.latitude,
            "lng": session.longitude,
            "last_activity": session.last_activity.isoformat() if session.last_activity else None,
            "minutes_since": minutes_since,
            "online": minutes_since is not None and minutes_since <= stale_minutes,
        })
    result.sort(key=lambda x: x["minutes_since"] if x["minutes_since"] is not None else 999999)
    return {"reps": result, "total": len(result)}


@router.get("/location-history")
def get_location_history(
    rep_id: int = Query(...),
    date: str = Query(..., description="Fecha en formato YYYY-MM-DD (hora local Chile, se asume UTC-3/-4)"),
    db: Session = Depends(get_db)
):
    """Recorrido de un visitador en un día específico: todos los pings de ubicación
    (login, heartbeats cada ~5 min) ordenados cronológicamente."""
    try:
        day = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        return {"error": "Formato de fecha inválido, use YYYY-MM-DD"}

    start = datetime.combine(day, datetime.min.time())
    end = start + timedelta(days=1)

    pings = (
        db.query(LocationPing)
        .filter(
            LocationPing.rep_id == rep_id,
            LocationPing.recorded_at >= start,
            LocationPing.recorded_at < end,
        )
        .order_by(LocationPing.recorded_at.asc())
        .all()
    )

    rep = db.query(MedicalRep).filter(MedicalRep.id == rep_id).first()

    points = [
        {
            "lat": p.latitude,
            "lng": p.longitude,
            "recorded_at": p.recorded_at.isoformat() if p.recorded_at else None,
        }
        for p in pings
    ]

    return {
        "rep_id": rep_id,
        "rep_name": rep.name if rep else None,
        "date": date,
        "total_points": len(points),
        "points": points,
    }


@router.get("/locations")
def get_locations(
    rep_id: int = Query(default=None),
    days: int = Query(default=30),
    db: Session = Depends(get_db)
):
    """Devuelve eventos con ubicación (visitas + mensajes de agente) para el mapa admin."""
    since = datetime.utcnow() - timedelta(days=days)
    events = []

    # Visitas con coordenadas
    vq = db.query(Visit).filter(
        Visit.latitude.isnot(None),
        Visit.longitude.isnot(None),
        Visit.created_at >= since
    )
    if rep_id:
        vq = vq.filter(Visit.rep_id == rep_id)
    for v in vq.order_by(Visit.created_at.desc()).limit(500).all():
        rep = db.query(MedicalRep).filter(MedicalRep.id == v.rep_id).first()
        doctor = db.query(Doctor).filter(Doctor.id == v.doctor_id).first()
        events.append({
            "type": "visit",
            "id": v.id,
            "rep_id": v.rep_id,
            "rep_name": rep.name if rep else "Desconocido",
            "doctor_name": doctor.name if doctor else "Desconocido",
            "status": v.status,
            "lat": v.latitude,
            "lng": v.longitude,
            "timestamp": v.created_at.isoformat() if v.created_at else None,
            "label": f"Visita: {doctor.name if doctor else 'N/A'} ({v.status})"
        })

    # Mensajes de agente con coordenadas (solo mensajes de usuario)
    mq = db.query(AgentConversationMessage).filter(
        AgentConversationMessage.latitude.isnot(None),
        AgentConversationMessage.longitude.isnot(None),
        AgentConversationMessage.role == "user",
        AgentConversationMessage.created_at >= since
    )
    if rep_id:
        mq = mq.filter(AgentConversationMessage.rep_id == rep_id)
    for m in mq.order_by(AgentConversationMessage.created_at.desc()).limit(500).all():
        rep = db.query(MedicalRep).filter(MedicalRep.id == m.rep_id).first()
        events.append({
            "type": "agent",
            "id": m.id,
            "rep_id": m.rep_id,
            "rep_name": rep.name if rep else "Desconocido",
            "doctor_name": None,
            "status": None,
            "lat": m.latitude,
            "lng": m.longitude,
            "timestamp": m.created_at.isoformat() if m.created_at else None,
            "label": f"Agente IA: {(m.content[:60] + '...') if len(m.content) > 60 else m.content}"
        })

    return {"events": events, "total": len(events)}


# ─── Completitud de datos de médicos (teléfono, correo, centro médico, especialidad) ──

@router.get("/rep/{rep_id}/data-completeness")
def get_rep_data_completeness(
    rep_id: int,
    days: int = Query(default=90, ge=7, le=730),
    db: Session = Depends(get_db)
):
    """% de médicos del visitador con información completa + evolución diaria.
    Cada consulta actualiza la foto del día, así que el último punto siempre está al día."""
    from ..completeness import (
        compute_rep_completeness, upsert_snapshot, missing_fields, today_chile, pct,
        week_start_utc, weekly_goal, LEGACY_COMPLETED,
    )
    from ..models import DoctorCompletenessSnapshot

    stats = compute_rep_completeness(db, rep_id)
    docs = stats.pop("_docs")
    upsert_snapshot(db, rep_id, stats)

    today = today_chile()
    since = today - timedelta(days=days)
    rows = db.query(DoctorCompletenessSnapshot).filter(
        DoctorCompletenessSnapshot.rep_id == rep_id,
        DoctorCompletenessSnapshot.snapshot_date >= since,
    ).order_by(DoctorCompletenessSnapshot.snapshot_date).all()

    history = [{
        "date": r.snapshot_date.isoformat(),
        "total": r.total,
        "complete": r.complete,
        "pct_complete": pct(r.complete, r.total),
        "pct_phone": pct(r.with_phone, r.total),
        "pct_email": pct(r.with_email, r.total),
        "pct_center": pct(r.with_center, r.total),
        "pct_specialty": pct(r.with_specialty or 0, r.total),
    } for r in rows]

    def _pct_at(days_ago: int):
        target = today - timedelta(days=days_ago)
        prev = [h for h in history if h["date"] <= target.isoformat()]
        return prev[-1]["pct_complete"] if prev else None

    current_pct = pct(stats["complete"], stats["total"])
    ref_7 = _pct_at(7)
    ref_30 = _pct_at(30)

    incomplete = []
    for d in docs:
        miss = missing_fields(d)
        if miss:
            incomplete.append({"id": d.id, "name": d.name, "missing": miss})
    incomplete.sort(key=lambda x: (-len(x["missing"]), x["name"]))

    # ── Meta semanal: médicos que pasaron a "completos" por edición desde el lunes ──
    ws = week_start_utc()
    done_week = [d for d in docs if d.info_completed_at and d.info_completed_at > LEGACY_COMPLETED
                 and d.info_completed_at >= ws and not missing_fields(d)]
    pending = stats["total"] - stats["complete"]
    goal = weekly_goal(pending, len(done_week))

    # ── Sugerencias: a quién completar primero ──
    inc_ids = [x["id"] for x in incomplete]
    next_visit = {}
    with_sales = set()
    last_visit = {}
    if inc_ids:
        now_utc = datetime.utcnow()
        for v in db.query(Visit).filter(
            Visit.doctor_id.in_(inc_ids), Visit.status == "scheduled",
            Visit.scheduled_date >= now_utc - timedelta(hours=12),
            Visit.scheduled_date <= now_utc + timedelta(days=7),
        ).order_by(Visit.scheduled_date).all():
            next_visit.setdefault(v.doctor_id, v.scheduled_date)
        with_sales = {r[0] for r in db.query(Sale.doctor_id).filter(Sale.doctor_id.in_(inc_ids)).distinct().all()}
        for doc_id, last in db.query(Visit.doctor_id, func.max(func.coalesce(Visit.actual_date, Visit.scheduled_date))).filter(
            Visit.doctor_id.in_(inc_ids), Visit.status == "completed"
        ).group_by(Visit.doctor_id).all():
            last_visit[doc_id] = last

    suggestions = []
    for x in incomplete:
        did = x["id"]
        score, reasons = 0, []
        if did in next_visit:
            score += 100
            reasons.append("visit")
        if did in with_sales:
            score += 40
            reasons.append("sales")
        n_miss = len(x["missing"])
        if n_miss == 1:
            score += 25
            reasons.append("quick")
        if did in last_visit and (datetime.utcnow() - last_visit[did]).days <= 30:
            score += 10
            reasons.append("recent")
        score += (4 - n_miss) * 3
        suggestions.append({
            **x,
            "score": score,
            "reasons": reasons,
            "next_visit": next_visit[did].isoformat() if did in next_visit else None,
        })
    suggestions.sort(key=lambda s: (-s["score"], s["name"]))
    suggestions = suggestions[:5]

    return {
        "rep_id": rep_id,
        "as_of": today.isoformat(),
        "total": stats["total"],
        "complete": stats["complete"],
        "pct_complete": current_pct,
        "with_phone": stats["with_phone"],
        "with_email": stats["with_email"],
        "with_center": stats["with_center"],
        "with_specialty": stats["with_specialty"],
        "pct_phone": pct(stats["with_phone"], stats["total"]),
        "pct_email": pct(stats["with_email"], stats["total"]),
        "pct_center": pct(stats["with_center"], stats["total"]),
        "pct_specialty": pct(stats["with_specialty"], stats["total"]),
        "change_7d": round(current_pct - ref_7, 1) if ref_7 is not None else None,
        "change_30d": round(current_pct - ref_30, 1) if ref_30 is not None else None,
        "tracking_since": history[0]["date"] if history else today.isoformat(),
        "history": history,
        "incomplete": incomplete,
        "pending": pending,
        "weekly_goal": goal,
        "done_this_week": len(done_week),
        "done_this_week_names": [d.name for d in done_week],
        "suggestions": suggestions,
    }


@router.get("/data-completeness")
def get_all_reps_data_completeness(db: Session = Depends(get_db)):
    """Resumen de completitud para todos los visitadores activos (para comparar entre ellos)."""
    from ..completeness import compute_rep_completeness, upsert_snapshot, pct
    out = []
    for rep in db.query(MedicalRep).filter(MedicalRep.is_active == True).all():  # noqa: E712
        s = compute_rep_completeness(db, rep.id)
        s.pop("_docs")
        upsert_snapshot(db, rep.id, s)
        out.append({"rep_id": rep.id, "rep_name": rep.name, "total": s["total"],
                    "complete": s["complete"], "pct_complete": pct(s["complete"], s["total"])})
    out.sort(key=lambda r: -r["pct_complete"])
    return out


@router.get("/rep/{rep_id}/low-sales")
def get_rep_low_sales(rep_id: int, db: Session = Depends(get_db)):
    """Médicos prescriptores del visitador con menos unidades que a la misma fecha del mes anterior."""
    from ..low_sales import find_low_sales_doctors
    r = find_low_sales_doctors(db, rep_id)
    for d in r["doctors"]:
        d.pop("doctor", None)
    return r
