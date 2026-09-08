from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Any
import os
import json
import anthropic
from ..database import get_db
from ..models import Visit, Doctor, MedicalRep, KnowledgeEntry, ImageFile, AgentMemory, AgentConversationMessage
from ..schemas import AgentChatRequest, AgentChatResponse, AgentMessage

router = APIRouter(prefix="/api/agent", tags=["agent"])

SYSTEM_PROMPT = """Eres un asistente de IA para visitadores médicos farmacéuticos del laboratorio Narma. Tu rol es ayudar a los visitadores médicos a:
- Gestionar su agenda de visitas
- Consultar información de sus médicos asignados
- Registrar visitas realizadas
- Responder preguntas sobre productos, protocolos y procedimientos del laboratorio

REGLA OBLIGATORIA: Ante CUALQUIER pregunta sobre productos, activos, materias primas, categorías, protocolos, procedimientos, precios, disponibilidad o cualquier tema del laboratorio Narma, debes llamar PRIMERO a search_knowledge antes de responder. Si el primer resultado no tiene lo que necesitas, intenta con una búsqueda más general o sin parámetros. NUNCA respondas desde tu conocimiento general sobre estos temas sin antes consultar la base de conocimiento.

COMPARTIR DOCUMENTOS: Cuando un resultado de search_knowledge incluya "download_url", comparte ese link con el visitador así: "[nombre del archivo](download_url)". Usa formato Markdown.

COMPARTIR IMÁGENES Y QR: Cuando el visitador pida un QR, imagen de producto o material visual, usa search_images para buscarlo. Si el resultado incluye "url" o "share_link", muestra el link directamente así: "[nombre](url)". Si la imagen es un QR, indícale al visitador que puede escanearlo desde ese link.

MEMORIA: Tienes memoria persistente sobre este visitador (se te inyecta más abajo, si existe). Usa save_to_memory cuando el visitador te cuente algo que valga la pena recordar en futuras conversaciones: preferencias de trabajo, acuerdos, contexto de médicos, pendientes o alertas. No preguntes permiso para guardar, solo hazlo cuando sea relevante. Usa get_memories si necesitas revisar algo que no esté ya en el contexto inyectado, y delete_memory si el visitador te dice que algo ya no aplica o está desactualizado.

Siempre responde en español. Sé profesional, preciso y conciso."""

