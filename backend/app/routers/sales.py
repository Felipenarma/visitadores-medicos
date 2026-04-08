from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import pandas as pd
import re
import io
from datetime import datetime
from ..database import get_db
from ..models import Sale, SalesUpload, Doctor, Visit
from ..schemas import SaleOut, SalesSummaryItem

router = APIRouter(prefix="/api/sales", tags=["sales"])


def _norm_rut(r):
    """Normaliza RUT eliminando puntos, guiones y espacios."""
    if not r:
        return None
    return re.sub(r'[\.\-\s]', '', str(r)).upper().strip()


def match_doctor(name: str, db: Session) -> Optional[Doctor]:
    """Try to match a doctor by name (fuzzy)."""
    if not name:
        return None
    name = name.strip().lower()
    doctors = db.query(Doctor).filter(Doctor.is_active == True).all()
    for doc in doctors:
        if doc.name.lower() == name:
            return doc
    # partial match
    for doc in doctors:
        if name in doc.name.lower() or doc.name.lower() in name:
            return doc
    return None


@router.get("/", response_model=List[SaleOut])
def get_sales(db: Session = Depends(get_db)):
    sales = db.query(Sale).order_by(Sale.created_at.desc()).limit(500).all()
    result = []
    for sale in sales:
        out = SaleOut.model_validate(sale)
        if sale.doctor:
            out.doctor_name = sale.doctor.name
        result.append(out)
    return result


@router.post("/upload")
async def upload_sales(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No se proporcionó archivo")

    content = await file.read()
    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif file.filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Formato no soportado. Use CSV o Excel.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al leer archivo: {str(e)}")

    # Normalize column names
    df.columns = [c.lower().strip().replace(" ", "_") for c in df.columns]

    required_cols = ["nombre_medico", "producto", "monto", "fecha_venta"]
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        # Try alternative column names
        col_map = {
            "doctor": "nombre_medico", "medico": "nombre_medico", "name": "nombre_medico",
            "product": "producto", "amount": "monto", "total": "monto",
            "date": "fecha_venta", "fecha": "fecha_venta", "sale_date": "fecha_venta"
        }
        df = df.rename(columns={k: v for k, v in col_map.items() if k in df.columns})
        missing = [c for c in required_cols if c not in df.columns]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Columnas faltantes: {', '.join(missing)}. Columnas requeridas: {', '.join(required_cols)}"
            )

    upload = SalesUpload(filename=file.filename, rows_processed=len(df))
    db.add(upload)
    db.flush()

    matched = 0
    unmatched = 0
    errors = []

    for _, row in df.iterrows():
        try:
            doctor_name = str(row.get("nombre_medico", "")).strip()
            product = str(row.get("producto", "")).strip()
            amount_raw = row.get("monto", 0)
            date_raw = row.get("fecha_venta", None)

            try:
                amount = float(amount_raw) if amount_raw else 0.0
            except (ValueError, TypeError):
                amount = 0.0

            sale_date = None
            if date_raw:
                try:
                    sale_date = pd.to_datetime(date_raw).to_pydatetime()
                except Exception:
                    sale_date = None

            doctor = match_doctor(doctor_name, db)

            sale = Sale(
                doctor_id=doctor.id if doctor else None,
                doctor_name_raw=doctor_name,
                product=product,
                amount=amount,
                sale_date=sale_date,
                upload_id=upload.id
            )
            db.add(sale)
            if doctor:
                matched += 1
            else:
                unmatched += 1
        except Exception as e:
            errors.append(str(e))

    db.commit()

    return {
        "message": "Ventas cargadas exitosamente",
        "upload_id": upload.id,
        "rows_processed": len(df),
        "matched_doctors": matched,
        "unmatched_doctors": unmatched,
        "errors": errors[:10]
    }


