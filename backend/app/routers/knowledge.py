from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import io
from ..database import get_db
from ..models import KnowledgeEntry, BusinessLine

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

CATEGORIES = [
    {"value": "productos", "label": "Productos"},
    {"value": "protocolos", "label": "Protocolos"},
    {"value": "faq", "label": "Preguntas Frecuentes"},
    {"value": "general", "label": "General"},
    {"value": "archivo", "label": "Archivo"},
]


def _entry_out(e: KnowledgeEntry) -> dict:
    return {
        "id": e.id,
        "title": e.title,
        "category": e.category,
        "content": e.content,
        "business_line_id": e.business_line_id,
        "business_line_name": e.business_line.name if e.business_line else None,
        "is_active": e.is_active,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


def _df_to_readable(df, label: str = "") -> str:
    """Convert a DataFrame to a structured, AI-readable text format."""
    import pandas as pd

    # Clean up column names
    df.columns = [str(c).strip() for c in df.columns]

    # Drop fully empty columns and rows
    df = df.dropna(how="all", axis=1).dropna(how="all", axis=0)
    df = df.fillna("")

    if df.empty:
        return f"[Sin datos: {label}]"

    lines = []
    columns = list(df.columns)

    # Header describing the columns
    lines.append(f"Columnas disponibles: {', '.join(columns)}")
    lines.append(f"Total de registros: {len(df)}\n")

    # Each row as labeled key-value pairs
    for i, row in df.iterrows():
        row_parts = []
        for col in columns:
            val = str(row[col]).strip()
            if val and val != "nan":
                row_parts.append(f"{col}: {val}")
        if row_parts:
            lines.append(f"[Registro {i + 1}] " + " | ".join(row_parts))

        # Limit to 300 records to avoid huge content
        if i >= 299:
            lines.append(f"... ({len(df) - 300} registros adicionales omitidos)")
            break

    return "\n".join(lines)


def _extract_text(filename: str, data: bytes) -> str:
    """Extract text content from uploaded file."""
    name_lower = filename.lower()

    # Plain text formats
    if any(name_lower.endswith(ext) for ext in [".txt", ".md", ".json"]):
        try:
            return data.decode("utf-8", errors="replace")
        except Exception:
            return data.decode("latin-1", errors="replace")

    # CSV
    if name_lower.endswith(".csv"):
        try:
            import pandas as pd
            df = pd.read_csv(io.BytesIO(data), nrows=500)
            return _df_to_readable(df, filename)
        except Exception as e:
            return f"[Error leyendo CSV: {e}]"

    # Excel
    if any(name_lower.endswith(ext) for ext in [".xlsx", ".xls"]):
        try:
            import pandas as pd
            sheets = pd.read_excel(io.BytesIO(data), sheet_name=None)
            parts = []
            for sheet_name, df in sheets.items():
                if df.empty:
                    continue
                parts.append(f"=== Hoja: {sheet_name} ===\n")
                parts.append(_df_to_readable(df, sheet_name))
            return "\n\n".join(parts) if parts else f"[Excel vacío: {filename}]"
        except Exception as e:
            return f"[Error leyendo Excel: {e}]"

    # PDF — basic text extraction without extra deps
    if name_lower.endswith(".pdf"):
        try:
            text = data.decode("latin-1", errors="replace")
            # Extract readable strings from PDF binary
            import re
            strings = re.findall(r'[A-Za-záéíóúüñÁÉÍÓÚÜÑ0-9\s\.,\-:;/\\()\[\]!?@#$%&*+=\'\"]{4,}', text)
            clean = " ".join(s.strip() for s in strings if len(s.strip()) > 3)
            return clean[:10000] if clean else f"[Archivo PDF: {filename}]"
        except Exception:
            return f"[Archivo PDF: {filename}]"

    # DOCX — basic extraction without python-docx
    if name_lower.endswith(".docx"):
        try:
            import zipfile, re
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                with z.open("word/document.xml") as f:
                    xml = f.read().decode("utf-8", errors="replace")
            text = re.sub(r"<[^>]+>", " ", xml)
            text = re.sub(r"\s+", " ", text).strip()
            return text[:10000] if text else f"[Archivo Word: {filename}]"
        except Exception:
            return f"[Archivo Word: {filename}]"

    return f"[Archivo adjunto: {filename}]"


# ── GET /api/knowledge ────────────────────────────────────────────────────────
@router.get("")
def get_entries(category: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(KnowledgeEntry).filter(KnowledgeEntry.is_active == True)
    if category:
        q = q.filter(KnowledgeEntry.category == category)
    entries = q.order_by(KnowledgeEntry.created_at.desc()).all()
    return [_entry_out(e) for e in entries]


# ── GET /api/knowledge/categories ─────────────────────────────────────────────
@router.get("/categories")
def get_categories():
    return CATEGORIES


# ── POST /api/knowledge ────────────────────────────────────────────────────────
@router.post("")
def create_entry(data: dict, db: Session = Depends(get_db)):
    entry = KnowledgeEntry(
        title=data.get("title", "Sin título"),
        category=data.get("category", "general"),
        content=data.get("content", ""),
        business_line_id=data.get("business_line_id"),
        is_active=data.get("is_active", True),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _entry_out(entry)


# ── PUT /api/knowledge/{id} ───────────────────────────────────────────────────
@router.put("/{entry_id}")
def update_entry(entry_id: int, data: dict, db: Session = Depends(get_db)):
    entry = db.query(KnowledgeEntry).filter(KnowledgeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entrada no encontrada")
    for key in ["title", "category", "content", "business_line_id", "is_active"]:
        if key in data:
            setattr(entry, key, data[key])
    db.commit()
    db.refresh(entry)
    return _entry_out(entry)


# ── DELETE /api/knowledge/{id} ────────────────────────────────────────────────
@router.delete("/{entry_id}")
def delete_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = db.query(KnowledgeEntry).filter(KnowledgeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entrada no encontrada")
    db.delete(entry)
    db.commit()
    return {"ok": True}


# ── POST /api/knowledge/upload (single file) ──────────────────────────────────
@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    category: str = Form("archivo"),
    business_line_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    data = await file.read()
    content = _extract_text(file.filename or "archivo", data)
    title = (file.filename or "archivo").rsplit(".", 1)[0].replace("_", " ").replace("-", " ").title()
    bl_id = int(business_line_id) if business_line_id and business_line_id.isdigit() else None

    entry = KnowledgeEntry(
        title=title,
        category=category,
        content=content,
        business_line_id=bl_id,
        is_active=True,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"ok": True, "entry": _entry_out(entry), "chars": len(content)}


# ── POST /api/knowledge/upload-multiple ───────────────────────────────────────
@router.post("/upload-multiple")
async def upload_multiple(
    files: List[UploadFile] = File(...),
    category: str = Form("archivo"),
    business_line_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    bl_id = int(business_line_id) if business_line_id and business_line_id.isdigit() else None
    results = []
    for file in files:
        data = await file.read()
        content = _extract_text(file.filename or "archivo", data)
        title = (file.filename or "archivo").rsplit(".", 1)[0].replace("_", " ").replace("-", " ").title()
        entry = KnowledgeEntry(
            title=title,
            category=category,
            content=content,
            business_line_id=bl_id,
            is_active=True,
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
        results.append({"filename": file.filename, "entry_id": entry.id, "chars": len(content)})
    return {"ok": True, "uploaded": len(results), "results": results}
