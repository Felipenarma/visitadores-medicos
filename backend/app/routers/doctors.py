import re
import io
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import pandas as pd
from ..database import get_db
from ..models import Doctor, MedicalRep, BusinessLine, Visit, Sale
from ..schemas import DoctorCreate, DoctorUpdate, DoctorOut, AssignRepRequest

router = APIRouter(prefix="/api/doctors", tags=["doctors"])


def enrich_doctor(doctor: Doctor, db: Session) -> DoctorOut:
    out = DoctorOut.model_validate(doctor)
    if doctor.business_line:
        out.business_line_name = doctor.business_line.name
    if doctor.rep:
        out.rep_name = doctor.rep.name

    last_visit = db.query(Visit).filter(
        Visit.doctor_id == doctor.id,
        Visit.status == "completed"
    ).order_by(Visit.actual_date.desc()).first()
    if last_visit:
        out.last_visit_date = last_visit.actual_date

    visit_count = db.query(func.count(Visit.id)).filter(Visit.doctor_id == doctor.id).scalar()
    out.visits_count = visit_count

    sale_count = db.query(func.count(Sale.id)).filter(Sale.doctor_id == doctor.id).scalar()
    out.has_sales = sale_count > 0

    return out


def _enrich_batch(doctors: list, db: Session) -> List[DoctorOut]:
    """Enriquece una lista de médicos con 3 queries batch en lugar de N*3 queries."""
    if not doctors:
        return []

    doctor_ids = [d.id for d in doctors]

    # Última visita completada por médico (1 query)
    last_visits = db.query(
        Visit.doctor_id,
        func.max(Visit.actual_date).label("last_date")
    ).filter(
        Visit.doctor_id.in_(doctor_ids),
        Visit.status == "completed"
    ).group_by(Visit.doctor_id).all()
    last_visit_map = {r.doctor_id: r.last_date for r in last_visits}

    # Total visitas por médico (1 query)
    visit_counts = db.query(
        Visit.doctor_id,
        func.count(Visit.id).label("cnt")
    ).filter(
        Visit.doctor_id.in_(doctor_ids)
    ).group_by(Visit.doctor_id).all()
    visit_count_map = {r.doctor_id: r.cnt for r in visit_counts}

    # Tiene ventas por médico (1 query)
    sale_counts = db.query(
        Sale.doctor_id,
        func.count(Sale.id).label("cnt")
    ).filter(
        Sale.doctor_id.in_(doctor_ids)
    ).group_by(Sale.doctor_id).all()
    sale_count_map = {r.doctor_id: r.cnt for r in sale_counts}

    results = []
    for doc in doctors:
        out = DoctorOut.model_validate(doc)
        if doc.business_line:
            out.business_line_name = doc.business_line.name
        if doc.rep:
            out.rep_name = doc.rep.name
        out.last_visit_date = last_visit_map.get(doc.id)
        out.visits_count = visit_count_map.get(doc.id, 0)
        out.has_sales = sale_count_map.get(doc.id, 0) > 0
        results.append(out)

    return results