@router.post("/upload-consolidado")
async def upload_consolidado(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Carga el archivo consolidado de ventas con RUT doctor/paciente y categoría."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No se proporcionó archivo")

    content = await file.read()
    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
        elif file.filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Formato no soportado. Use CSV o Excel.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al leer archivo: {str(e)}")

    df.columns = [c.lower().strip().replace(" ", "_") for c in df.columns]

    col_map = {
        "nombre_doctor": "nombre_medico", "nombre_profesional": "nombre_medico",
        "doctor": "nombre_medico", "medico": "nombre_medico",
        "rut_profesional": "rut_doctor",
        "rut_usuario": "rut_paciente",
        "nombre_titular": "nombre_paciente",
        "precio_total": "monto", "amount": "monto", "total": "monto",
        "fecha_ingresado": "fecha_venta", "fecha_y_hora": "fecha_venta",
        "fecha": "fecha_venta", "fecha_pago": "fecha_venta",
        "categoría": "categoria",
    }
    df = df.rename(columns={k: v for k, v in col_map.items() if k in df.columns})

    # Pre-cargar médicos existentes en memoria para evitar queries dentro del loop
    existing_doctors_by_rut: dict = {}
    existing_doctors_by_name: dict = {}
    for doc in db.query(Doctor).all():
        if doc.rut:
            existing_doctors_by_rut[doc.rut.strip()] = doc.id
        existing_doctors_by_name[doc.name.strip().lower()] = doc.id

    # Pre-cargar external_ids existentes para deduplicación rápida
    existing_ext_ids: set = set(
        r[0] for r in db.query(Sale.external_id).filter(Sale.external_id.isnot(None)).all()
    )

    upload = SalesUpload(filename=file.filename, rows_processed=len(df))
    db.add(upload)
    db.commit()
    db.refresh(upload)

    def clean(val):
        s = str(val).strip()
        return None if s in ("nan", "None", "", "NaN") else s

    matched = 0
    new_doctors_count = 0
    duplicates = 0
    sales_to_add = []

    for _, row in df.iterrows():
        try:
            doctor_name = clean(row.get("nombre_medico", "")) or ""
            rut_doc = clean(row.get("rut_doctor", ""))
            rut_pac = clean(row.get("rut_paciente", ""))
            nombre_pac = clean(row.get("nombre_paciente", ""))
            product = clean(row.get("producto", ""))
            categoria = clean(row.get("categoria", ""))
            amount_raw = row.get("monto", 0)
            date_raw = row.get("fecha_venta", None)

            try:
                amount = float(amount_raw) if amount_raw else 0.0
            except (ValueError, TypeError):
                amount = 0.0

            sale_date = None
            if date_raw:
                try:
                    sale_date = pd.to_datetime(date_raw, dayfirst=True).to_pydatetime()
                except Exception:
                    sale_date = None

            date_str = sale_date.strftime("%Y%m%d") if sale_date else "nodate"
            ext_id = f"{rut_pac or ''}|{rut_doc or ''}|{date_str}|{(product or '')[:50]}"[:200]

            if ext_id in existing_ext_ids:
                duplicates += 1
                continue
            existing_ext_ids.add(ext_id)

            # Buscar doctor en caché (sin queries al DB)
            doctor_id = None
            if rut_doc and rut_doc in existing_doctors_by_rut:
                doctor_id = existing_doctors_by_rut[rut_doc]
                matched += 1
            elif doctor_name and doctor_name.strip().lower() in existing_doctors_by_name:
                doctor_id = existing_doctors_by_name[doctor_name.strip().lower()]
                matched += 1
            elif doctor_name:
                # Crear médico nuevo sin flush en el loop
                new_doc = Doctor(name=doctor_name, rut=rut_doc, is_active=True)
                db.add(new_doc)
                db.flush()
                db.refresh(new_doc)
                doctor_id = new_doc.id
                if rut_doc:
                    existing_doctors_by_rut[rut_doc] = doctor_id
                existing_doctors_by_name[doctor_name.strip().lower()] = doctor_id
                new_doctors_count += 1
                matched += 1

            sales_to_add.append(Sale(
                doctor_id=doctor_id,
                doctor_name_raw=doctor_name or None,
                rut_doctor=rut_doc,
                rut_paciente=rut_pac,
                nombre_paciente=nombre_pac,
                product=product,
                categoria=categoria,
                amount=amount,
                sale_date=sale_date,
                upload_id=upload.id,
                external_id=ext_id,
            ))

            # Commit cada 500 filas para evitar transacciones muy largas
            if len(sales_to_add) >= 500:
                db.bulk_save_objects(sales_to_add)
                db.commit()
                sales_to_add = []

        except Exception as e:
            continue

    if sales_to_add:
        db.bulk_save_objects(sales_to_add)
        db.commit()

    # Normalización automática post-carga
    norm_result = _run_normalization(db)

    return {
        "message": "Consolidado cargado exitosamente",
        "upload_id": upload.id,
        "rows_processed": len(df),
        "matched_doctors": matched,
        "new_doctors_created": new_doctors_count,
        "duplicates_skipped": duplicates,
        "normalized": norm_result,
        "errors": []
    }


