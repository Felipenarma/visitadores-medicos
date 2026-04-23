from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from datetime import datetime, timedelta
from typing import Any, Optional, List
import os
import json
import uuid
import io
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import anthropic
import openpyxl
from ..database import get_db
from ..models import Visit, Doctor, MedicalRep, Sale, BusinessLine
from ..schemas import AgentMessage

router = APIRouter(prefix="/api/mike", tags=["mike"])

# Module-level store for Excel exports keyed by token
_export_store: dict = {}

MIKE_SYSTEM_PROMPT = """Eres Mike, el asistente de IA del laboratorio Narma para el administrador Felipe.

Tu rol es ayudar a Felipe a:
- Analizar el desempeño de los visitadores médicos (visitas realizadas, tasa de cumplimiento, tendencias)
- Gestionar y analizar la cartera de médicos (nuevos médicos, ranking por ventas, médicos sin visitar)
- Obtener métricas de ventas por período, línea de negocio, visitador o médico
- Calcular y revisar comisiones de visitadores
- Identificar oportunidades: médicos que dejaron de comprar, visitadores con bajo rendimiento, etc.
- Gestionar datos: asignar visitadores a médicos, registrar visitas, etc.

Responde siempre en español. Sé analítico, preciso y proactivo: cuando entregues datos, ofrece interpretaciones y recomendaciones. Si el período no se especifica, usa el mes actual. Si detectas algo relevante en los datos (un visitador con pocas visitas, un médico que bajó sus compras), coméntalo sin que te lo pidan.

Cuando el usuario pida exportar datos a Excel, usa la herramienta export_to_excel con el tipo apropiado.

Fecha actual: {current_date}"""

MIKE_TOOLS = [
    {
        "name": "get_dashboard_overview",
        "description": "Obtiene KPIs generales de la plataforma: total médicos activos, visitadores activos, visitas de hoy/semana/mes y distribución de ventas por línea de negocio.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "get_all_reps_summary",
        "description": "Resumen de todos los visitadores: nombre, médicos asignados, visitas del mes, tasa de cumplimiento y ventas generadas.",
        "input_schema": {
            "type": "object",
            "properties": {
                "month": {"type": "integer", "description": "Mes (1-12). Si no se indica, usa el mes actual."},
                "year": {"type": "integer", "description": "Año (ej: 2026). Si no se indica, usa el año actual."}
            }
        }
    },
    {
        "name": "get_rep_detail",
        "description": "Análisis detallado de un visitador específico: visitas realizadas vs programadas, médicos asignados, ventas por categoría, médicos nuevos y comisión estimada.",
        "input_schema": {
            "type": "object",
            "properties": {
                "rep_id": {"type": "integer", "description": "ID del visitador"},
                "month": {"type": "integer", "description": "Mes (1-12)"},
                "year": {"type": "integer", "description": "Año"}
            },
            "required": ["rep_id"]
        }
    },
    {
        "name": "get_doctor_ranking",
        "description": "Ranking de médicos por volumen de ventas (unidades o monto). Útil para identificar los mejores prescriptores.",
        "input_schema": {
            "type": "object",
            "properties": {
                "month": {"type": "integer", "description": "Mes (1-12)"},
                "year": {"type": "integer", "description": "Año"},
                "top": {"type": "integer", "description": "Cuántos médicos mostrar (default: 20)"},
                "rep_id": {"type": "integer", "description": "Filtrar por visitador específico (opcional)"},
                "business_line_id": {"type": "integer", "description": "Filtrar por línea de negocio (opcional)"}
            }
        }
    },
    {
        "name": "get_new_doctors",
        "description": "Médicos que compraron por primera vez en un período determinado. Indicador clave de crecimiento de cartera.",
        "input_schema": {
            "type": "object",
            "properties": {
                "month": {"type": "integer", "description": "Mes (1-12)"},
                "year": {"type": "integer", "description": "Año"}
            }
        }
    },
    {
        "name": "get_sales_analysis",
        "description": "Análisis de ventas con múltiples filtros. Puede agrupar por médico, visitador o línea de negocio. Compara períodos.",
        "input_schema": {
            "type": "object",
            "properties": {
                "month": {"type": "integer", "description": "Mes (1-12)"},
                "year": {"type": "integer", "description": "Año"},
                "rep_id": {"type": "integer", "description": "Filtrar por visitador (opcional)"},
                "doctor_id": {"type": "integer", "description": "Filtrar por médico (opcional)"},
                "business_line_name": {"type": "string", "description": "Filtrar por nombre de línea de negocio (opcional)"},
                "group_by": {
                    "type": "string",
                    "enum": ["doctor", "rep", "business_line", "month", "category"],
                    "description": "Cómo agrupar los resultados"
                }
            }
        }
    },
    {
        "name": "get_rep_commissions",
        "description": "Comisiones calculadas por visitador para un período: ventas totales, médicos nuevos, detalle por médico y categoría.",
        "input_schema": {
            "type": "object",
            "properties": {
                "month": {"type": "integer", "description": "Mes (1-12)"},
                "year": {"type": "integer", "description": "Año"},
                "rep_id": {"type": "integer", "description": "Filtrar por visitador específico (opcional)"}
            }
        }
    },
    {
        "name": "get_visits_tracking",
        "description": "Seguimiento de visitas: completitud por visitador para una fecha o rango. Identifica visitadores que no están cumpliendo sus visitas.",
        "input_schema": {
            "type": "object",
            "properties": {
                "date": {"type": "string", "description": "Fecha en formato YYYY-MM-DD (default: hoy)"},
                "month": {"type": "integer", "description": "Si se indica, analiza todo el mes en lugar de un día"},
                "year": {"type": "integer", "description": "Año para análisis mensual"}
            }
        }
    },
    {
        "name": "search_doctors",
        "description": "Busca médicos por nombre, especialidad o visitador asignado. Devuelve datos de contacto, asignación y última visita.",
        "input_schema": {
            "type": "object",
            "properties": {
                "search": {"type": "string", "description": "Nombre parcial del médico"},
                "specialty": {"type": "string", "description": "Especialidad médica"},
                "rep_id": {"type": "integer", "description": "Filtrar por visitador"},
                "without_rep": {"type": "boolean", "description": "Si es true, solo médicos sin visitador asignado"},
                "limit": {"type": "integer", "description": "Máximo de resultados (default: 30)"}
            }
        }
    },
    {
        "name": "get_doctor_detail",
        "description": "Información completa de un médico: datos de contacto, visitador asignado, historial de visitas, ventas históricas y evolución mensual.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctor_id": {"type": "integer", "description": "ID del médico"}
            },
            "required": ["doctor_id"]
        }
    },
    {
        "name": "get_inactive_doctors",
        "description": "Médicos que no han recibido visitas o no han comprado en los últimos N días. Útil para detectar cartera en riesgo.",
        "input_schema": {
            "type": "object",
            "properties": {
                "days_without_visit": {"type": "integer", "description": "Días sin visita para considerar inactivo (default: 45)"},
                "rep_id": {"type": "integer", "description": "Filtrar por visitador (opcional)"}
            }
        }
    },
    {
        "name": "list_reps",
        "description": "Lista todos los visitadores médicos con sus datos básicos (id, nombre, email, teléfono, zona).",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "assign_rep_to_doctor",
        "description": "Asigna o cambia el visitador asignado a un médico.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctor_id": {"type": "integer", "description": "ID del médico"},
                "rep_id": {"type": "integer", "description": "ID del visitador. Usar 0 para desasignar."}
            },
            "required": ["doctor_id", "rep_id"]
        }
    },
    {
        "name": "get_monthly_trend",
        "description": "Evolución mensual de ventas y visitas para los últimos N meses. Ideal para ver tendencias de crecimiento.",
        "input_schema": {
            "type": "object",
            "properties": {
                "months": {"type": "integer", "description": "Cuántos meses hacia atrás analizar (default: 6)"},
                "rep_id": {"type": "integer", "description": "Filtrar por visitador (opcional)"},
                "business_line_name": {"type": "string", "description": "Filtrar por línea de negocio (opcional)"}
            }
        }
    },
    {
        "name": "export_to_excel",
        "description": "Exporta datos a un archivo Excel descargable. Úsalo cuando el usuario pida exportar, descargar o generar un Excel.",
        "input_schema": {
            "type": "object",
            "properties": {
                "data_type": {
                    "type": "string",
                    "enum": ["ranking_medicos", "visitadores", "nuevos_medicos", "tendencia_ventas", "comisiones"],
                    "description": "Tipo de datos a exportar"
                },
                "month": {"type": "integer", "description": "Mes (1-12). Si no se indica, usa el mes actual."},
                "year": {"type": "integer", "description": "Año. Si no se indica, usa el año actual."},
                "rep_id": {"type": "integer", "description": "Filtrar por visitador específico (opcional)"}
            },
            "required": ["data_type"]
        }
    }
]