TOOLS = [
    {
        "name": "get_my_visits",
        "description": "Obtiene las visitas del visitador médico. Puede filtrar por período: today (hoy), week (esta semana), upcoming (próximas), o all (todas).",
        "input_schema": {
            "type": "object",
            "properties": {
                "period": {
                    "type": "string",
                    "enum": ["today", "week", "upcoming", "all"],
                    "description": "Período de tiempo para filtrar visitas"
                }
            },
            "required": ["period"]
        }
    },
    {
        "name": "get_my_doctors",
        "description": "Obtiene la lista de médicos asignados al visitador.",
        "input_schema": {
            "type": "object",
            "properties": {
                "search": {
                    "type": "string",
                    "description": "Búsqueda opcional por nombre del médico"
                }
            }
        }
    },
    {
        "name": "schedule_visit",
        "description": "Programa una nueva visita a un médico.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctor_id": {
                    "type": "integer",
                    "description": "ID del médico a visitar"
                },
                "scheduled_date": {
                    "type": "string",
                    "description": "Fecha y hora de la visita en formato ISO 8601 (YYYY-MM-DDTHH:MM:SS)"
                },
                "notes": {
                    "type": "string",
                    "description": "Notas adicionales para la visita"
                }
            },
            "required": ["doctor_id", "scheduled_date"]
        }
    },
    {
        "name": "complete_visit",
        "description": "Marca una visita como completada y agrega notas.",
        "input_schema": {
            "type": "object",
            "properties": {
                "visit_id": {
                    "type": "integer",
                    "description": "ID de la visita a completar"
                },
                "notes": {
                    "type": "string",
                    "description": "Notas sobre la visita realizada"
                }
            },
            "required": ["visit_id"]
        }
    },
    {
        "name": "get_doctor_info",
        "description": "Obtiene información detallada de un médico específico.",
        "input_schema": {
            "type": "object",
            "properties": {
                "doctor_id": {
                    "type": "integer",
                    "description": "ID del médico"
                }
            },
            "required": ["doctor_id"]
        }
    },
    {
        "name": "search_images",
        "description": "Busca imágenes y códigos QR del laboratorio Narma almacenados en el sistema. Úsala cuando el visitador pida un QR, imagen de producto, material de apoyo visual o cualquier archivo de imagen. Devuelve el link directo para compartir.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Nombre o descripción de la imagen o QR que se busca"
                },
                "category": {
                    "type": "string",
                    "enum": ["qr", "product", "general"],
                    "description": "Categoría opcional: qr (códigos QR), product (imágenes de producto), general"
                }
            }
        }
    },
    {
        "name": "search_knowledge",
        "description": "Busca en la base de conocimiento del laboratorio Narma. Úsala para responder preguntas sobre productos, indicaciones, protocolos, preguntas frecuentes o cualquier información específica del laboratorio.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Término de búsqueda (nombre de producto, tema, palabra clave)"
                },
                "category": {
                    "type": "string",
                    "enum": ["productos", "protocolos", "faq", "general", "archivo"],
                    "description": "Categoría opcional para filtrar la búsqueda"
                }
            }
        }
    },
    {
        "name": "save_to_memory",
        "description": "Guarda un hecho, preferencia o pendiente importante en tu memoria persistente sobre este visitador. Úsala para recordar acuerdos, contexto de médicos, preferencias de trabajo o cualquier dato que sea útil recordar en futuras conversaciones con él.",
        "input_schema": {
            "type": "object",
            "properties": {
                "content": {"type": "string", "description": "El hecho o dato a recordar (ej: 'Prefiere que le recuerde las visitas del Dr. Soto los lunes')"},
                "category": {
                    "type": "string",
                    "enum": ["general", "medico", "preferencia", "pendiente", "alerta"],
                    "description": "Categoría del recuerdo"
                }
            },
            "required": ["content"]
        }
    },
    {
        "name": "get_memories",
        "description": "Recupera lo que tienes guardado en tu memoria persistente sobre este visitador. Úsala cuando necesites recordar contexto de conversaciones anteriores.",
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {"type": "string", "description": "Filtrar por categoría (opcional)"}
            }
        }
    },
    {
        "name": "delete_memory",
        "description": "Elimina un recuerdo obsoleto o incorrecto de tu memoria sobre este visitador.",
        "input_schema": {
            "type": "object",
            "properties": {
                "memory_id": {"type": "integer", "description": "ID del recuerdo a eliminar"}
            },
            "required": ["memory_id"]
        }
    }
]