@router.get("/summary")
def get_sales_summary(db: Session = Depends(get_db)):
    doctors = db.query(Doctor).filter(Doctor.is_active == True).all()
    result = []

    for doctor in doctors:
        total_sales = float(db.query(func.sum(Sale.amount)).filter(Sale.doctor_id == doctor.id, Sale.amount.isnot(None)).scalar() or 0)
        sales_count = db.query(func.count(Sale.id)).filter(Sale.doctor_id == doctor.id).scalar()
        visits_count = db.query(func.count(Visit.id)).filter(
            Visit.doctor_id == doctor.id,
            Visit.status == "completed"
        ).scalar()

        item = SalesSummaryItem(
            doctor_id=doctor.id,
            doctor_name=doctor.name,
            doctor_rut=doctor.rut,
            total_units=sales_count,
            total_sales=total_sales,
            sales_count=sales_count,
            visits_count=visits_count,
            has_visits=visits_count > 0
        )
        result.append(item)

    result.sort(key=lambda x: x.total_sales, reverse=True)
    return result


def _run_normalization(db: Session) -> dict:
    """
    Función reutilizable de normalización de médicos duplicados.
    Se llama automáticamente tras cada carga de ventas y también
    está disponible manualmente via POST /normalize-doctors.
    """
    from collections import defaultdict

    # ── 1. Cargar todas las ventas con rut ──────────────────────────────────
    all_sales = db.query(Sale).all()

    rut_name_count:  dict = defaultdict(lambda: defaultdict(int))
    rut_docid_count: dict = defaultdict(lambda: defaultdict(int))
    rut_raw_count:   dict = defaultdict(lambda: defaultdict(int))

    for s in all_sales:
        nr = _norm_rut(s.rut_doctor)
        if not nr:
            continue
        name = (s.doctor_name_raw or "").strip()
        if name:
            rut_name_count[nr][name] += 1
        if s.doctor_id:
            rut_docid_count[nr][s.doctor_id] += 1
        if s.rut_doctor:
            rut_raw_count[nr][s.rut_doctor] += 1

    # ── 2. Calcular canónico por rut normalizado ────────────────────────────
    canonical: dict = {}
    for nr in rut_name_count:
        best_name   = max(rut_name_count[nr],  key=lambda k: rut_name_count[nr][k])  if rut_name_count[nr]  else None
        best_did    = max(rut_docid_count[nr],  key=lambda k: rut_docid_count[nr][k]) if rut_docid_count[nr] else None
        best_rawrut = max(rut_raw_count[nr],    key=lambda k: rut_raw_count[nr][k])   if rut_raw_count[nr]   else None
        canonical[nr] = {"name": best_name, "doctor_id": best_did, "raw_rut": best_rawrut}

    # ── 3. Actualizar ventas ────────────────────────────────────────────────
    sales_updated = 0
    batch_count = 0
    for s in all_sales:
        nr = _norm_rut(s.rut_doctor)
        if not nr or nr not in canonical:
            continue
        c = canonical[nr]
        changed = False
        if c["name"] and s.doctor_name_raw != c["name"]:
            s.doctor_name_raw = c["name"]
            changed = True
        if c["raw_rut"] and s.rut_doctor != c["raw_rut"]:
            s.rut_doctor = c["raw_rut"]
            changed = True
        if c["doctor_id"] and s.doctor_id != c["doctor_id"]:
            s.doctor_id = c["doctor_id"]
            changed = True
        if changed:
            sales_updated += 1
            batch_count += 1
        if batch_count >= 500:
            db.commit()
            batch_count = 0
    db.commit()

    # ── 4. Fusionar médicos duplicados en tabla doctors ─────────────────────
    all_docs = db.query(Doctor).all()
    rut_to_docs: dict = defaultdict(list)
    for d in all_docs:
        nr = _norm_rut(d.rut)
        if nr:
            rut_to_docs[nr].append(d)

    doctors_merged = 0
    for nr, docs in rut_to_docs.items():
        if len(docs) <= 1:
            continue
        c = canonical.get(nr)
        if not c or not c["doctor_id"]:
            canonical_doc = max(docs, key=lambda d: d.id)
        else:
            canonical_doc = next((d for d in docs if d.id == c["doctor_id"]), docs[0])

        if c and c["name"]:
            canonical_doc.name = c["name"]
        if c and c["raw_rut"]:
            canonical_doc.rut = c["raw_rut"]

        for doc in docs:
            if doc.id == canonical_doc.id:
                continue
            db.query(Visit).filter(Visit.doctor_id == doc.id).update(
                {"doctor_id": canonical_doc.id}, synchronize_session=False
            )
            db.query(Sale).filter(
                Sale.doctor_id == doc.id,
                Sale.rut_doctor.is_(None)
            ).update({"doctor_id": canonical_doc.id}, synchronize_session=False)
            doc.is_active = False
            doctors_merged += 1

        db.commit()

    # ── 5. Actualizar nombre en tabla doctors ───────────────────────────────
    for nr, c in canonical.items():
        if not c["doctor_id"] or not c["name"]:
            continue
        doc = db.query(Doctor).filter(Doctor.id == c["doctor_id"]).first()
        if doc and doc.name != c["name"]:
            doc.name = c["name"]
    db.commit()

    # ── 6. Fusionar doctors duplicados por nombre (mismo nombre, distinto id) ─
    # Cubre el caso donde un doctor sin RUT tiene el mismo nombre que uno con RUT
    all_docs2 = db.query(Doctor).all()
    name_to_docs: dict = defaultdict(list)
    for d in all_docs2:
        key = d.name.strip().lower()
        name_to_docs[key].append(d)

    name_merged = 0
    for name_key, docs in name_to_docs.items():
        if len(docs) <= 1:
            continue
        # Canónico: el que tiene RUT, o el con más ventas (más alto id)
        canonical_doc = next((d for d in docs if d.rut), None) or max(docs, key=lambda d: d.id)
        for doc in docs:
            if doc.id == canonical_doc.id:
                continue
            # Reasignar ventas y visitas al canónico
            db.query(Sale).filter(Sale.doctor_id == doc.id).update(
                {"doctor_id": canonical_doc.id}, synchronize_session=False
            )
            db.query(Visit).filter(Visit.doctor_id == doc.id).update(
                {"doctor_id": canonical_doc.id}, synchronize_session=False
            )
            doc.is_active = False
            name_merged += 1
        db.commit()

    # ── 7. Sincronizar RUT: ventas → doctors y doctors → ventas ─────────────
    # 7a. Poblar rut en tabla doctors desde las ventas (para doctors sin rut)
    docs_without_rut = db.query(Doctor).filter(Doctor.rut.is_(None), Doctor.is_active == True).all()
    rut_to_doc_synced = 0
    for doc in docs_without_rut:
        sale_with_rut = db.query(Sale).filter(
            Sale.doctor_id == doc.id,
            Sale.rut_doctor.isnot(None)
        ).first()
        if sale_with_rut:
            doc.rut = sale_with_rut.rut_doctor
            rut_to_doc_synced += 1
    db.commit()

    # 7b. Poblar rut_doctor en ventas desde tabla doctors
    docs_with_rut = {d.id: d.rut for d in db.query(Doctor).filter(Doctor.rut.isnot(None)).all()}
    rut_synced = 0
    sales_no_rut = db.query(Sale).filter(Sale.rut_doctor.is_(None), Sale.doctor_id.isnot(None)).all()
    for s in sales_no_rut:
        rut = docs_with_rut.get(s.doctor_id)
        if rut:
            s.rut_doctor = rut
            rut_synced += 1
    db.commit()

    return {
        "ruts_procesados": len(canonical),
        "ventas_actualizadas": sales_updated,
        "medicos_fusionados": doctors_merged + name_merged,
        "rut_sincronizados": rut_synced,
    }


@router.post("/normalize-doctors")
def normalize_doctors(db: Session = Depends(get_db)):
    """Normaliza médicos duplicados manualmente (también se ejecuta automáticamente tras cada carga)."""
    result = _run_normalization(db)
    return {"message": "Normalización completada", **result}