def execute_mike_tool(tool_name: str, tool_input: dict, db: Session) -> Any:
    now = datetime.utcnow()
    current_month = now.month
    current_year = now.year

    # ── get_dashboard_overview ────────────────────────────────────────────────
    if tool_name == "get_dashboard_overview":
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_end = today_start + timedelta(days=1)
        week_start = today_start - timedelta(days=today_start.weekday())
        month_start = today_start.replace(day=1)

        total_doctors = db.query(func.count(Doctor.id)).filter(Doctor.is_active == True).scalar()
        total_reps = db.query(func.count(MedicalRep.id)).filter(MedicalRep.is_active == True).scalar()

        visits_today = db.query(func.count(Visit.id)).filter(
            Visit.scheduled_date >= today_start, Visit.scheduled_date < today_end
        ).scalar()
        visits_completed_today = db.query(func.count(Visit.id)).filter(
            Visit.scheduled_date >= today_start, Visit.scheduled_date < today_end,
            Visit.status == "completed"
        ).scalar()
        visits_week = db.query(func.count(Visit.id)).filter(
            Visit.scheduled_date >= week_start, Visit.scheduled_date < today_end
        ).scalar()
        visits_month = db.query(func.count(Visit.id)).filter(
            Visit.scheduled_date >= month_start
        ).scalar()
        visits_completed_month = db.query(func.count(Visit.id)).filter(
            Visit.scheduled_date >= month_start, Visit.status == "completed"
        ).scalar()

        # Sales this month
        sales_month = db.query(func.sum(Sale.amount)).filter(
            extract('month', Sale.sale_date) == current_month,
            extract('year', Sale.sale_date) == current_year
        ).scalar() or 0

        sales_count_month = db.query(func.count(Sale.id)).filter(
            extract('month', Sale.sale_date) == current_month,
            extract('year', Sale.sale_date) == current_year
        ).scalar()

        # By business line this month
        bl_sales = db.query(
            BusinessLine.name, func.sum(Sale.amount).label("total"), func.count(Sale.id).label("count")
        ).join(Doctor, Doctor.id == Sale.doctor_id, isouter=True
        ).join(BusinessLine, BusinessLine.id == Doctor.business_line_id, isouter=True
        ).filter(
            extract('month', Sale.sale_date) == current_month,
            extract('year', Sale.sale_date) == current_year
        ).group_by(BusinessLine.name).all()

        return {
            "fecha": now.strftime("%d/%m/%Y"),
            "medicos_activos": total_doctors,
            "visitadores_activos": total_reps,
            "visitas_hoy": {"programadas": visits_today, "completadas": visits_completed_today},
            "visitas_semana": visits_week,
            "visitas_mes": {"programadas": visits_month, "completadas": visits_completed_month,
                            "tasa_cumplimiento": round(visits_completed_month / visits_month * 100, 1) if visits_month else 0},
            "ventas_mes": {"total_monto": round(float(sales_month), 2), "total_registros": sales_count_month},
            "ventas_por_linea": [{"linea": r.name or "Sin línea", "monto": round(float(r.total or 0), 2), "registros": r.count} for r in bl_sales]
        }

    # ── get_all_reps_summary ──────────────────────────────────────────────────
    elif tool_name == "get_all_reps_summary":
        month = tool_input.get("month", current_month)
        year = tool_input.get("year", current_year)
        month_start = datetime(year, month, 1)
        if month == 12:
            month_end = datetime(year + 1, 1, 1)
        else:
            month_end = datetime(year, month + 1, 1)

        reps = db.query(MedicalRep).filter(MedicalRep.is_active == True).all()
        result = []
        for rep in reps:
            doctors_count = db.query(func.count(Doctor.id)).filter(
                Doctor.rep_id == rep.id, Doctor.is_active == True
            ).scalar()

            visits_programmed = db.query(func.count(Visit.id)).filter(
                Visit.rep_id == rep.id,
                Visit.scheduled_date >= month_start,
                Visit.scheduled_date < month_end
            ).scalar()
            visits_done = db.query(func.count(Visit.id)).filter(
                Visit.rep_id == rep.id,
                Visit.scheduled_date >= month_start,
                Visit.scheduled_date < month_end,
                Visit.status == "completed"
            ).scalar()

            sales_amount = db.query(func.sum(Sale.amount)).join(
                Doctor, Doctor.id == Sale.doctor_id
            ).filter(
                Doctor.rep_id == rep.id,
                extract('month', Sale.sale_date) == month,
                extract('year', Sale.sale_date) == year
            ).scalar() or 0

            sales_count = db.query(func.count(Sale.id)).join(
                Doctor, Doctor.id == Sale.doctor_id
            ).filter(
                Doctor.rep_id == rep.id,
                extract('month', Sale.sale_date) == month,
                extract('year', Sale.sale_date) == year
            ).scalar()

            result.append({
                "rep_id": rep.id,
                "nombre": rep.name,
                "zona": rep.zone,
                "territorio": rep.territory,
                "medicos_asignados": doctors_count,
                "visitas_programadas": visits_programmed,
                "visitas_completadas": visits_done,
                "tasa_cumplimiento": round(visits_done / visits_programmed * 100, 1) if visits_programmed else 0,
                "ventas_monto": round(float(sales_amount), 2),
                "ventas_registros": sales_count
            })

        result.sort(key=lambda x: x["ventas_monto"], reverse=True)
        return {"periodo": f"{month:02d}/{year}", "visitadores": result, "total": len(result)}

    # ── get_rep_detail ────────────────────────────────────────────────────────
    elif tool_name == "get_rep_detail":
        rep_id = tool_input.get("rep_id")
        month = tool_input.get("month", current_month)
        year = tool_input.get("year", current_year)

        rep = db.query(MedicalRep).filter(MedicalRep.id == rep_id).first()
        if not rep:
            return {"error": f"Visitador {rep_id} no encontrado"}

        month_start = datetime(year, month, 1)
        month_end = datetime(year, month + 1, 1) if month < 12 else datetime(year + 1, 1, 1)

        # Visits
        visits = db.query(Visit).filter(
            Visit.rep_id == rep_id,
            Visit.scheduled_date >= month_start,
            Visit.scheduled_date < month_end
        ).all()
        completed = [v for v in visits if v.status == "completed"]
        missed = [v for v in visits if v.status == "missed"]

        # Doctors assigned
        doctors = db.query(Doctor).filter(Doctor.rep_id == rep_id, Doctor.is_active == True).all()

        # Sales by category
        sales_by_cat = db.query(
            Sale.categoria, func.sum(Sale.amount).label("total"), func.count(Sale.id).label("count")
        ).join(Doctor, Doctor.id == Sale.doctor_id
        ).filter(
            Doctor.rep_id == rep_id,
            extract('month', Sale.sale_date) == month,
            extract('year', Sale.sale_date) == year
        ).group_by(Sale.categoria).all()

        total_sales = sum(float(r.total or 0) for r in sales_by_cat)

        # New doctors (first sale ever)
        new_docs = []
        for doc in doctors:
            first_sale = db.query(Sale).filter(Sale.doctor_id == doc.id).order_by(Sale.sale_date.asc()).first()
            if first_sale and first_sale.sale_date:
                if first_sale.sale_date.month == month and first_sale.sale_date.year == year:
                    new_docs.append({"doctor_id": doc.id, "nombre": doc.name, "especialidad": doc.specialty})

        return {
            "rep_id": rep.id,
            "nombre": rep.name,
            "zona": rep.zone,
            "periodo": f"{month:02d}/{year}",
            "medicos_asignados": len(doctors),
            "visitas": {
                "programadas": len(visits),
                "completadas": len(completed),
                "perdidas": len(missed),
                "tasa_cumplimiento": round(len(completed) / len(visits) * 100, 1) if visits else 0
            },
            "ventas_total": round(total_sales, 2),
            "ventas_por_categoria": [
                {"categoria": r.categoria or "Sin categoría", "monto": round(float(r.total or 0), 2), "registros": r.count}
                for r in sorted(sales_by_cat, key=lambda x: float(x.total or 0), reverse=True)
            ],
            "medicos_nuevos": new_docs,
            "lista_medicos": [{"id": d.id, "nombre": d.name, "especialidad": d.specialty} for d in doctors[:20]]
        }

    # ── get_doctor_ranking ────────────────────────────────────────────────────
    elif tool_name == "get_doctor_ranking":
        month = tool_input.get("month", current_month)
        year = tool_input.get("year", current_year)
        top = tool_input.get("top", 20)
        rep_id = tool_input.get("rep_id")
        business_line_id = tool_input.get("business_line_id")

        query = db.query(
            Doctor.id, Doctor.name, Doctor.specialty,
            func.sum(Sale.amount).label("total_monto"),
            func.count(Sale.id).label("total_registros")
        ).join(Sale, Sale.doctor_id == Doctor.id
        ).filter(
            extract('month', Sale.sale_date) == month,
            extract('year', Sale.sale_date) == year
        )
        if rep_id:
            query = query.filter(Doctor.rep_id == rep_id)
        if business_line_id:
            query = query.filter(Doctor.business_line_id == business_line_id)

        rows = query.group_by(Doctor.id, Doctor.name, Doctor.specialty
                              ).order_by(func.sum(Sale.amount).desc()).limit(top).all()

        # Previous month for comparison
        prev_month = month - 1 if month > 1 else 12
        prev_year = year if month > 1 else year - 1

        result = []
        for i, r in enumerate(rows):
            prev_sales = db.query(func.sum(Sale.amount)).filter(
                Sale.doctor_id == r.id,
                extract('month', Sale.sale_date) == prev_month,
                extract('year', Sale.sale_date) == prev_year
            ).scalar() or 0
            result.append({
                "posicion": i + 1,
                "doctor_id": r.id,
                "nombre": r.name,
                "especialidad": r.specialty,
                "monto_mes": round(float(r.total_monto or 0), 2),
                "unidades": r.total_registros,
                "registros": r.total_registros,
                "monto_mes_anterior": round(float(prev_sales), 2),
                "variacion_pct": round((float(r.total_monto or 0) - float(prev_sales)) / float(prev_sales) * 100, 1) if prev_sales else None
            })

        return {"periodo": f"{month:02d}/{year}", "ranking": result}

    # ── get_new_doctors ───────────────────────────────────────────────────────
    elif tool_name == "get_new_doctors":
        month = tool_input.get("month", current_month)
        year = tool_input.get("year", current_year)

        # First sale ever for each doctor that happened in this month/year
        subq = db.query(
            Sale.doctor_id,
            func.min(Sale.sale_date).label("primera_venta")
        ).group_by(Sale.doctor_id).subquery()

        rows = db.query(
            Doctor.id, Doctor.name, Doctor.specialty, subq.c.primera_venta,
            MedicalRep.name.label("rep_name")
        ).join(subq, subq.c.doctor_id == Doctor.id
        ).outerjoin(MedicalRep, MedicalRep.id == Doctor.rep_id
        ).filter(
            extract('month', subq.c.primera_venta) == month,
            extract('year', subq.c.primera_venta) == year
        ).all()

        result = []
        for r in rows:
            total = db.query(func.sum(Sale.amount)).filter(
                Sale.doctor_id == r.id,
                extract('month', Sale.sale_date) == month,
                extract('year', Sale.sale_date) == year
            ).scalar() or 0
            result.append({
                "doctor_id": r.id,
                "nombre": r.name,
                "especialidad": r.specialty,
                "visitador": r.rep_name,
                "primera_venta": r.primera_venta.strftime("%d/%m/%Y") if r.primera_venta else None,
                "ventas_mes": round(float(total), 2)
            })

        return {"periodo": f"{month:02d}/{year}", "medicos_nuevos": result, "total": len(result)}

    # ── get_sales_analysis ────────────────────────────────────────────────────
    elif tool_name == "get_sales_analysis":
        month = tool_input.get("month", current_month)
        year = tool_input.get("year", current_year)
        rep_id = tool_input.get("rep_id")
        doctor_id = tool_input.get("doctor_id")
        business_line_name = tool_input.get("business_line_name")
        group_by = tool_input.get("group_by", "doctor")

        base_query = db.query(Sale).filter(
            extract('month', Sale.sale_date) == month,
            extract('year', Sale.sale_date) == year
        )

        if doctor_id:
            base_query = base_query.filter(Sale.doctor_id == doctor_id)
        if rep_id:
            doc_ids = [d.id for d in db.query(Doctor.id).filter(Doctor.rep_id == rep_id).all()]
            base_query = base_query.filter(Sale.doctor_id.in_(doc_ids))
        if business_line_name:
            bl = db.query(BusinessLine).filter(BusinessLine.name.ilike(f"%{business_line_name}%")).first()
            if bl:
                doc_ids = [d.id for d in db.query(Doctor.id).filter(Doctor.business_line_id == bl.id).all()]
                base_query = base_query.filter(Sale.doctor_id.in_(doc_ids))

        sales = base_query.all()
        total_monto = sum(float(s.amount or 0) for s in sales)
        total_registros = len(sales)

        grouped = {}
        for s in sales:
            if group_by == "doctor":
                key = s.doctor_id
                label = s.doctor.name if s.doctor else f"Doctor {s.doctor_id}"
            elif group_by == "rep":
                key = s.doctor.rep_id if s.doctor else None
                label = s.doctor.rep.name if s.doctor and s.doctor.rep else "Sin visitador"
            elif group_by == "business_line":
                key = s.doctor.business_line_id if s.doctor else None
                label = s.doctor.business_line.name if s.doctor and s.doctor.business_line else "Sin línea"
            elif group_by == "category":
                key = s.categoria or "Sin categoría"
                label = key
            else:
                key = label = "total"

            if key not in grouped:
                grouped[key] = {"label": label, "monto": 0, "registros": 0}
            grouped[key]["monto"] += float(s.amount or 0)
            grouped[key]["registros"] += 1

        breakdown = sorted(
            [{"grupo": v["label"], "monto": round(v["monto"], 2), "registros": v["registros"]} for v in grouped.values()],
            key=lambda x: x["monto"], reverse=True
        )

        return {
            "periodo": f"{month:02d}/{year}",
            "total_monto": round(total_monto, 2),
            "total_registros": total_registros,
            "agrupado_por": group_by,
            "detalle": breakdown[:50]
        }

    # ── get_rep_commissions ───────────────────────────────────────────────────
    elif tool_name == "get_rep_commissions":
        month = tool_input.get("month", current_month)
        year = tool_input.get("year", current_year)
        filter_rep_id = tool_input.get("rep_id")

        reps_q = db.query(MedicalRep).filter(MedicalRep.is_active == True)
        if filter_rep_id:
            reps_q = reps_q.filter(MedicalRep.id == filter_rep_id)
        reps = reps_q.all()

        result = []
        for rep in reps:
            doctors = db.query(Doctor).filter(Doctor.rep_id == rep.id, Doctor.is_active == True).all()

            # New doctors this month
            new_docs_count = 0
            for doc in doctors:
                first_sale = db.query(Sale).filter(Sale.doctor_id == doc.id).order_by(Sale.sale_date.asc()).first()
                if first_sale and first_sale.sale_date:
                    if first_sale.sale_date.month == month and first_sale.sale_date.year == year:
                        new_docs_count += 1

            # Sales by category
            sales_cats = db.query(
                Sale.categoria, func.sum(Sale.amount).label("total"), func.count(Sale.id).label("count")
            ).join(Doctor, Doctor.id == Sale.doctor_id
            ).filter(
                Doctor.rep_id == rep.id,
                extract('month', Sale.sale_date) == month,
                extract('year', Sale.sale_date) == year
            ).group_by(Sale.categoria).all()

            total_sales = sum(float(r.total or 0) for r in sales_cats)

            # Active doctors (with at least 1 sale this month)
            active_docs = db.query(func.count(func.distinct(Sale.doctor_id))
            ).join(Doctor, Doctor.id == Sale.doctor_id
            ).filter(
                Doctor.rep_id == rep.id,
                extract('month', Sale.sale_date) == month,
                extract('year', Sale.sale_date) == year
            ).scalar()

            result.append({
                "rep_id": rep.id,
                "nombre": rep.name,
                "zona": rep.zone,
                "medicos_activos": active_docs,
                "medicos_nuevos": new_docs_count,
                "total_ventas": round(total_sales, 2),
                "ventas_total": round(total_sales, 2),
                "ventas_por_categoria": [
                    {"categoria": r.categoria or "Sin categoría", "monto": round(float(r.total or 0), 2), "registros": r.count}
                    for r in sorted(sales_cats, key=lambda x: float(x.total or 0), reverse=True)
                ]
            })

        return {"periodo": f"{month:02d}/{year}", "comisiones": result}

    # ── get_visits_tracking ───────────────────────────────────────────────────
    elif tool_name == "get_visits_tracking":
        month = tool_input.get("month")
        year = tool_input.get("year", current_year)
        date_str = tool_input.get("date")

        if month:
            start = datetime(year, month, 1)
            end = datetime(year, month + 1, 1) if month < 12 else datetime(year + 1, 1, 1)
            label = f"{month:02d}/{year}"
        else:
            if date_str:
                try:
                    d = datetime.strptime(date_str, "%Y-%m-%d")
                except ValueError:
                    d = now
            else:
                d = now
            start = d.replace(hour=0, minute=0, second=0, microsecond=0)
            end = start + timedelta(days=1)
            label = d.strftime("%d/%m/%Y")

        reps = db.query(MedicalRep).filter(MedicalRep.is_active == True).all()
        result = []
        for rep in reps:
            total = db.query(func.count(Visit.id)).filter(
                Visit.rep_id == rep.id, Visit.scheduled_date >= start, Visit.scheduled_date < end
            ).scalar()
            completed = db.query(func.count(Visit.id)).filter(
                Visit.rep_id == rep.id, Visit.scheduled_date >= start, Visit.scheduled_date < end,
                Visit.status == "completed"
            ).scalar()
            missed = db.query(func.count(Visit.id)).filter(
                Visit.rep_id == rep.id, Visit.scheduled_date >= start, Visit.scheduled_date < end,
                Visit.status == "missed"
            ).scalar()
            result.append({
                "rep_id": rep.id,
                "rep_name": rep.name,
                "nombre": rep.name,
                "visitas_programadas": total,
                "completadas": completed,
                "perdidas": missed,
                "completion_rate": round(completed / total * 100, 1) if total else 0,
                "tasa": round(completed / total * 100, 1) if total else 0
            })

        result.sort(key=lambda x: x["tasa"])
        return {"periodo": label, "tracking": result}

    # ── search_doctors ────────────────────────────────────────────────────────
    elif tool_name == "search_doctors":
        search = tool_input.get("search", "")
        specialty = tool_input.get("specialty")
        rep_id = tool_input.get("rep_id")
        without_rep = tool_input.get("without_rep", False)
        limit = tool_input.get("limit", 30)

        q = db.query(Doctor).filter(Doctor.is_active == True)
        if search:
            q = q.filter(Doctor.name.ilike(f"%{search}%"))
        if specialty:
            q = q.filter(Doctor.specialty.ilike(f"%{specialty}%"))
        if rep_id:
            q = q.filter(Doctor.rep_id == rep_id)
        if without_rep:
            q = q.filter(Doctor.rep_id == None)

        doctors = q.limit(limit).all()
        result = []
        for d in doctors:
            last_visit = db.query(Visit).filter(
                Visit.doctor_id == d.id, Visit.status == "completed"
            ).order_by(Visit.actual_date.desc()).first()

            last_sale = db.query(Sale).filter(Sale.doctor_id == d.id).order_by(Sale.sale_date.desc()).first()

            result.append({
                "doctor_id": d.id,
                "nombre": d.name,
                "especialidad": d.specialty,
                "direccion": d.address,
                "telefono": d.phone,
                "visitador": d.rep.name if d.rep else None,
                "linea_negocio": d.business_line.name if d.business_line else None,
                "ultima_visita": last_visit.actual_date.strftime("%d/%m/%Y") if last_visit and last_visit.actual_date else None,
                "ultima_venta": last_sale.sale_date.strftime("%d/%m/%Y") if last_sale and last_sale.sale_date else None
            })

        return {"medicos": result, "total": len(result)}

    # ── get_doctor_detail ─────────────────────────────────────────────────────
    elif tool_name == "get_doctor_detail":
        doctor_id = tool_input.get("doctor_id")
        doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
        if not doctor:
            return {"error": f"Médico {doctor_id} no encontrado"}

        # Last 6 visits
        recent_visits = db.query(Visit).filter(Visit.doctor_id == doctor_id
                                               ).order_by(Visit.scheduled_date.desc()).limit(10).all()

        # Sales last 6 months
        six_months_ago = now - timedelta(days=180)
        monthly_sales = db.query(
            extract('year', Sale.sale_date).label("year"),
            extract('month', Sale.sale_date).label("month"),
            func.sum(Sale.amount).label("total"),
            func.count(Sale.id).label("count")
        ).filter(
            Sale.doctor_id == doctor_id,
            Sale.sale_date >= six_months_ago
        ).group_by("year", "month").order_by("year", "month").all()

        total_lifetime = db.query(func.sum(Sale.amount)).filter(Sale.doctor_id == doctor_id).scalar() or 0

        return {
            "doctor_id": doctor.id,
            "nombre": doctor.name,
            "especialidad": doctor.specialty,
            "rut": doctor.rut,
            "direccion": doctor.address,
            "telefono": doctor.phone,
            "email": doctor.email,
            "visitador": doctor.rep.name if doctor.rep else None,
            "linea_negocio": doctor.business_line.name if doctor.business_line else None,
            "frecuencia_visita_dias": doctor.visit_frequency,
            "notas": doctor.notes,
            "ventas_historicas_total": round(float(total_lifetime), 2),
            "ventas_ultimos_6_meses": [
                {"mes": f"{int(r.month):02d}/{int(r.year)}", "monto": round(float(r.total or 0), 2), "registros": r.count}
                for r in monthly_sales
            ],
            "visitas_recientes": [
                {"fecha": v.scheduled_date.strftime("%d/%m/%Y") if v.scheduled_date else None,
                 "estado": v.status, "notas": v.notes}
                for v in recent_visits
            ]
        }

    # ── get_inactive_doctors ──────────────────────────────────────────────────
    elif tool_name == "get_inactive_doctors":
        days = tool_input.get("days_without_visit", 45)
        rep_id = tool_input.get("rep_id")
        cutoff = now - timedelta(days=days)

        q = db.query(Doctor).filter(Doctor.is_active == True)
        if rep_id:
            q = q.filter(Doctor.rep_id == rep_id)
        doctors = q.all()

        inactive = []
        for d in doctors:
            last_visit = db.query(Visit).filter(
                Visit.doctor_id == d.id, Visit.status == "completed"
            ).order_by(Visit.actual_date.desc()).first()

            last_date = last_visit.actual_date if last_visit and last_visit.actual_date else None
            if last_date is None or last_date < cutoff:
                days_since = (now - last_date).days if last_date else None
                inactive.append({
                    "doctor_id": d.id,
                    "nombre": d.name,
                    "especialidad": d.specialty,
                    "visitador": d.rep.name if d.rep else "Sin asignar",
                    "ultima_visita": last_date.strftime("%d/%m/%Y") if last_date else "Nunca visitado",
                    "dias_sin_visita": days_since
                })

        inactive.sort(key=lambda x: (x["dias_sin_visita"] is None, x["dias_sin_visita"] or 999), reverse=True)
        return {"medicos_inactivos": inactive, "total": len(inactive), "criterio_dias": days}

    # ── list_reps ─────────────────────────────────────────────────────────────
    elif tool_name == "list_reps":
        reps = db.query(MedicalRep).filter(MedicalRep.is_active == True).all()
        return {
            "visitadores": [
                {"rep_id": r.id, "nombre": r.name, "email": r.email,
                 "telefono": r.phone, "zona": r.zone, "territorio": r.territory}
                for r in reps
            ]
        }

    # ── assign_rep_to_doctor ──────────────────────────────────────────────────
    elif tool_name == "assign_rep_to_doctor":
        doctor_id = tool_input.get("doctor_id")
        rep_id = tool_input.get("rep_id")

        doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
        if not doctor:
            return {"error": f"Médico {doctor_id} no encontrado"}

        old_rep = doctor.rep.name if doctor.rep else "Sin asignar"

        if rep_id == 0:
            doctor.rep_id = None
            new_rep = "Sin asignar"
        else:
            rep = db.query(MedicalRep).filter(MedicalRep.id == rep_id).first()
            if not rep:
                return {"error": f"Visitador {rep_id} no encontrado"}
            doctor.rep_id = rep_id
            new_rep = rep.name

        db.commit()
        return {
            "success": True,
            "doctor": doctor.name,
            "visitador_anterior": old_rep,
            "visitador_nuevo": new_rep
        }

    # ── get_monthly_trend ─────────────────────────────────────────────────────
    elif tool_name == "get_monthly_trend":
        months_back = tool_input.get("months", 6)
        rep_id = tool_input.get("rep_id")
        business_line_name = tool_input.get("business_line_name")

        bl_id = None
        if business_line_name:
            bl = db.query(BusinessLine).filter(BusinessLine.name.ilike(f"%{business_line_name}%")).first()
            if bl:
                bl_id = bl.id

        result = []
        for i in range(months_back - 1, -1, -1):
            m = current_month - i
            y = current_year
            while m <= 0:
                m += 12
                y -= 1

            month_start = datetime(y, m, 1)
            month_end = datetime(y, m + 1, 1) if m < 12 else datetime(y + 1, 1, 1)

            sales_q = db.query(func.sum(Sale.amount), func.count(Sale.id)
                               ).join(Doctor, Doctor.id == Sale.doctor_id
                               ).filter(
                extract('month', Sale.sale_date) == m,
                extract('year', Sale.sale_date) == y
            )
            if rep_id:
                sales_q = sales_q.filter(Doctor.rep_id == rep_id)
            if bl_id:
                sales_q = sales_q.filter(Doctor.business_line_id == bl_id)

            monto, count = sales_q.first()

            visits_q = db.query(func.count(Visit.id)).filter(
                Visit.scheduled_date >= month_start,
                Visit.scheduled_date < month_end,
                Visit.status == "completed"
            )
            if rep_id:
                visits_q = visits_q.filter(Visit.rep_id == rep_id)
            visitas = visits_q.scalar()

            result.append({
                "mes": f"{m:02d}/{y}",
                "ventas_monto": round(float(monto or 0), 2),
                "ventas_registros": count or 0,
                "visitas_completadas": visitas
            })

        return {"tendencia": result, "meses_analizados": months_back}

    # ── export_to_excel ───────────────────────────────────────────────────────
    elif tool_name == "export_to_excel":
        data_type = tool_input.get("data_type")
        month = tool_input.get("month", current_month)
        year = tool_input.get("year", current_year)
        rep_id = tool_input.get("rep_id")

        wb = openpyxl.Workbook()
        ws = wb.active

        # Header style
        from openpyxl.styles import Font, PatternFill, Alignment
        header_font = Font(bold=True, color="FFFFFF")
        header_fill = PatternFill("solid", fgColor="7C3AED")
        header_align = Alignment(horizontal="center")

        def style_headers(ws, headers):
            for col_idx, header in enumerate(headers, 1):
                cell = ws.cell(row=1, column=col_idx, value=header)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = header_align

        rows_written = 0

        if data_type == "ranking_medicos":
            ws.title = "Ranking Médicos"
            data = execute_mike_tool("get_doctor_ranking", {"month": month, "year": year, "top": 50, **({"rep_id": rep_id} if rep_id else {})}, db)
            headers = ["Posición", "Médico", "Especialidad", "Monto Mes", "Registros", "Monto Mes Anterior", "Variación %"]
            style_headers(ws, headers)
            for row in data.get("ranking", []):
                ws.append([
                    row.get("posicion"), row.get("nombre"), row.get("especialidad"),
                    row.get("monto_mes"), row.get("registros"),
                    row.get("monto_mes_anterior"), row.get("variacion_pct")
                ])
                rows_written += 1

        elif data_type == "visitadores":
            ws.title = "Visitadores"
            data = execute_mike_tool("get_all_reps_summary", {"month": month, "year": year}, db)
            headers = ["Visitador", "Zona", "Territorio", "Médicos Asignados", "Visitas Programadas", "Visitas Completadas", "Tasa Cumplimiento %", "Ventas Monto"]
            style_headers(ws, headers)
            for row in data.get("visitadores", []):
                ws.append([
                    row.get("nombre"), row.get("zona"), row.get("territorio"),
                    row.get("medicos_asignados"), row.get("visitas_programadas"),
                    row.get("visitas_completadas"), row.get("tasa_cumplimiento"),
                    row.get("ventas_monto")
                ])
                rows_written += 1

        elif data_type == "nuevos_medicos":
            ws.title = "Médicos Nuevos"
            data = execute_mike_tool("get_new_doctors", {"month": month, "year": year}, db)
            headers = ["Médico", "Especialidad", "Visitador", "Primera Venta", "Ventas Mes"]
            style_headers(ws, headers)
            for row in data.get("medicos_nuevos", []):
                ws.append([
                    row.get("nombre"), row.get("especialidad"), row.get("visitador"),
                    row.get("primera_venta"), row.get("ventas_mes")
                ])
                rows_written += 1

        elif data_type == "tendencia_ventas":
            ws.title = "Tendencia Ventas"
            data = execute_mike_tool("get_monthly_trend", {"months": 12, **({"rep_id": rep_id} if rep_id else {})}, db)
            headers = ["Mes", "Ventas Monto", "Ventas Registros", "Visitas Completadas"]
            style_headers(ws, headers)
            for row in data.get("tendencia", []):
                ws.append([
                    row.get("mes"), row.get("ventas_monto"),
                    row.get("ventas_registros"), row.get("visitas_completadas")
                ])
                rows_written += 1

        elif data_type == "comisiones":
            ws.title = "Comisiones"
            data = execute_mike_tool("get_rep_commissions", {"month": month, "year": year, **({"rep_id": rep_id} if rep_id else {})}, db)
            headers = ["Visitador", "Zona", "Médicos Activos", "Médicos Nuevos", "Ventas Total"]
            style_headers(ws, headers)
            for row in data.get("comisiones", []):
                ws.append([
                    row.get("nombre"), row.get("zona"),
                    row.get("medicos_activos"), row.get("medicos_nuevos"),
                    row.get("ventas_total")
                ])
                rows_written += 1

        # Auto-size columns
        for col in ws.columns:
            max_len = 0
            col_letter = col[0].column_letter
            for cell in col:
                try:
                    if cell.value:
                        max_len = max(max_len, len(str(cell.value)))
                except Exception:
                    pass
            ws.column_dimensions[col_letter].width = min(max_len + 4, 40)

        # Save to BytesIO
        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)

        token = uuid.uuid4().hex[:8]
        filename = f"mike_export_{data_type}_{month:02d}{year}.xlsx"
        _export_store[token] = {"data": buffer.getvalue(), "filename": filename}

        return {
            "download_ready": True,
            "token": token,
            "filename": filename,
            "rows": rows_written
        }

    return {"error": f"Herramienta desconocida: {tool_name}"}


