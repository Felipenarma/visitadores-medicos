from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, timedelta
from ..database import get_db
from ..models import Visit, Doctor, MedicalRep
from ..schemas import VisitCreate, VisitUpdate, VisitOut, GenerateVisitsRequest
from ..constants import MAX_VISITS_PER_DAY

router = APIRouter(prefix="/api/visits", tags=["visits"])


def enrich_visit(visit: Visit) -> VisitOut:
    out = VisitOut.model_validate(visit)
    if visit.doctor:
        out.doctor_name = visit.doctor.name
        out.doctor_specialty = visit.doctor.specialty
    if visit.rep:
        out.rep_name = visit.rep.name
    return out


@router.get("/", response_model=List[VisitOut])
def get_visits(
    rep_id: Optional[int] = Query(None),
    doctor_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(Visit)
    if rep_id is not None:
        query = query.filter(Visit.rep_id == rep_id)
    if doctor_id is not None:
        query = query.filter(Visit.doctor_id == doctor_id)
    if status is not None:
        query = query.filter(Visit.status == status)
    if date_from is not None:
        query = query.filter(Visit.scheduled_date >= date_from)
    if date_to is not None:
        query = query.filter(Visit.scheduled_date <= date_to)

    visits = query.order_by(Visit.scheduled_date.asc()).all()
    return [enrich_visit(v) for v in visits]


@router.get("/{visit_id}", response_model=VisitOut)
def get_visit(visit_id: int, db: Session = Depends(get_db)):
    visit = db.query(Visit).filter(Visit.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=404, detail="Visita no encontrada")
    return enrich_visit(visit)


@router.post("/", response_model=VisitOut)
def create_visit(data: VisitCreate, db: Session = Depends(get_db)):
    doctor = db.query(Doctor).filter(Doctor.id == data.doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Médico no encontrado")
    rep = db.query(MedicalRep).filter(MedicalRep.id == data.rep_id).first()
    if not rep:
        raise HTTPException(status_code=404, detail="Visitador no encontrado")

    visit = Visit(**data.model_dump())
    db.add(visit)
    db.commit()
    db.refresh(visit)
    return enrich_visit(visit)


@router.put("/{visit_id}", response_model=VisitOut)
def update_visit(visit_id: int, data: VisitUpdate, db: Session = Depends(get_db)):
    visit = db.query(Visit).filter(Visit.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=404, detail="Visita no encontrada")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(visit, key, value)
    if data.status == "completed" and not visit.actual_date:
        visit.actual_date = datetime.utcnow()
    db.commit()
    db.refresh(visit)
    return enrich_visit(visit)


@router.delete("/clear-scheduled")
def clear_scheduled_visits(rep_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    """Delete all scheduled visits. Optionally filter by rep_id."""
    query = db.query(Visit).filter(Visit.status == "scheduled")
    if rep_id is not None:
        query = query.filter(Visit.rep_id == rep_id)
    count = query.delete(synchronize_session=False)
    db.commit()
    return {"message": f"{count} visitas agendadas eliminadas", "deleted": count}


@router.delete("/{visit_id}")
def delete_visit(visit_id: int, db: Session = Depends(get_db)):
    visit = db.query(Visit).filter(Visit.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=404, detail="Visita no encontrada")
    db.delete(visit)
    db.commit()
    return {"message": "Visita eliminada"}


@router.post("/generate")
def generate_visits(data: GenerateVisitsRequest, db: Session = Depends(get_db)):
    """Genera visitas futuras por médico según su frecuencia, repartiendo la carga
    de cada visitador en un máximo de MAX_VISITS_PER_DAY visitas por día hábil
    (lunes a viernes) para que el calendario quede parejo en vez de agruparse."""
    months_ahead = data.months_ahead or 6
    end_date = datetime.utcnow() + timedelta(days=30 * months_ahead)
    start_date = datetime.utcnow()

    query = db.query(Doctor).filter(Doctor.is_active == True, Doctor.rep_id != None)
    if data.rep_id:
        query = query.filter(Doctor.rep_id == data.rep_id)

    doctors = query.all()
    total_created = 0
    skipped = 0

    # Conteo de visitas por (rep_id, día) ya existentes en el rango, para no exceder
    # el tope diario al sumar las visitas nuevas a las que ya estaban agendadas.
    day_counts: dict = {}
    existing_in_range = db.query(Visit).filter(
        Visit.scheduled_date >= start_date,
        Visit.scheduled_date <= end_date,
        Visit.rep_id != None
    ).all()
    for v in existing_in_range:
        key = (v.rep_id, v.scheduled_date.date())
        day_counts[key] = day_counts.get(key, 0) + 1

    def next_available_slot(rep_id: int, from_date: datetime) -> datetime:
        """Próximo día hábil (lun-vie) desde from_date en que el visitador
        tenga cupo (menos de MAX_VISITS_PER_DAY visitas agendadas ese día)."""
        d = from_date
        max_iterations = 3650  # margen de seguridad (~10 años) para evitar loops infinitos
        for _ in range(max_iterations):
            if d.weekday() < 5:
                key = (rep_id, d.date())
                if day_counts.get(key, 0) < MAX_VISITS_PER_DAY:
                    return d
            d += timedelta(days=1)
        return d

    # Se ordenan los médicos por urgencia (fecha ideal más próxima primero) para que,
    # si un día se llena, los que llevan más tiempo esperando tengan prioridad.
    pending = []
    for doctor in doctors:
        if not doctor.visit_frequency or doctor.visit_frequency <= 0:
            continue
        last_visit = db.query(Visit).filter(
            Visit.doctor_id == doctor.id,
            Visit.scheduled_date >= start_date
        ).order_by(Visit.scheduled_date.desc()).first()

        ideal_date = (last_visit.scheduled_date + timedelta(days=doctor.visit_frequency)) if last_visit else start_date
        pending.append((ideal_date, doctor))

    pending.sort(key=lambda p: p[0])

    for ideal_date, doctor in pending:
        cursor = ideal_date

        while cursor <= end_date:
            # Si ya existe una visita para este médico cerca de esa fecha, no duplicar
            existing = db.query(Visit).filter(
                Visit.doctor_id == doctor.id,
                Visit.scheduled_date >= cursor - timedelta(hours=12),
                Visit.scheduled_date <= cursor + timedelta(hours=12)
            ).first()

            if existing:
                skipped += 1
                cursor = existing.scheduled_date + timedelta(days=doctor.visit_frequency)
                continue

            slot_date = next_available_slot(doctor.rep_id, cursor)
            if slot_date > end_date:
                break

            visit = Visit(
                doctor_id=doctor.id,
                rep_id=doctor.rep_id,
                scheduled_date=slot_date,
                status="scheduled"
            )
            db.add(visit)
            day_counts[(doctor.rep_id, slot_date.date())] = day_counts.get((doctor.rep_id, slot_date.date()), 0) + 1
            total_created += 1

            cursor = slot_date + timedelta(days=doctor.visit_frequency)

    db.commit()
    return {
        "message": (
            f"Generación completada: {total_created} visitas creadas "
            f"(máx. {MAX_VISITS_PER_DAY}/día hábil por visitador), {skipped} ya existentes"
        ),
        "created": total_created,
        "skipped": skipped,
        "max_visits_per_day": MAX_VISITS_PER_DAY
    }
