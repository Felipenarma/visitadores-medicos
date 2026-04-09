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
from ..models import Doctor, MedicalRep, Visit, Sale, BusinessLine
from ..schemas import DashboardStats, RepStats

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


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
            result.append({
                "rep_id": rep.id,
                "rep_name": rep.name,
                "total": total,
                "completed": completed,
                "pending": pending,
                "missed": missed,
                "completion_rate": round((completed / total) * 100) if total > 0 else 0
            })

    result.sort(key=lambda x: x["completion_rate"], reverse=True)
    return {
        "date": day_start.strftime("%Y-%m-%d"),
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
        Visit.scheduled_date < week_end,
        Visit.status == "scheduled"
    ).order_by(Visit.scheduled_date.asc()).all()

    upcoming_list = []
    for v in upcoming:
        upcoming_list.append({
            "visit_id": v.id,
            "doctor_name": v.doctor.name if v.doctor else "N/A",
            "doctor_specialty": v.doctor.specialty if v.doctor else None,
            "scheduled_date": v.scheduled_date.isoformat() if v.scheduled_date else None,
            "status": v.status
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

    sales = db.query(Sale).filter(
        Sale.sale_date >= period_start,
        Sale.sale_date <= period_end
    ).all()

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


@router.get("/new-doctors")
def get_new_doctors(
    month: int = Query(default=None),
    year: int = Query(default=None),
    db: Session = Depends(get_db)
):
    """Médicos que prescriben por primera vez en el período indicado."""
    now = datetime.utcnow()
    month = month or now.month
    year = year or now.year

    from calendar import monthrange
    _, last_day = monthrange(year, month)
    period_start = datetime(year, month, 1)
    period_end = datetime(year, month, last_day, 23, 59, 59)

    # Ventas del período
    period_sales = db.query(Sale).filter(
        Sale.sale_date >= period_start,
        Sale.sale_date <= period_end
    ).all()

    # Pre-cargar doctors y reps en memoria
    all_doctors = {d.id: d for d in db.query(Doctor).all()}
    all_reps = {r.id: r for r in db.query(MedicalRep).all()}

    result = []
    seen_keys = set()

    for s in period_sales:
        # Clave principal: doctor_id, luego rut_doctor
        key = s.doctor_id or s.rut_doctor or s.doctor_name_raw
        if not key or key in seen_keys:
            continue
        seen_keys.add(key)

        # Verificar si tuvo ventas antes del período (usando doctor_id como principal)
        if s.doctor_id:
            prior = db.query(Sale).filter(
                Sale.doctor_id == s.doctor_id,
                Sale.sale_date < period_start
            ).first()
        elif s.rut_doctor:
            prior = db.query(Sale).filter(
                Sale.rut_doctor == s.rut_doctor,
                Sale.sale_date < period_start
            ).first()
        else:
            continue

        if prior:
            continue  # No es nuevo

        doctor = all_doctors.get(s.doctor_id) if s.doctor_id else None
        rep = all_reps.get(doctor.rep_id) if doctor and doctor.rep_id else None

        # Todas las ventas de este médico en el período
        if s.doctor_id:
            doc_sales = [x for x in period_sales if x.doctor_id == s.doctor_id]
        else:
            doc_sales = [x for x in period_sales if x.rut_doctor == s.rut_doctor]

        first_sale_date = min((x.sale_date for x in doc_sales if x.sale_date), default=None)
        productos = list(set(x.product for x in doc_sales if x.product))
        total = sum(safe_float(x.amount) for x in doc_sales)

        result.append({
            "rut_doctor": (doctor.rut if doctor and doctor.rut else None) or s.rut_doctor or "",
            "doctor_name": doctor.name if doctor else (s.doctor_name_raw or "Sin nombre"),
            "specialty": doctor.specialty if doctor else None,
            "primera_venta": first_sale_date.isoformat() if first_sale_date else None,
            "rep_name": rep.name if rep else None,
            "rep_id": rep.id if rep else None,
            "productos": productos,
            "total_amount": total,
        })

    result.sort(key=lambda x: x["primera_venta"] or "")
    return result


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
            Doctor.rep_id == rep.id, Doctor.is_active == True
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

        # Category breakdown
        cat_breakdown = {}
        for s in sales_period:
            cat = s.categoria or "Sin categoría"
            cat_breakdown[cat] = cat_breakdown.get(cat, 0) + 1

        result.append({
            "rep_id": rep.id,
            "rep_name": rep.name,
            "doctors_with_sales": doctors_with_sales,
            "new_doctors": new_docs,
            "new_doctors_count": len(new_docs),
            "total_amount": total_amount,
            "sales_count": sales_count,
            "categories": cat_breakdown,
        })

    result.sort(key=lambda x: x["total_amount"], reverse=True)
    return result
