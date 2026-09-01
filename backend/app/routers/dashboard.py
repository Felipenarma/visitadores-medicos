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

    # Pre-cargar doctors, reps y líneas de negocio en memoria
    all_doctors = {d.id: d for d in db.query(Doctor).all()}
    all_reps = {r.id: r for r in db.query(MedicalRep).all()}
    all_blines = {bl.id: bl for bl in db.query(BusinessLine).all()}

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
        # Si el médico fue eliminado (is_active=False), no mostrarlo
        if doctor and not doctor.is_active:
            continue
        rep = all_reps.get(doctor.rep_id) if doctor and doctor.rep_id else None

        # Todas las ventas de este médico en el período
        if s.doctor_id:
            doc_sales = [x for x in period_sales if x.doctor_id == s.doctor_id]
        else:
            doc_sales = [x for x in period_sales if x.rut_doctor == s.rut_doctor]

        first_sale_date = min((x.sale_date for x in doc_sales if x.sale_date), default=None)
        productos = list(set(x.product for x in doc_sales if x.product))
        categorias = list(set(x.categoria for x in doc_sales if x.categoria))
        total = sum(safe_float(x.amount) for x in doc_sales)

        bl = all_blines.get(doctor.business_line_id) if doctor and doctor.business_line_id else None
        result.append({
            "doctor_id": doctor.id if doctor else None,
            "rut_doctor": (doctor.rut if doctor and doctor.rut else None) or s.rut_doctor or "",
            "doctor_name": doctor.name if doctor else (s.doctor_name_raw or "Sin nombre"),
            "specialty": doctor.specialty if doctor else None,
            "primera_venta": first_sale_date.isoformat() if first_sale_date else None,
            "rep_name": rep.name if rep else None,
            "rep_id": rep.id if rep else None,
            "productos": productos,
            "categorias": categorias,
            "business_line_id": doctor.business_line_id if doctor else None,
            "business_line_name": bl.name if bl else None,
            "total_amount": total,
            "sales_count": len(doc_sales),
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
    months: int = Query(default=6),
    db: Session = Depends(get_db)
):
    """Tendencia mensual de unidades vendidas (recetas) de un visitador en los últimos N meses."""
    from calendar import monthrange

    now = datetime.utcnow()
    LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

    result = []
    for i in range(months - 1, -1, -1):
        m = now.month - i
        y = now.year
        while m <= 0:
            m += 12
            y -= 1
        _, last_day = monthrange(y, m)
        start = datetime(y, m, 1)
        end   = datetime(y, m, last_day, 23, 59, 59)

        row = db.query(
            func.count(Sale.id).label("units"),
            func.coalesce(func.sum(Sale.amount), 0).label("total_amount")
        ).join(Doctor, Sale.doctor_id == Doctor.id)\
         .filter(
             Doctor.rep_id == rep_id,
             Doctor.is_active == True,
             Sale.sale_date >= start,
             Sale.sale_date <= end
         ).first()

        result.append({
            "month": m, "year": y,
            "label": LABELS[m - 1],
            "units": row.units if row else 0,
            "total_amount": float(row.total_amount) if row else 0.0,
        })
    return result


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

    return result