@router.get("/", response_model=List[DoctorOut])
def get_doctors(
    rep_id: Optional[int] = Query(None),
    business_line_id: Optional[int] = Query(None),
    specialty: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    has_sales: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(Doctor)
    if rep_id is not None:
        query = query.filter(Doctor.rep_id == rep_id)
    if business_line_id is not None:
        query = query.filter(Doctor.business_line_id == business_line_id)
    if specialty is not None:
        query = query.filter(Doctor.specialty.ilike(f"%{specialty}%"))
    if is_active is not None:
        query = query.filter(Doctor.is_active == is_active)

    doctors = query.all()

    # Filtro de búsqueda en Python para normalizar RUT correctamente (con/sin guión/puntos)
    if search:
        search_lower = search.lower()
        search_rut_norm = re.sub(r'[\.\-\s]', '', search).upper()

        def _matches(doc: Doctor) -> bool:
            if doc.name and search_lower in doc.name.lower():
                return True
            if doc.rut:
                rut_norm = re.sub(r'[\.\-\s]', '', doc.rut).upper()
                if search_rut_norm and search_rut_norm in rut_norm:
                    return True
            return False

        doctors = [d for d in doctors if _matches(d)]

    # Enriquecer con batch queries (evita N+1)
    enriched = _enrich_batch(doctors, db)

    # Filtro has_sales sobre datos ya cargados (sin queries extra)
    if has_sales is not None:
        enriched = [d for d in enriched if d.has_sales == has_sales]

    return enriched


@router.get("/export")
def export_doctors(
    rep_id: Optional[int] = Query(None),
    business_line_id: Optional[int] = Query(None),
    specialty: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Exporta la lista de médicos a Excel respetando los mismos filtros que GET /."""
    query = db.query(Doctor)
    if rep_id is not None:
        query = query.filter(Doctor.rep_id == rep_id)
    if business_line_id is not None:
        query = query.filter(Doctor.business_line_id == business_line_id)
    if specialty is not None:
        query = query.filter(Doctor.specialty.ilike(f"%{specialty}%"))
    if is_active is not None:
        query = query.filter(Doctor.is_active == is_active)

    doctors = query.all()

    if search:
        search_lower = search.lower()
        search_rut_norm = re.sub(r'[\.\-\s]', '', search).upper()

        def _matches(doc: Doctor) -> bool:
            if doc.name and search_lower in doc.name.lower():
                return True
            if doc.rut:
                rut_norm = re.sub(r'[\.\-\s]', '', doc.rut).upper()
                if search_rut_norm and search_rut_norm in rut_norm:
                    return True
            return False

        doctors = [d for d in doctors if _matches(d)]

    # Batch queries para el export (evita N+1)
    doctor_ids = [d.id for d in doctors]
    last_visits_q = db.query(
        Visit.doctor_id, func.max(Visit.actual_date).label("last_date")
    ).filter(Visit.doctor_id.in_(doctor_ids), Visit.status == "completed"
    ).group_by(Visit.doctor_id).all()
    last_visit_map = {r.doctor_id: r.last_date for r in last_visits_q}

    visit_counts_q = db.query(
        Visit.doctor_id, func.count(Visit.id).label("cnt")
    ).filter(Visit.doctor_id.in_(doctor_ids)).group_by(Visit.doctor_id).all()
    visit_count_map = {r.doctor_id: r.cnt for r in visit_counts_q}

    sale_counts_q = db.query(
        Sale.doctor_id, func.count(Sale.id).label("cnt")
    ).filter(Sale.doctor_id.in_(doctor_ids)).group_by(Sale.doctor_id).all()
    sale_count_map = {r.doctor_id: r.cnt for r in sale_counts_q}

    # Construir filas
    rows = []
    for doc in doctors:
        last_date = last_visit_map.get(doc.id)
        last_visit_date = last_date.strftime("%d/%m/%Y") if last_date else ""
        visit_count = visit_count_map.get(doc.id, 0)
        sale_count = sale_count_map.get(doc.id, 0)
        rep_name = doc.rep.name if doc.rep else ""
        bl_name = doc.business_line.name if doc.business_line else ""

        rows.append({
            "Nombre": doc.name or "",
            "RUT": doc.rut or "",
            "Centro Médico": doc.medical_center or "",
            "Especialidad": doc.specialty or "",
            "Ciudad": doc.city or "",
            "Comuna": doc.commune or "",
            "Dirección": doc.address or "",
            "Teléfono": doc.phone or "",
            "Correo": doc.email or "",
            "Línea de Negocio": bl_name,
            "Visitador Asignado": rep_name,
            "Frec. Visita (días)": doc.visit_frequency or 30,
            "Productos que Prescribe": doc.prescribes_products or "",
            "Última Visita": last_visit_date,
            "Total Visitas": visit_count,
            "Tiene Ventas": "Sí" if sale_count > 0 else "No",
            "Notas": doc.notes or "",
            "Activo": "Sí" if doc.is_active else "No",
        })

    df = pd.DataFrame(rows)

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Médicos")
        ws = writer.sheets["Médicos"]
        # Ajustar ancho de columnas
        for col in ws.columns:
            max_len = max((len(str(cell.value)) if cell.value else 0) for cell in col)
            ws.column_dimensions[col[0].column_letter].width = min(max_len + 4, 50)

    output.seek(0)
    fecha = datetime.now().strftime("%Y%m%d")
    filename = f"medicos_{fecha}.xlsx"
    headers = {"Content-Disposition": f"attachment; filename={filename}"}
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


@router.get("/{doctor_id}", response_model=DoctorOut)
def get_doctor(doctor_id: int, db: Session = Depends(get_db)):
    doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Médico no encontrado")
    return enrich_doctor(doctor, db)


@router.post("/", response_model=DoctorOut)
def create_doctor(data: DoctorCreate, db: Session = Depends(get_db)):
    if data.rep_id:
        rep = db.query(MedicalRep).filter(MedicalRep.id == data.rep_id).first()
        if not rep:
            raise HTTPException(status_code=404, detail="Visitador no encontrado")
    if data.business_line_id:
        bl = db.query(BusinessLine).filter(BusinessLine.id == data.business_line_id).first()
        if not bl:
            raise HTTPException(status_code=404, detail="Línea de negocio no encontrada")

    doctor = Doctor(**data.model_dump())
    db.add(doctor)
    db.commit()
    db.refresh(doctor)
    return enrich_doctor(doctor, db)


@router.put("/{doctor_id}", response_model=DoctorOut)
def update_doctor(doctor_id: int, data: DoctorUpdate, db: Session = Depends(get_db)):
    doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Médico no encontrado")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(doctor, key, value)
    db.commit()
    db.refresh(doctor)
    return enrich_doctor(doctor, db)


@router.delete("/{doctor_id}")
def delete_doctor(doctor_id: int, db: Session = Depends(get_db)):
    doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Médico no encontrado")
    doctor.is_active = False
    db.commit()
    return {"message": "Médico desactivado"}


@router.post("/{doctor_id}/merge-into/{target_id}")
def merge_doctor(doctor_id: int, target_id: int, db: Session = Depends(get_db)):
    """Fusiona doctor_id en target_id: mueve todas sus ventas y visitas, luego desactiva doctor_id."""
    source = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    target = db.query(Doctor).filter(Doctor.id == target_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Médico origen no encontrado")
    if not target:
        raise HTTPException(status_code=404, detail="Médico destino no encontrado")

    # Mover ventas y visitas
    db.query(Sale).filter(Sale.doctor_id == doctor_id).update(
        {"doctor_id": target_id}, synchronize_session=False
    )
    db.query(Visit).filter(Visit.doctor_id == doctor_id).update(
        {"doctor_id": target_id}, synchronize_session=False
    )

    # Copiar RUT al destino si no tiene
    if not target.rut and source.rut:
        target.rut = source.rut

    # Usar el nombre más completo
    if source.name and len(source.name) > len(target.name or ""):
        target.name = source.name

    source.is_active = False
    db.commit()
    return {"ok": True, "merged_from": doctor_id, "merged_into": target_id, "target_name": target.name}


@router.put("/{doctor_id}/assign-rep", response_model=DoctorOut)
def assign_rep(doctor_id: int, data: AssignRepRequest, db: Session = Depends(get_db)):
    doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Médico no encontrado")
    rep = db.query(MedicalRep).filter(MedicalRep.id == data.rep_id).first()
    if not rep:
        raise HTTPException(status_code=404, detail="Visitador no encontrado")
    doctor.rep_id = data.rep_id
    db.commit()
    db.refresh(doctor)
    return enrich_doctor(doctor, db)
