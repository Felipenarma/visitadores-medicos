from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import datetime
from ..database import get_db
from ..models import MedicalRep, Doctor, Visit, RepTarget
from ..schemas import MedicalRepCreate, MedicalRepUpdate, MedicalRepOut

router = APIRouter(prefix="/api/reps", tags=["reps"])


@router.get("/", response_model=List[MedicalRepOut])
def get_reps(db: Session = Depends(get_db)):
    reps = db.query(MedicalRep).all()
    result = []
    for rep in reps:
        count = db.query(func.count(Doctor.id)).filter(
            Doctor.rep_id == rep.id,
            Doctor.is_active == True
        ).scalar()
        out = MedicalRepOut.model_validate(rep)
        out.doctor_count = count
        result.append(out)
    return result


@router.get("/{rep_id}", response_model=MedicalRepOut)
def get_rep(rep_id: int, db: Session = Depends(get_db)):
    rep = db.query(MedicalRep).filter(MedicalRep.id == rep_id).first()
    if not rep:
        raise HTTPException(status_code=404, detail="Visitador no encontrado")
    count = db.query(func.count(Doctor.id)).filter(
        Doctor.rep_id == rep.id,
        Doctor.is_active == True
    ).scalar()
    out = MedicalRepOut.model_validate(rep)
    out.doctor_count = count
    return out


@router.post("/", response_model=MedicalRepOut)
def create_rep(data: MedicalRepCreate, db: Session = Depends(get_db)):
    existing = db.query(MedicalRep).filter(MedicalRep.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe un visitador con ese email")
    rep = MedicalRep(**data.model_dump())
    db.add(rep)
    db.commit()
    db.refresh(rep)
    out = MedicalRepOut.model_validate(rep)
    out.doctor_count = 0
    return out


@router.put("/{rep_id}", response_model=MedicalRepOut)
def update_rep(rep_id: int, data: MedicalRepUpdate, db: Session = Depends(get_db)):
    rep = db.query(MedicalRep).filter(MedicalRep.id == rep_id).first()
    if not rep:
        raise HTTPException(status_code=404, detail="Visitador no encontrado")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(rep, key, value)
    db.commit()
    db.refresh(rep)
    count = db.query(func.count(Doctor.id)).filter(
        Doctor.rep_id == rep.id,
        Doctor.is_active == True
    ).scalar()
    out = MedicalRepOut.model_validate(rep)
    out.doctor_count = count
    return out


@router.get("/{rep_id}/target")
def get_rep_target(rep_id: int, month: int = Query(default=None), year: int = Query(default=None), db: Session = Depends(get_db)):
    now = datetime.utcnow()
    m = month or now.month
    y = year or now.year
    target = db.query(RepTarget).filter(
        RepTarget.rep_id == rep_id, RepTarget.month == m, RepTarget.year == y
    ).first()
    return {"rep_id": rep_id, "month": m, "year": y, "target_visits": target.target_visits if target else 0}


@router.post("/{rep_id}/target")
def set_rep_target(rep_id: int, data: dict, db: Session = Depends(get_db)):
    rep = db.query(MedicalRep).filter(MedicalRep.id == rep_id).first()
    if not rep:
        raise HTTPException(status_code=404, detail="Visitador no encontrado")
    month = data.get("month", datetime.utcnow().month)
    year = data.get("year", datetime.utcnow().year)
    target_visits = int(data.get("target_visits", 0))
    target = db.query(RepTarget).filter(
        RepTarget.rep_id == rep_id, RepTarget.month == month, RepTarget.year == year
    ).first()
    if target:
        target.target_visits = target_visits
    else:
        target = RepTarget(rep_id=rep_id, month=month, year=year, target_visits=target_visits)
        db.add(target)
    db.commit()
    return {"rep_id": rep_id, "month": month, "year": year, "target_visits": target_visits}


@router.delete("/{rep_id}")
def delete_rep(rep_id: int, db: Session = Depends(get_db)):
    rep = db.query(MedicalRep).filter(MedicalRep.id == rep_id).first()
    if not rep:
        raise HTTPException(status_code=404, detail="Visitador no encontrado")
    # Unassign doctors from this rep
    doctors_updated = db.query(Doctor).filter(Doctor.rep_id == rep_id).update({Doctor.rep_id: None})
    # Delete all visits for this rep
    visits_deleted = db.query(Visit).filter(Visit.rep_id == rep_id).delete()
    # Delete the rep
    db.delete(rep)
    db.commit()
    return {
        "message": f"Visitador eliminado. {doctors_updated} médico(s) desasignados, {visits_deleted} visita(s) eliminadas."
    }