def execute_tool(tool_name: str, tool_input: dict, rep_id: int, db: Session) -> Any:
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    if tool_name == "get_my_visits":
        period = tool_input.get("period", "today")
        query = db.query(Visit).filter(Visit.rep_id == rep_id)

        if period == "today":
            query = query.filter(
                Visit.scheduled_date >= today_start,
                Visit.scheduled_date < today_end
            )
        elif period == "week":
            week_end = today_start + timedelta(days=7)
            query = query.filter(
                Visit.scheduled_date >= today_start,
                Visit.scheduled_date < week_end
            )
        elif period == "upcoming":
            query = query.filter(
                Visit.scheduled_date >= today_start,
                Visit.status == "scheduled"
            ).limit(20)

        visits = query.order_by(Visit.scheduled_date.asc()).limit(50).all()
        result = []
        for v in visits:
            result.append({
                "visit_id": v.id,
                "doctor_name": v.doctor.name if v.doctor else "N/A",
                "doctor_specialty": v.doctor.specialty if v.doctor else None,
                "scheduled_date": v.scheduled_date.isoformat() if v.scheduled_date else None,
                "status": v.status,
                "notes": v.notes
            })
        return {"visits": result, "total": len(result)}

    elif tool_name == "get_my_doctors":
        search = tool_input.get("search", "")
        query = db.query(Doctor).filter(Doctor.rep_id == rep_id, Doctor.is_active == True)
        if search:
            query = query.filter(Doctor.name.ilike(f"%{search}%"))
        doctors = query.all()
        result = []
        for d in doctors:
            result.append({
                "doctor_id": d.id,
                "name": d.name,
                "specialty": d.specialty,
                "phone": d.phone,
                "address": d.address,
                "visit_frequency": d.visit_frequency,
                "prescribes_products": d.prescribes_products,
                "business_line": d.business_line.name if d.business_line else None
            })
        return {"doctors": result, "total": len(result)}

    elif tool_name == "schedule_visit":
        doctor_id = tool_input.get("doctor_id")
        scheduled_date_str = tool_input.get("scheduled_date")
        notes = tool_input.get("notes", "")

        doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
        if not doctor:
            return {"error": f"Médico con ID {doctor_id} no encontrado"}

        try:
            scheduled_date = datetime.fromisoformat(scheduled_date_str)
        except ValueError:
            return {"error": f"Formato de fecha inválido: {scheduled_date_str}"}

        visit = Visit(
            doctor_id=doctor_id,
            rep_id=rep_id,
            scheduled_date=scheduled_date,
            status="scheduled",
            notes=notes
        )
        db.add(visit)
        db.commit()
        db.refresh(visit)
        return {
            "success": True,
            "visit_id": visit.id,
            "message": f"Visita programada con {doctor.name} para {scheduled_date.strftime('%d/%m/%Y %H:%M')}"
        }

    elif tool_name == "complete_visit":
        visit_id = tool_input.get("visit_id")
        notes = tool_input.get("notes", "")

        visit = db.query(Visit).filter(Visit.id == visit_id, Visit.rep_id == rep_id).first()
        if not visit:
            return {"error": f"Visita con ID {visit_id} no encontrada"}

        visit.status = "completed"
        visit.actual_date = datetime.utcnow()
        if notes:
            visit.notes = notes
        db.commit()
        return {
            "success": True,
            "message": f"Visita marcada como completada",
            "visit_id": visit_id,
            "doctor_name": visit.doctor.name if visit.doctor else "N/A"
        }

    elif tool_name == "get_doctor_info":
        doctor_id = tool_input.get("doctor_id")
        doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
        if not doctor:
            return {"error": f"Médico con ID {doctor_id} no encontrado"}

        last_visit = db.query(Visit).filter(
            Visit.doctor_id == doctor_id,
            Visit.status == "completed"
        ).order_by(Visit.actual_date.desc()).first()

        next_visit = db.query(Visit).filter(
            Visit.doctor_id == doctor_id,
            Visit.status == "scheduled",
            Visit.scheduled_date >= datetime.utcnow()
        ).order_by(Visit.scheduled_date.asc()).first()

        return {
            "doctor_id": doctor.id,
            "name": doctor.name,
            "specialty": doctor.specialty,
            "address": doctor.address,
            "phone": doctor.phone,
            "email": doctor.email,
            "business_line": doctor.business_line.name if doctor.business_line else None,
            "prescribes_products": doctor.prescribes_products,
            "visit_frequency_days": doctor.visit_frequency,
            "notes": doctor.notes,
            "last_visit": last_visit.actual_date.isoformat() if last_visit and last_visit.actual_date else None,
            "next_visit": next_visit.scheduled_date.isoformat() if next_visit else None
        }

    elif tool_name == "search_images":
        query = tool_input.get("query", "").strip()
        category = tool_input.get("category")

        base_url = (os.getenv("RAILWAY_PUBLIC_DOMAIN") or "").strip()
        if base_url:
            base_url = f"https://{base_url}"
        else:
            base_url = os.getenv("BASE_URL", "").strip()

        q = db.query(ImageFile)
        if category:
            q = q.filter(ImageFile.category == category)
        if query:
            q = q.filter(
                ImageFile.name.ilike(f"%{query}%") |
                ImageFile.description.ilike(f"%{query}%")
            )
        images = q.order_by(ImageFile.created_at.desc()).limit(10).all()

        # Fallback: si no hay match, devolver todas
        if not images and query:
            q2 = db.query(ImageFile)
            if category:
                q2 = q2.filter(ImageFile.category == category)
            images = q2.order_by(ImageFile.created_at.desc()).limit(10).all()

        if not images:
            return {"results": [], "message": "No hay imágenes o QR cargados en el sistema."}

        results = []
        for img in images:
            item = {
                "id": img.id,
                "name": img.name,
                "description": img.description or "",
                "category": img.category,
                "business_line": img.business_line.name if img.business_line else None,
            }
            if base_url:
                item["url"] = f"{base_url}/api/images/{img.id}/file"
                item["share_link"] = f"{base_url}/api/images/{img.id}/file"
            results.append(item)

        return {"results": results, "total": len(results)}

    elif tool_name == "search_knowledge":
        query = tool_input.get("query", "").strip()
        category = tool_input.get("category")

        base_q = db.query(KnowledgeEntry).filter(KnowledgeEntry.is_active == True)
        if category:
            base_q = base_q.filter(KnowledgeEntry.category == category)

        # Try specific query first (title or content ilike match)
        if query:
            q_specific = base_q.filter(
                KnowledgeEntry.title.ilike(f"%{query}%") |
                KnowledgeEntry.content.ilike(f"%{query}%")
            )
            entries = q_specific.order_by(KnowledgeEntry.created_at.desc()).limit(5).all()

            # Fallback: if no match found, return all active entries anyway
            # (the agent can still reason over them even if the term isn't literally present)
            if not entries:
                entries = base_q.order_by(KnowledgeEntry.created_at.desc()).limit(3).all()
        else:
            entries = base_q.order_by(KnowledgeEntry.created_at.desc()).limit(5).all()

        if not entries:
            return {"results": [], "message": "No hay entradas en la base de conocimiento. El administrador debe cargar información primero."}

        base_url = (os.getenv("RAILWAY_PUBLIC_DOMAIN") or "").strip()
        if base_url:
            base_url = f"https://{base_url}"
        else:
            base_url = os.getenv("BASE_URL", "").strip()

        results = []
        for e in entries:
            content = e.content
            # Smart filtering: if query is provided and content is large,
            # extract matching lines + header so the relevant rows surface first
            if query and len(content) > 3000:
                lines = content.splitlines()
                header_lines = lines[:5]  # column descriptions / header
                matching = [l for l in lines if query.lower() in l.lower()]
                if matching:
                    # Return header + up to 200 matching rows
                    content = "\n".join(header_lines) + "\n" + "\n".join(matching[:200])
                else:
                    # Term not found in individual lines; return full content up to 15000 chars
                    content = content[:15000]
            elif len(content) > 15000:
                content = content[:15000]

            result_item = {
                "title": e.title,
                "category": e.category,
                "content": content,
                "business_line": e.business_line.name if e.business_line else None,
            }
            if e.file_data:
                result_item["has_file"] = True
                result_item["original_filename"] = e.original_filename or f"documento_{e.id}"
                if base_url:
                    result_item["download_url"] = f"{base_url}/api/knowledge/{e.id}/file"
            results.append(result_item)

        return {"results": results, "total": len(results)}

    elif tool_name == "save_to_memory":
        content_txt = tool_input.get("content", "").strip()
        category = tool_input.get("category", "general")
        if not content_txt:
            return {"error": "El contenido no puede estar vacío"}
        mem = AgentMemory(rep_id=rep_id, content=content_txt, category=category)
        db.add(mem)
        db.commit()
        db.refresh(mem)
        return {"success": True, "memory_id": mem.id, "content": mem.content, "category": mem.category}

    elif tool_name == "get_memories":
        category = tool_input.get("category")
        q = db.query(AgentMemory).filter(AgentMemory.rep_id == rep_id)
        if category:
            q = q.filter(AgentMemory.category == category)
        mems = q.order_by(AgentMemory.created_at.desc()).all()
        return {
            "total": len(mems),
            "memories": [
                {"id": m.id, "content": m.content, "category": m.category,
                 "fecha": m.created_at.strftime("%d/%m/%Y") if m.created_at else ""}
                for m in mems
            ]
        }

    elif tool_name == "delete_memory":
        memory_id = tool_input.get("memory_id")
        mem = db.query(AgentMemory).filter(AgentMemory.id == memory_id, AgentMemory.rep_id == rep_id).first()
        if not mem:
            return {"error": f"Recuerdo {memory_id} no encontrado"}
        db.delete(mem)
        db.commit()
        return {"success": True}

    return {"error": f"Herramienta desconocida: {tool_name}"}


