"""Lógica compartida para agendar visitas nuevas en bloque sin exceder el tope
diario por visitador (día hábil, lunes a viernes). Usada tanto por el endpoint
/api/visits/schedule-by-sales como por la herramienta bulk_schedule_visits de Mike."""

from datetime import datetime, timedelta
from typing import List, Optional

from sqlalchemy.orm import Session

from .constants import MAX_VISITS_PER_DAY
from .models import Visit, Doctor


def _build_day_counts(db: Session, start_date: datetime, end_date: datetime) -> dict:
    """Precarga cuántas visitas ya existen por (rep_id, día) en el rango, para no
    exceder el tope diario al sumar las visitas nuevas a las que ya estaban agendadas."""
    day_counts: dict = {}
    existing = db.query(Visit).filter(
        Visit.scheduled_date >= start_date,
        Visit.scheduled_date <= end_date,
        Visit.rep_id != None
    ).all()
    for v in existing:
        key = (v.rep_id, v.scheduled_date.date())
        day_counts[key] = day_counts.get(key, 0) + 1
    return day_counts


def _next_available_slot(
    day_counts: dict, rep_id: int, from_date: datetime, end_date: datetime, max_per_day: int
) -> Optional[datetime]:
    """Próximo día hábil (lun-vie) desde from_date en que el visitador tenga cupo
    (menos de max_per_day visitas agendadas ese día). None si no hay cupo antes de end_date."""
    d = from_date
    for _ in range(3650):  # margen de seguridad (~10 años) para evitar loops infinitos
        if d > end_date:
            return None
        if d.weekday() < 5:  # 0=lunes ... 4=viernes
            key = (rep_id, d.date())
            if day_counts.get(key, 0) < max_per_day:
                return d
        d += timedelta(days=1)
    return None


def schedule_visits_for_doctors(
    db: Session,
    doctors: List[Doctor],
    start_date: Optional[datetime] = None,
    window_days: int = 60,
    max_per_day: int = MAX_VISITS_PER_DAY,
    skip_if_has_future_visit: bool = True,
    notes: Optional[str] = None,
) -> dict:
    """Agenda una visita para cada médico de la lista, repartiendo la carga de cada
    visitador en máximo `max_per_day` visitas por día hábil (lun-vie).

    - No duplica: si skip_if_has_future_visit=True (default), omite médicos que ya
      tengan una visita con status='scheduled' en el rango.
    - Los médicos sin visitador asignado no pueden agendarse (una visita requiere
      rep_id) y se reportan aparte en 'sin_visitador'.
    - Hace commit al final. El llamador es responsable de no llamar dos veces
      sobre el mismo set sin revisar 'ya_agendados'/'sin_cupo'.
    """
    start_date = start_date or datetime.utcnow()
    end_date = start_date + timedelta(days=window_days)

    day_counts = _build_day_counts(db, start_date, end_date)

    con_rep = [d for d in doctors if d.rep_id]
    sin_visitador = [{"doctor_id": d.id, "nombre": d.name} for d in doctors if not d.rep_id]

    # Orden estable y predecible: por visitador y luego por nombre.
    con_rep.sort(key=lambda d: (d.rep_id, d.name or ""))

    creados = []
    ya_agendados = []
    sin_cupo = []

    for doctor in con_rep:
        if skip_if_has_future_visit:
            existing = db.query(Visit).filter(
                Visit.doctor_id == doctor.id,
                Visit.status == "scheduled",
                Visit.scheduled_date >= start_date
            ).first()
            if existing:
                ya_agendados.append({
                    "doctor_id": doctor.id,
                    "nombre": doctor.name,
                    "fecha": existing.scheduled_date.strftime("%Y-%m-%d")
                })
                continue

        slot_date = _next_available_slot(day_counts, doctor.rep_id, start_date, end_date, max_per_day)
        if slot_date is None:
            sin_cupo.append({"doctor_id": doctor.id, "nombre": doctor.name})
            continue

        visit = Visit(
            doctor_id=doctor.id,
            rep_id=doctor.rep_id,
            scheduled_date=slot_date,
            status="scheduled",
            notes=notes,
        )
        db.add(visit)
        key = (doctor.rep_id, slot_date.date())
        day_counts[key] = day_counts.get(key, 0) + 1
        creados.append({
            "doctor_id": doctor.id,
            "nombre": doctor.name,
            "rep_id": doctor.rep_id,
            "fecha": slot_date.strftime("%Y-%m-%d")
        })

    db.commit()

    return {
        "creados": creados,
        "total_creados": len(creados),
        "ya_agendados": ya_agendados,
        "total_ya_agendados": len(ya_agendados),
        "sin_visitador": sin_visitador,
        "total_sin_visitador": len(sin_visitador),
        "sin_cupo": sin_cupo,
        "total_sin_cupo": len(sin_cupo),
        "max_visitas_por_dia": max_per_day,
    }