# ── Schemas ───────────────────────────────────────────────────────────────────

from pydantic import BaseModel


class MikeChatRequest(BaseModel):
    message: str
    conversation_history: Optional[List[AgentMessage]] = []


class MikeChatResponse(BaseModel):
    response: str
    conversation_history: List[AgentMessage]
    charts: List[dict] = []
    export_url: Optional[str] = None


# ── Export download endpoint ──────────────────────────────────────────────────

@router.get("/export/{token}")
def download_export(token: str):
    entry = _export_store.get(token)
    if not entry:
        raise HTTPException(status_code=404, detail="Export no encontrado o expirado")

    return StreamingResponse(
        io.BytesIO(entry["data"]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={entry['filename']}"}
    )


# ── Weekly report endpoint ────────────────────────────────────────────────────

@router.post("/weekly-report")
def weekly_report(db: Session = Depends(get_db)):
    now = datetime.utcnow()
    month = now.month
    year = now.year

    # Gather data
    overview = execute_mike_tool("get_dashboard_overview", {}, db)
    reps_summary = execute_mike_tool("get_all_reps_summary", {"month": month, "year": year}, db)
    ranking = execute_mike_tool("get_doctor_ranking", {"month": month, "year": year, "top": 10}, db)

    lines = []
    lines.append(f"REPORTE SEMANAL NARMA — {now.strftime('%d/%m/%Y %H:%M')}")
    lines.append("=" * 60)
    lines.append("")
    lines.append("RESUMEN GENERAL")
    lines.append(f"  Médicos activos: {overview.get('medicos_activos', 0)}")
    lines.append(f"  Visitadores activos: {overview.get('visitadores_activos', 0)}")
    vm = overview.get("visitas_mes", {})
    lines.append(f"  Visitas del mes: {vm.get('completadas', 0)}/{vm.get('programadas', 0)} ({vm.get('tasa_cumplimiento', 0)}%)")
    vn = overview.get("ventas_mes", {})
    lines.append(f"  Ventas del mes: ${vn.get('total_monto', 0):,.2f} ({vn.get('total_registros', 0)} registros)")
    lines.append("")

    lines.append("DESEMPEÑO VISITADORES")
    for rep in reps_summary.get("visitadores", []):
        lines.append(f"  {rep['nombre']}: ${rep['ventas_monto']:,.2f} — {rep['tasa_cumplimiento']}% cumplimiento")
    lines.append("")

    lines.append("TOP 10 MÉDICOS POR VENTAS")
    for doc in ranking.get("ranking", []):
        lines.append(f"  {doc['posicion']}. {doc['nombre']} ({doc['especialidad']}): ${doc['monto_mes']:,.2f}")
    lines.append("")

    report_text = "\n".join(lines)

    # Send via SMTP
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    report_email = os.getenv("REPORT_EMAIL")

    sent = False
    if smtp_user and smtp_password and report_email:
        try:
            msg = MIMEMultipart()
            msg["From"] = smtp_user
            msg["To"] = report_email
            msg["Subject"] = f"Reporte Semanal Narma — {now.strftime('%d/%m/%Y')}"
            msg.attach(MIMEText(report_text, "plain", "utf-8"))

            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.ehlo()
                server.starttls()
                server.login(smtp_user, smtp_password)
                server.sendmail(smtp_user, report_email, msg.as_string())
            sent = True
        except Exception as e:
            pass

    return {"sent": sent, "report": report_text}


# ── Chat endpoint ─────────────────────────────────────────────────────────────

@router.post("/chat", response_model=MikeChatResponse)
def mike_chat(request: MikeChatRequest, db: Session = Depends(get_db)):
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY no configurada")

    client = anthropic.Anthropic(api_key=api_key)

    messages = []
    for msg in request.conversation_history:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": request.message})

    system = MIKE_SYSTEM_PROMPT.format(current_date=datetime.utcnow().strftime("%d/%m/%Y %H:%M"))

    final_response = ""
    max_iterations = 8
    iteration = 0

    # Track tool calls and results for chart building
    tool_calls_results: list[dict] = []
    export_url: Optional[str] = None

    while iteration < max_iterations:
        iteration += 1
        response = client.messages.create(
            model="claude-sonnet-4-5-20241022",
            max_tokens=4096,
            system=system,
            tools=MIKE_TOOLS,
            messages=messages
        )

        if response.stop_reason == "end_turn":
            for block in response.content:
                if hasattr(block, "text"):
                    final_response = block.text
            break

        elif response.stop_reason == "tool_use":
            tool_results = []
            assistant_content = response.content

            for block in response.content:
                if block.type == "tool_use":
                    tool_result = execute_mike_tool(block.name, block.input, db)

                    # Track tool calls for chart building
                    tool_calls_results.append({"name": block.name, "input": block.input, "result": tool_result})

                    # Check for export
                    if block.name == "export_to_excel" and tool_result.get("download_ready"):
                        token = tool_result.get("token")
                        export_url = f"/api/mike/export/{token}"

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(tool_result, ensure_ascii=False, default=str)
                    })

            messages.append({
                "role": "assistant",
                "content": [
                    {"type": b.type, **({
                        "text": b.text
                    } if b.type == "text" else {
                        "id": b.id,
                        "name": b.name,
                        "input": b.input
                    })}
                    for b in assistant_content
                ]
            })
            messages.append({"role": "user", "content": tool_results})
        else:
            final_response = "Ocurrió un error inesperado."
            break

    if not final_response:
        final_response = "No pude procesar tu solicitud."

    # Build charts from tool results
    charts = []
    for tc in tool_calls_results:
        name = tc["name"]
        result = tc["result"]

        if name == "get_monthly_trend" and "tendencia" in result:
            charts.append({
                "type": "line",
                "title": "Tendencia mensual",
                "data": result["tendencia"],
                "xKey": "mes",
                "yKey": "ventas_monto",
                "yKey2": "visitas_completadas"
            })

        elif name == "get_doctor_ranking" and "ranking" in result:
            charts.append({
                "type": "bar",
                "title": "Ranking médicos",
                "data": result["ranking"][:15],
                "xKey": "nombre",
                "yKey": "unidades"
            })

        elif name == "get_all_reps_summary" and "visitadores" in result:
            charts.append({
                "type": "bar",
                "title": "Desempeño visitadores",
                "data": result["visitadores"],
                "xKey": "nombre",
                "yKey": "tasa_cumplimiento"
            })

        elif name == "get_visits_tracking" and "tracking" in result:
            charts.append({
                "type": "bar",
                "title": "Cumplimiento visitas",
                "data": result["tracking"],
                "xKey": "rep_name",
                "yKey": "completion_rate"
            })

        elif name == "get_rep_commissions" and "comisiones" in result:
            charts.append({
                "type": "bar",
                "title": "Comisiones por visitador",
                "data": result["comisiones"],
                "xKey": "nombre",
                "yKey": "total_ventas"
            })

    updated_history = list(request.conversation_history)
    updated_history.append(AgentMessage(role="user", content=request.message))
    updated_history.append(AgentMessage(role="assistant", content=final_response))

    return MikeChatResponse(
        response=final_response,
        conversation_history=updated_history,
        charts=charts,
        export_url=export_url
    )
