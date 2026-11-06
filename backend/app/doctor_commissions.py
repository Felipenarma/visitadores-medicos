"""Comisiones de médicos: listado de médicos con has_commission=True y su venta neta del mes.

Las ventas de un médico se suman por RUT normalizado: incluye sus fichas duplicadas
(activas o inactivas) y ventas cargadas con su RUT aunque estén en otra ficha."""
import re
from calendar import monthrange
from datetime import datetime

from sqlalchemy.orm import Session, joinedload

from .constants import to_net
from .models import Doctor, Sale


def _nr(rut) -> str:
    return re.sub(r"[^0-9K]", "", str(rut or "").upper())


def _month_range(year: int, month: int):
    return datetime(year, month, 1), datetime(year, month, monthrange(year, month)[1], 23, 59, 59)


def _prev(year: int, month: int):
    return (year, month - 1) if month > 1 else (year - 1, 12)


def doctor_commissions(db: Session, year: int, month: int) -> dict:
    flagged = db.query(Doctor).options(joinedload(Doctor.rep), joinedload(Doctor.business_line)) \
        .filter(Doctor.has_commission == True).all()  # noqa: E712

    # Una fila por médico: se agrupa por RUT (o por ficha si no tiene RUT); se prefiere la ficha activa
    groups: dict = {}
    for d in flagged:
        key = _nr(d.rut) or f"id:{d.id}"
        cur = groups.get(key)
        if cur is None or (d.is_active and not cur.is_active):
            groups[key] = d
    keys_by_rut = {k for k in groups if not k.startswith("id:")}

    # Fichas (también inactivas/duplicadas) que comparten RUT con un médico con comisión
    id_to_key = {d.id: (_nr(d.rut) or f"id:{d.id}") for d in flagged}
    if keys_by_rut:
        for did, rut in db.query(Doctor.id, Doctor.rut).filter(Doctor.rut.isnot(None)).all():
            k = _nr(rut)
            if k in keys_by_rut:
                id_to_key[did] = k

    def totals(y: int, m: int) -> dict:
        start, end = _month_range(y, m)
        out: dict = {}
        for s in db.query(Sale.id, Sale.doctor_id, Sale.rut_doctor, Sale.amount).filter(
            Sale.sale_date >= start, Sale.sale_date <= end
        ).all():
            key = id_to_key.get(s.doctor_id) if s.doctor_id else None
            if key is None:
                k = _nr(s.rut_doctor)
                key = k if k in keys_by_rut else None
            if key is None:
                continue
            units, gross = out.get(key, (0, 0.0))
            try:
                amt = float(s.amount or 0)
                amt = 0.0 if amt != amt else amt
            except Exception:
                amt = 0.0
            out[key] = (units + 1, gross + amt)
        return out

    cur = totals(year, month)
    prev = totals(*_prev(year, month))

    rows = []
    for key, d in groups.items():
        units, gross = cur.get(key, (0, 0.0))
        p_units, p_gross = prev.get(key, (0, 0.0))
        net, p_net = round(to_net(gross)), round(to_net(p_gross))
        rows.append({
            "doctor_id": d.id, "name": d.name, "rut": d.rut, "specialty": d.specialty,
            "medical_center": d.medical_center, "rep_name": d.rep.name if d.rep else None,
            "business_line": d.business_line.name if d.business_line else None,
            "is_active": bool(d.is_active),
            "units": units, "gross_amount": round(gross), "net_amount": net,
            "prev_units": p_units, "prev_net_amount": p_net,
            "change_pct": round(100 * (net - p_net) / p_net, 1) if p_net else None,
        })
    rows.sort(key=lambda r: (-r["net_amount"], r["name"] or ""))
    return {
        "month": month, "year": year,
        "doctors": rows,
        "totals": {
            "doctors": len(rows),
            "with_sales": sum(1 for r in rows if r["units"] > 0),
            "units": sum(r["units"] for r in rows),
            "net_amount": sum(r["net_amount"] for r in rows),
            "gross_amount": sum(r["gross_amount"] for r in rows),
            "prev_net_amount": sum(r["prev_net_amount"] for r in rows),
        },
    }
