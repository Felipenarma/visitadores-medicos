"""API de solo lectura para consumo externo (ej. Tablero CEO de Narma).

- Solo GET. No escribe nada.
- Protegida con token: header `X-API-Token` o `Authorization: Bearer <token>`.
- El token se define en la variable de entorno EXPORT_API_TOKEN (si no existe, la API responde 503).
- NO expone datos de pacientes (rut_paciente, nombre_paciente), ni notas, teléfonos, emails,
  geolocalización, conversaciones de agentes ni archivos binarios.
"""
import hmac
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import BusinessLine, Doctor, MedicalRep, RepTarget, Sale, Visit

router = APIRouter(prefix="/api/export", tags=["export (solo lectura)"])


def require_token(
    x_api_token: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    expected = (os.getenv("EXPORT_API_TOKEN") or "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="EXPORT_API_TOKEN no configurado")
    provided = (x_api_token or "").strip()
    if not provided and authorization and authorization.lower().startswith("bearer "):
        provided = authorization[7:].strip()
    if not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Token inválido")


def _iso(d: Optional[datetime]):
    return d.isoformat() if d else None


def _page(query, limit: int, offset: int):
    total = query.count()
    return total, query.offset(offset).limit(limit).all()


@router.get("/schema", dependencies=[Depends(require_token)])
def schema():
    """Describe las colecciones disponibles y sus campos."""
    return {
        "business_lines": ["id", "name", "description", "color"],
        "reps": ["id", "name", "email", "territory", "zone", "is_active", "created_at", "business_line_ids"],
        "doctors": ["id", "name", "rut", "specialty", "medical_center", "city", "commune",
                    "business_line_id", "rep_id", "visit_frequency", "is_active", "created_at"],
        "visits": ["id", "doctor_id", "rep_id", "scheduled_date", "actual_date",
                   "status (scheduled|completed|missed|cancelled)", "created_at"],
        "sales": ["id", "doctor_id", "rut_doctor", "doctor_name_raw", "product", "categoria",
                  "amount", "sale_date", "external_id", "created_at"],
        "rep_targets": ["id", "rep_id", "month", "year", "target_visits"],
    }


@router.get("/business-lines", dependencies=[Depends(require_token)])
def business_lines(db: Session = Depends(get_db)):
    return [
        {"id": b.id, "name": b.name, "description": b.description, "color": b.color}
        for b in db.query(BusinessLine).order_by(BusinessLine.id).all()
    ]


@router.get("/reps", dependencies=[Depends(require_token)])
def reps(db: Session = Depends(get_db)):
    return [
        {
            "id": r.id, "name": r.name, "email": r.email, "territory": r.territory,
            "zone": r.zone, "is_active": r.is_active, "created_at": _iso(r.created_at),
            "business_line_ids": [b.id for b in r.business_lines],
        }
        for r in db.query(MedicalRep).order_by(MedicalRep.id).all()
    ]


@router.get("/doctors", dependencies=[Depends(require_token)])
def doctors(limit: int = Query(1000, ge=1, le=5000), offset: int = Query(0, ge=0),
            db: Session = Depends(get_db)):
    total, rows = _page(db.query(Doctor).order_by(Doctor.id), limit, offset)
    return {"total": total, "limit": limit, "offset": offset, "items": [
        {
            "id": d.id, "name": d.name, "rut": d.rut, "specialty": d.specialty,
            "medical_center": d.medical_center, "city": d.city, "commune": d.commune,
            "business_line_id": d.business_line_id, "rep_id": d.rep_id,
            "visit_frequency": d.visit_frequency, "is_active": d.is_active,
            "created_at": _iso(d.created_at),
        } for d in rows
    ]}


@router.get("/visits", dependencies=[Depends(require_token)])
def visits(
    since: Optional[str] = Query(None, description="ISO date: scheduled_date >= since"),
    until: Optional[str] = Query(None, description="ISO date: scheduled_date < until"),
    limit: int = Query(1000, ge=1, le=5000), offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(Visit)
    try:
        if since:
            q = q.filter(Visit.scheduled_date >= datetime.fromisoformat(since))
        if until:
            q = q.filter(Visit.scheduled_date < datetime.fromisoformat(until))
    except ValueError:
        raise HTTPException(status_code=400, detail="Fecha inválida (use ISO, ej. 2026-10-01)")
    total, rows = _page(q.order_by(Visit.id), limit, offset)
    return {"total": total, "limit": limit, "offset": offset, "items": [
        {
            "id": v.id, "doctor_id": v.doctor_id, "rep_id": v.rep_id,
            "scheduled_date": _iso(v.scheduled_date), "actual_date": _iso(v.actual_date),
            "status": v.status, "created_at": _iso(v.created_at),
        } for v in rows
    ]}


@router.get("/sales", dependencies=[Depends(require_token)])
def sales(
    since: Optional[str] = Query(None, description="ISO date: sale_date >= since"),
    until: Optional[str] = Query(None, description="ISO date: sale_date < until"),
    limit: int = Query(1000, ge=1, le=5000), offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    q = db.query(Sale)
    try:
        if since:
            q = q.filter(Sale.sale_date >= datetime.fromisoformat(since))
        if until:
            q = q.filter(Sale.sale_date < datetime.fromisoformat(until))
    except ValueError:
        raise HTTPException(status_code=400, detail="Fecha inválida (use ISO, ej. 2026-10-01)")
    total, rows = _page(q.order_by(Sale.id), limit, offset)
    return {"total": total, "limit": limit, "offset": offset, "items": [
        {
            "id": s.id, "doctor_id": s.doctor_id, "rut_doctor": s.rut_doctor,
            "doctor_name_raw": s.doctor_name_raw, "product": s.product,
            "categoria": s.categoria, "amount": s.amount, "sale_date": _iso(s.sale_date),
            "external_id": s.external_id, "created_at": _iso(s.created_at),
        } for s in rows
    ]}


def build_tables(db: Session) -> dict:
    """Tablas planas (encabezados + filas) para la planilla 'Narma - Visitas médicas'.
    Sin datos de pacientes, notas, teléfonos ni emails."""
    from collections import defaultdict
    from sqlalchemy import func, extract

    lines = {b.id: b.name for b in db.query(BusinessLine).all()}
    reps_ = db.query(MedicalRep).order_by(MedicalRep.id).all()
    rep_names = {r.id: r.name for r in reps_}

    medicos = [["id", "nombre", "especialidad", "comuna", "ciudad", "centro_clinica",
                "visitador_id", "visitador", "linea_negocio", "fecha_alta", "activo"]]
    for d in db.query(Doctor).order_by(Doctor.id).all():
        medicos.append([d.id, d.name, d.specialty, d.commune, d.city, d.medical_center,
                        d.rep_id, rep_names.get(d.rep_id), lines.get(d.business_line_id),
                        _iso(d.created_at), bool(d.is_active)])

    visitas = [["id", "fecha_programada", "fecha_real", "medico_id", "visitador_id",
                "visitador", "estado"]]
    for v in db.query(Visit).order_by(Visit.id).all():
        visitas.append([v.id, _iso(v.scheduled_date), _iso(v.actual_date), v.doctor_id,
                        v.rep_id, rep_names.get(v.rep_id), v.status])

    visitadores = [["id", "nombre", "zona", "territorio", "fecha_ingreso", "activo"]]
    for r in reps_:
        visitadores.append([r.id, r.name, r.zone, r.territory, _iso(r.created_at),
                            bool(r.is_active)])

    ventas = [["id", "medico_id", "rut_medico", "producto", "categoria", "monto", "fecha_venta"]]
    for s in db.query(Sale).order_by(Sale.id).all():
        ventas.append([s.id, s.doctor_id, s.rut_doctor, s.product, s.categoria,
                       s.amount, _iso(s.sale_date)])

    agg = (db.query(Sale.doctor_id, extract("year", Sale.sale_date), extract("month", Sale.sale_date),
                    func.count(Sale.id), func.sum(Sale.amount))
           .filter(Sale.doctor_id.isnot(None), Sale.sale_date.isnot(None))
           .group_by(Sale.doctor_id, extract("year", Sale.sale_date), extract("month", Sale.sale_date))
           .order_by(Sale.doctor_id).all())
    por_mes = [["medico_id", "anio", "mes", "n_ventas", "monto_total"]]
    for did, y, m, n, tot in agg:
        por_mes.append([did, int(y), int(m), n, float(tot or 0)])

    return {"Medicos": medicos, "Visitas": visitas, "Visitadores": visitadores,
            "Ventas": ventas, "Ventas_por_medico_mes": por_mes}


@router.post("/sync-sheets", dependencies=[Depends(require_token)])
def sync_sheets(db: Session = Depends(get_db)):
    """Copia las tablas a la planilla de Google Sheets (una pestaña por tabla, fila 1 = encabezados).
    Requiere GOOGLE_SERVICE_ACCOUNT_JSON y GOOGLE_SHEET_ID (planilla compartida con el service account como editor).
    Solo lee la base de datos; únicamente escribe en la planilla."""
    import json
    sa = (os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON") or "").strip()
    sheet_id = (os.getenv("GOOGLE_SHEET_ID") or "").strip()
    if not sa or not sheet_id:
        raise HTTPException(status_code=503, detail="Faltan GOOGLE_SERVICE_ACCOUNT_JSON o GOOGLE_SHEET_ID")
    try:
        import gspread
        gc = gspread.service_account_from_dict(json.loads(sa))
        sh = gc.open_by_key(sheet_id)
        tables = build_tables(db)
        existing = {ws.title: ws for ws in sh.worksheets()}
        for title, rows in tables.items():
            ws = existing.get(title) or sh.add_worksheet(title=title, rows=max(len(rows), 2), cols=len(rows[0]))
            ws.clear()
            ws.resize(rows=max(len(rows), 2), cols=len(rows[0]))
            ws.update(range_name="A1", values=rows, value_input_option="USER_ENTERED")
        return {"ok": True, "synced_at": datetime.utcnow().isoformat(),
                "rows": {k: len(v) - 1 for k, v in tables.items()}}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al sincronizar: {e}")


@router.get("/rep-targets", dependencies=[Depends(require_token)])
def rep_targets(db: Session = Depends(get_db)):
    return [
        {"id": t.id, "rep_id": t.rep_id, "month": t.month, "year": t.year,
         "target_visits": t.target_visits}
        for t in db.query(RepTarget).order_by(RepTarget.id).all()
    ]
