"""Venta neta mensual por visitador y meta de crecimiento (SALES_GROWTH_TARGET sobre el mes anterior).

Base de ventas: todas las ventas de médicos asignados al visitador (incluye médicos inactivos),
mismo criterio que comisiones."""
from calendar import monthrange
from datetime import datetime
from typing import Optional

from sqlalchemy import func, extract
from sqlalchemy.orm import Session

from .constants import IVA_RATE, SALES_GROWTH_TARGET
from .models import Doctor, Sale


def _shift(y: int, m: int, k: int):
    idx = y * 12 + (m - 1) + k
    return idx // 12, idx % 12 + 1


def rep_monthly_sales(db: Session, rep_id: int, start: tuple, end: tuple) -> dict:
    """{(y, m): (bruto, unidades)} entre start y end (inclusive)."""
    ids = [d[0] for d in db.query(Doctor.id).filter(Doctor.rep_id == rep_id).all()]
    if not ids:
        return {}
    p_start = datetime(start[0], start[1], 1)
    p_end = datetime(end[0], end[1], monthrange(end[0], end[1])[1], 23, 59, 59)
    y_, m_ = extract("year", Sale.sale_date), extract("month", Sale.sale_date)
    rows = db.query(y_, m_, func.coalesce(func.sum(Sale.amount), 0), func.count(Sale.id)).filter(
        Sale.doctor_id.in_(ids), Sale.sale_date >= p_start, Sale.sale_date <= p_end,
    ).group_by(y_, m_).all()
    out = {}
    for y, m, tot, n in rows:
        try:
            tot = float(tot or 0)
            if tot != tot:  # NaN
                tot = 0.0
        except Exception:
            tot = 0.0
        out[(int(y), int(m))] = (tot, int(n))
    return out


def net(gross: float) -> float:
    return round(gross / (1 + IVA_RATE), 0)


def sales_goal(db: Session, rep_id: int, year: int, month: int, now: Optional[datetime] = None) -> dict:
    now = now or datetime.utcnow()
    py, pm = _shift(year, month, -1)
    data = rep_monthly_sales(db, rep_id, (py, pm), (year, month))
    cur_gross, cur_units = data.get((year, month), (0.0, 0))
    prev_gross, _ = data.get((py, pm), (0.0, 0))
    cur_net, prev_net = net(cur_gross), net(prev_gross)
    goal = round(prev_net * (1 + SALES_GROWTH_TARGET), 0) if prev_net > 0 else None

    days_in_month = monthrange(year, month)[1]
    is_current = (year, month) == (now.year, now.month)
    days_elapsed, projection, expected_to_date = days_in_month, None, goal
    if is_current:
        # Fecha de corte = última venta cargada (las cargas pueden venir con atraso)
        latest = db.query(func.max(Sale.sale_date)).scalar()
        cutoff = min(now, latest) if latest else now
        days_elapsed = cutoff.day if (cutoff.year, cutoff.month) == (year, month) else 0
        if days_elapsed > 0:
            projection = round(cur_net / days_elapsed * days_in_month, 0)
            expected_to_date = round(goal * days_elapsed / days_in_month, 0) if goal else None
        else:
            expected_to_date = 0 if goal else None

    return {
        "net_amount": cur_net,
        "gross_amount": round(cur_gross, 0),
        "units": cur_units,
        "prev_net_amount": prev_net,
        "growth_target_pct": round(SALES_GROWTH_TARGET * 100, 1),
        "goal_net_amount": goal,
        "pct_of_goal": round(100 * cur_net / goal, 1) if goal else None,
        "growth_vs_prev_pct": round(100 * (cur_net - prev_net) / prev_net, 1) if prev_net else None,
        "is_current_month": is_current,
        "days_elapsed": days_elapsed,
        "days_in_month": days_in_month,
        "expected_to_date": expected_to_date,
        "projection_net_amount": projection,
    }


def net_sales_trend(db: Session, rep_id: int, months: int, now: Optional[datetime] = None) -> list:
    now = now or datetime.utcnow()
    first = _shift(now.year, now.month, -(months - 1))
    before_first = _shift(first[0], first[1], -1)
    data = rep_monthly_sales(db, rep_id, before_first, (now.year, now.month))
    labels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    out = []
    for k in range(months):
        y, m = _shift(first[0], first[1], k)
        gross, units = data.get((y, m), (0.0, 0))
        pgross, _ = data.get(_shift(y, m, -1), (0.0, 0))
        pnet = net(pgross)
        out.append({
            "month": m, "year": y, "label": f"{labels[m - 1]} {str(y)[2:]}",
            "units": units, "total_amount": round(gross, 0), "net_amount": net(gross),
            "goal_net_amount": round(pnet * (1 + SALES_GROWTH_TARGET), 0) if pnet > 0 else None,
        })
    return out