@router.post("/chat", response_model=AgentChatResponse)
def chat(request: AgentChatRequest, db: Session = Depends(get_db)):
    api_key = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY no configurada")

    rep = db.query(MedicalRep).filter(MedicalRep.id == request.rep_id).first()
    if not rep:
        raise HTTPException(status_code=404, detail="Visitador no encontrado")

    client = anthropic.Anthropic(api_key=api_key)

    history_source = request.conversation_history
    if not history_source:
        # Si el frontend no mandó historial (ej. primera carga tras recargar la
        # página), se recupera de lo que quedó guardado en el servidor para
        # este visitador, así la conversación no se pierde.
        persisted = db.query(AgentConversationMessage).filter(
            AgentConversationMessage.rep_id == request.rep_id
        ).order_by(AgentConversationMessage.id.desc()).limit(40).all()
        history_source = [
            AgentMessage(role=m.role, content=m.content) for m in reversed(persisted)
        ]

    messages = []
    for msg in history_source:
        messages.append({"role": msg.role, "content": msg.content})

    messages.append({"role": "user", "content": request.message})

    # Memoria persistente sobre este visitador, inyectada en el system prompt
    memories = db.query(AgentMemory).filter(
        AgentMemory.rep_id == request.rep_id
    ).order_by(AgentMemory.created_at.desc()).limit(30).all()
    memory_block = ""
    if memories:
        lines = [f"[{m.id}|{m.category}] {m.content}" for m in reversed(memories)]
        memory_block = "\n\n## Memoria persistente sobre este visitador (de conversaciones anteriores)\n" + "\n".join(lines)

    system_with_context = (
        f"{SYSTEM_PROMPT}\n\nContexto actual:\n- Visitador: {rep.name}\n- ID: {rep.id}\n"
        f"- Fecha actual: {datetime.utcnow().strftime('%d/%m/%Y %H:%M')}"
        + memory_block
    )

    # Tool-calling loop
    final_response = ""
    max_iterations = 5
    iteration = 0

    while iteration < max_iterations:
        iteration += 1
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=system_with_context,
            tools=TOOLS,
            messages=messages
        )

        # Check stop reason
        if response.stop_reason == "end_turn":
            # Extract text response
            for block in response.content:
                if hasattr(block, "text"):
                    final_response = block.text
            break

        elif response.stop_reason == "tool_use":
            # Process tool calls
            tool_results = []
            assistant_content = response.content

            for block in response.content:
                if block.type == "tool_use":
                    tool_result = execute_tool(block.name, block.input, request.rep_id, db)
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(tool_result, ensure_ascii=False, default=str)
                    })

            # Add assistant message with tool use
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

            # Add tool results
            messages.append({
                "role": "user",
                "content": tool_results
            })
        else:
            # Unexpected stop reason
            final_response = "Lo siento, ocurrió un error inesperado."
            break

    if not final_response:
        final_response = "Lo siento, no pude procesar tu solicitud."

    # Guardar la conversación en el servidor para que persista entre sesiones
    # y dispositivos (no depende del navegador/localStorage).
    db.add(AgentConversationMessage(rep_id=request.rep_id, role="user", content=request.message))
    db.add(AgentConversationMessage(rep_id=request.rep_id, role="assistant", content=final_response))
    db.commit()

    # Build updated conversation history
    updated_history = list(history_source)
    updated_history.append(AgentMessage(role="user", content=request.message))
    updated_history.append(AgentMessage(role="assistant", content=final_response))

    return AgentChatResponse(
        response=final_response,
        conversation_history=updated_history
    )


