from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from datetime import datetime
from ..database import get_db
from ..models import MedicalRep, Doctor, Visit, RepTarget, BusinessLine
from ..schemas import MedicalRepCreate, MedicalRepUpdate, MedicalRepOut

router = APIRouter(prefix="/api/reps", tags=["reps"])


def _rep_out(rep: MedicalRep, db: Session) -> MedicalRepOut:
    count = db.query(func.count(Doctor.id)).filter(
        Doctor.rep_id == rep.id,
        Doctor.is_active == True
    ).scalar()
    out = MedicalRepOut.model_validate(rep)
    out.doctor_count = count
    out.business_lines = list(rep.business_lines)
    return out


def _set_business_lines(rep: MedicalRep, ids: List[int], db: Session):
    if ids is None:
        return
    bls = db.query(BusinessLine).filter(BusinessLine.id.in_(ids)).all() if ids else []
    rep.business_lines = bls


@router.get("/", response_model=List[MedicalRepOut])
def get_reps(db: Session = Depends(get_db)):
    reps = db.query(MedicalRep).all()
    return [_rep_out(r, db) for r in reps]


@router.get("/{rep_id}", response_model=MedicalRepOut)
def get_rep(rep_id: int, db: Session = Depends(get_db)):
    rep = db.query(MedicalRep).filter(MedicalRep.id == rep_id).first()
    if not rep:
        raise HTTPException(status_code=404, detail="Visitador no encontrado")
    return _rep_out(rep, db)


@router.post("/", response_model=MedicalRepOut)
def create_rep(data: MedicalRepCreate, db: Session = Depends(get_db)):
    existing = db.query(MedicalRep).filter(MedicalRep.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe un visitador con ese email")
    bl_ids = data.business_line_ids or []
    rep_data = data.model_dump(exclude={"business_line_ids"})
    rep = MedicalRep(**rep_data)
    db.add(rep)
    db.flush()
    _set_business_lines(rep, bl_ids, db)
    db.commit()
    db.refresh(rep)
    return _rep_out(rep, db)


@router.put("/{rep_id}", response_model=MedicalRepOut)
def update_rep(rep_id: int, data: MedicalRepUpdate, db: Session = Depends(get_db)):
    rep = db.query(MedicalRep).filter(MedicalRep.id == rep_id).first()
    if not rep:
        raise HTTPException(status_code=404, detail="Visitador no encontrado")
    update_data = data.model_dump(exclude_unset=True, exclude={"business_line_ids"})
    for key, value in update_data.items():
        setattr(rep, key, value)
    if data.business_line_ids is not None:
        _set_business_lines(rep, data.business_line_ids, db)
    db.commit()
    db.refresh(rep)
    return _rep_out(rep, db)


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
    doctors_updated = db.query(Doctor).filter(Doctor.rep_id == rep_id).update({Doctor.rep_id: None})
    visits_deleted = db.query(Visit).filter(Visit.rep_id == rep_id).delete()
    db.delete(rep)
    db.commit()
    return {
        "message": f"Visitador eliminado. {doctors_updated} médico(s) desasignados, {visits_deleted} visita(s) eliminadas."
    }
