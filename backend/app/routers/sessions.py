from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from typing import Optional
from ..database import get_db
from ..models import UserSession, MedicalRep

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def _compute_duration(session: UserSession) -> int:
    """Minutos entre login_at y last_activity."""
    if not session.login_at or not session.last_activity:
        return 0
    delta = session.last_activity - session.login_at
    return max(0, int(delta.total_seconds() / 60))


@router.post("/start")
def start_session(data: dict, db: Session = Depends(get_db)):
    """Registrar inicio de sesión de un visitador."""
    rep_id = data.get("rep_id")
    if not rep_id:
        return {"error": "rep_id requerido"}
    now = datetime.utcnow()
    session = UserSession(rep_id=rep_id, login_at=now, last_activity=now)
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"session_id": session.id}


@router.post("/heartbeat")
def heartbeat(data: dict, db: Session = Depends(get_db)):
    """Actualizar actividad de una sesión activa."""
    session_id = data.get("session_id")
    if not session_id:
        return {"ok": False}
    session = db.query(UserSession).filter(UserSession.id == session_id).first()
    if not session:
        return {"ok": False}
    now = datetime.utcnow()
    session.last_activity = now
    session.duration_minutes = _compute_duration(session)
    db.commit()
    return {"ok": True, "duration_minutes": session.duration_minutes}


@router.post("/end")
def end_session(data: dict, db: Session = Depends(get_db)):
    """Registrar cierre de sesión."""
    session_id = data.get("session_id")
    if not session_id:
        return {"ok": False}
    session = db.query(UserSession).filter(UserSession.id == session_id).first()
    if not session:
        return {"ok": False}
    now = datetime.utcnow()
    session.logout_at = now
    session.last_activity = now
    session.duration_minutes = _compute_duration(session)
    db.commit()
    return {"ok": True, "duration_minutes": session.duration_minutes}


@router.get("/rep/{rep_id}/stats")
def get_rep_session_stats(
    rep_id: int,
    days: int = Query(default=7),
    db: Session = Depends(get_db)
):
    """Estadísticas de sesión de un visitador en los últimos N días."""
    since = datetime.utcnow() - timedelta(days=days)
    sessions = db.query(UserSession).filter(
        UserSession.rep_id == rep_id,
        UserSession.login_at >= since
    ).order_by(UserSession.login_at.desc()).all()

    # Agrupar por día
    from collections import defaultdict
    by_day: dict = defaultdict(lambda: {"count": 0, "duration_minutes": 0, "sessions": []})
    for s in sessions:
        day = s.login_at.date().isoformat()
        by_day[day]["count"] += 1
        by_day[day]["duration_minutes"] += s.duration_minutes or 0
        by_day[day]["sessions"].append({
            "id": s.id,
            "login_at": s.login_at.isoformat(),
            "logout_at": s.logout_at.isoformat() if s.logout_at else None,
            "duration_minutes": s.duration_minutes or 0,
        })

    total_sessions = len(sessions)
    total_minutes = sum(s.duration_minutes or 0 for s in sessions)
    days_with_activity = len(by_day)
    avg_sessions_per_day = round(total_sessions / days, 1) if days > 0 else 0
    avg_duration = round(total_minutes / total_sessions, 1) if total_sessions > 0 else 0

    return {
        "rep_id": rep_id,
        "period_days": days,
        "total_sessions": total_sessions,
        "total_minutes": total_minutes,
        "days_with_activity": days_with_activity,
        "avg_sessions_per_day": avg_sessions_per_day,
        "avg_duration_minutes": avg_duration,
        "by_day": dict(sorted(by_day.items(), reverse=True)),
    }


@router.get("/summary")
def get_all_sessions_summary(
    days: int = Query(default=7),
    db: Session = Depends(get_db)
):
    """Resumen de sesiones de todos los visitadores."""
    since = datetime.utcnow() - timedelta(days=days)
    sessions = db.query(UserSession).filter(
        UserSession.login_at >= since
    ).all()
    reps = {r.id: r for r in db.query(MedicalRep).filter(MedicalRep.is_active == True).all()}

    from collections import defaultdict
    by_rep: dict = defaultdict(lambda: {"sessions": 0, "total_minutes": 0, "last_seen": None})
    for s in sessions:
        by_rep[s.rep_id]["sessions"] += 1
        by_rep[s.rep_id]["total_minutes"] += s.duration_minutes or 0
        la = s.login_at.isoformat()
        if by_rep[s.rep_id]["last_seen"] is None or la > by_rep[s.rep_id]["last_seen"]:
            by_rep[s.rep_id]["last_seen"] = la

    result = []
    for rep_id, rep in reps.items():
        data = by_rep.get(rep_id, {"sessions": 0, "total_minutes": 0, "last_seen": None})
        result.append({
            "rep_id": rep_id,
            "rep_name": rep.name,
            "sessions": data["sessions"],
            "total_minutes": data["total_minutes"],
            "avg_sessions_per_day": round(data["sessions"] / days, 1),
            "avg_duration_minutes": round(data["total_minutes"] / data["sessions"], 1) if data["sessions"] > 0 else 0,
            "last_seen": data["last_seen"],
        })
    result.sort(key=lambda x: x["last_seen"] or "", reverse=True)
    return {"period_days": days, "reps": result}