@router.get("/history/{rep_id}")
def get_agent_history(rep_id: int, limit: int = 100, db: Session = Depends(get_db)):
    """Recupera la conversación guardada entre un visitador y su Agente IA."""
    msgs = db.query(AgentConversationMessage).filter(
        AgentConversationMessage.rep_id == rep_id
    ).order_by(AgentConversationMessage.id.desc()).limit(limit).all()
    return {
        "rep_id": rep_id,
        "messages": [
            {"role": m.role, "content": m.content, "created_at": m.created_at.isoformat() if m.created_at else None}
            for m in reversed(msgs)
        ]
    }


@router.delete("/history/{rep_id}")
def clear_agent_history(rep_id: int, db: Session = Depends(get_db)):
    """Borra la conversación guardada de un visitador con su Agente IA (no borra la memoria persistente)."""
    count = db.query(AgentConversationMessage).filter(
        AgentConversationMessage.rep_id == rep_id
    ).delete(synchronize_session=False)
    db.commit()
    return {"deleted": count}


@router.get("/memory/{rep_id}")
def get_agent_memory(rep_id: int, db: Session = Depends(get_db)):
    """Lista lo que el Agente IA tiene guardado en su memoria persistente sobre un visitador."""
    mems = db.query(AgentMemory).filter(AgentMemory.rep_id == rep_id).order_by(AgentMemory.created_at.desc()).all()
    return [
        {"id": m.id, "content": m.content, "category": m.category,
         "created_at": m.created_at.isoformat() if m.created_at else None}
        for m in mems
    ]


@router.delete("/memory/{memory_id}")
def delete_agent_memory(memory_id: int, db: Session = Depends(get_db)):
    mem = db.query(AgentMemory).filter(AgentMemory.id == memory_id).first()
    if not mem:
        raise HTTPException(status_code=404, detail="Recuerdo no encontrado")
    db.delete(mem)
    db.commit()
    return {"ok": True}
