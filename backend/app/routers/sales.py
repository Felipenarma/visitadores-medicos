from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
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
    """Normaliza RUT eliminando puntos, guiones, espacios y ceros iniciales."""
    if not r:
        return None
    cleaned = re.sub(r'[\.\-\s]', '', str(r)).upper().strip()
    # Eliminar ceros iniciales: "076228507" → "76228507"
    cleaned = cleaned.lstrip('0') or cleaned  # lstrip('0') puede dejar vacío si es "000", usar fallback
    return cleaned or None


def _infer_categoria(product: str, tipo_producto: str = "") -> Optional[str]:
    """Infiere la categoría de negocio a partir del nombre del producto."""
    if not product:
        return None
    p = product.lower()
    t = (tipo_producto or "").lower()

    # Producto Terminado — marcas comerciales (va ANTES que Hormonas)
    terminado_kw = [
        "hormogel", "lenzetto", "estreva", "duphaston", "progendo",
        "bonavid", "blissel", "ginoderm", "ovestin", "colpotrophine",
        "colpotrofine", "vacidox",
    ]
    if any(k in p for k in terminado_kw):
        return "Producto Terminado"
    if "comercial" in t:
        return "Producto Terminado"
    if "terminado" in t:
        return "Producto Terminado"

    # Pelo — va antes que Hormonas para no colisionar
    pelo_kw = ["minoxidil", "finasteride", "finasterida", "dutasteride", "dutasterida"]
    if any(k in p for k in pelo_kw):
        return "Pelo"

    # Fertilidad
    fertilidad_kw = ["clomifeno", "clomifene", "clomiphene", "coenzima q10", "coenzima q 10",
                     "coq10", "co-q10"]
    if any(k in p for k in fertilidad_kw):
        return "Fertilidad"

    # Cannabis Medicinal
    cannabis_kw = ["cbd", "thc", "cannabis", "canavis", "cáñamo", "vaporizable",
                   "vaporizador", "batería", "aceite sublingual", "aceite veterinario",
                   "full spectrum", "broad spectrum", "og kush", "amnesia"]
    if any(k in p for k in cannabis_kw):
        return "Cannabis Medicinal"

    # Hormonas — magistrales hormonales
    hormonas_kw = [
        "testosterona", "progesterona", "dhea", "estradiol", "estriol", "pregnenolona",
        "crema trh", "trh", "trilostano", "melatonina", "oxitocina",
        "anastrozol", "letrozol", "tamoxifeno", "bromocriptina",
        "espironolactona", "spironolactona", "aldosterona",
        "cortisol", "hidrocortisona", "prednisona", "dexametasona",
        "tiroxina", "levotiroxina", "hcg", "hmg", "lh", "fsh",
        "androstenediona", "androstenediol", "aldosterona",
        "crema base hrt", "crema base", "hrt",
    ]
    if any(k in p for k in hormonas_kw):
        return "Hormonas"

    # Dermatología
    derma_kw = ["derma", "retinol", "ácido hialurónico", "acné", "acne",
                "colágeno", "elastina", "vitamina e ", "niacinamida", "azelaic",
                "tretinoína", "tretinoin", "adapaleno", "adapalene",
                "peeling", "despigmentante", "hidroquinona"]
    if any(k in p for k in derma_kw):
        return "Dermatología"

    # Control de Peso
    peso_kw = ["semaglutida", "ozempic", "saxenda", "liraglutida", "tirzepatida",
               "metformina", "orlistat", "mounjaro", "wegovy", "rybelsus"]
    if any(k in p for k in peso_kw):
        return "Control de Peso"

    # Suero Terapia
    suero_kw = ["suero", "glutatión", "nac ", "vitamina c", "vitamina d", "b12",
                "zinc", "magnesio", "selenio", "omega", "colageno iv"]
    if any(k in p for k in suero_kw):
        return "Suero Terapia"

    # Veterinario — va antes del catch-all, después de cannabis
    vet_kw = ["trilostano", "mitotane", "mitotano", "veterinario", "veterinaria",
              "canino", "felino", "equino", "bovino", "anipryl", "selegilina"]
    if any(k in p for k in vet_kw):
        return "Veterinario"

    # Sin match → no asignar categoría (mejor sin categoría que con categoría incorrecta)
    return None


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
async def upload_consolidado(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    ref_month: Optional[int] = Form(None),
    ref_year: Optional[int] = Form(None),
    cap_dates: Optional[str] = Form(None),  # "true" para limitar fechas al mes de referencia
    db: Session = Depends(get_db)
):
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

    # Mes de referencia: 1) parámetro explícito del form, 2) fecha en nombre de archivo, 3) mes anterior
    import re as _re
    if ref_month and ref_year:
        _ref_year, _ref_month = ref_year, ref_month
    else:
        _ref_date_match = _re.search(r'(\d{4})-(\d{2})-\d{2}', file.filename or "")
        if _ref_date_match:
            _ref_year, _ref_month = int(_ref_date_match.group(1)), int(_ref_date_match.group(2))
        else:
            # Fallback: mes anterior (no el actual, para evitar desfase al subir el 1ro del mes)
            _now = datetime.utcnow()
            if _now.month == 1:
                _ref_year, _ref_month = _now.year - 1, 12
            else:
                _ref_year, _ref_month = _now.year, _now.month - 1
    from calendar import monthrange as _monthrange
    _, _ref_last_day = _monthrange(_ref_year, _ref_month)
    _ref_max_date = datetime(_ref_year, _ref_month, _ref_last_day, 23, 59, 59)
    _cap_dates = (cap_dates == "true")
    # Tope global: nunca guardar fechas del mes en curso (siempre incompleto)
    _now_dt = datetime.utcnow()
    if _now_dt.month == 1:
        _global_cap_year, _global_cap_month = _now_dt.year - 1, 12
    else:
        _global_cap_year, _global_cap_month = _now_dt.year, _now_dt.month - 1
    from calendar import monthrange as _mr2
    _, _global_cap_last = _mr2(_global_cap_year, _global_cap_month)
    _global_max_date = datetime(_global_cap_year, _global_cap_month, _global_cap_last, 23, 59, 59)

    # Normalizar nombres de columnas: minúsculas, sin espacios, sin tildes básicas
    def norm_col(c):
        c = c.lower().strip()
        c = c.replace(" ", "_").replace("°", "").replace("n_", "n")
        c = c.replace("á","a").replace("é","e").replace("í","i").replace("ó","o").replace("ú","u").replace("ü","u")
        return c
    df.columns = [norm_col(c) for c in df.columns]

    # Concatenar nombre + apellido del doctor/profesional si vienen separados
    # Soporta: nombre_profesional/apellido_profesional (fuente original)
    #          nombre_doctor/apellido_doctor (archivo normalizado)
    if "nombre_profesional" in df.columns and "apellido_profesional" in df.columns:
        df["nombre_medico"] = (
            df["nombre_profesional"].fillna("").astype(str).str.strip()
            + " " +
            df["apellido_profesional"].fillna("").astype(str).str.strip()
        ).str.strip()
        df = df.drop(columns=["nombre_profesional", "apellido_profesional"], errors="ignore")
    elif "nombre_doctor" in df.columns and "apellido_doctor" in df.columns:
        df["nombre_medico"] = (
            df["nombre_doctor"].fillna("").astype(str).str.strip()
            + " " +
            df["apellido_doctor"].fillna("").astype(str).str.strip()
        ).str.strip()
        df = df.drop(columns=["nombre_doctor", "apellido_doctor"], errors="ignore")

    # Concatenar nombre + apellido del titular/paciente si vienen separados
    # Soporta: nombre_titular/apellido_titular (fuente original)
    #          nombre_usuario/apellido_usuario (archivo normalizado)
    if "nombre_titular" in df.columns and "apellido_titular" in df.columns:
        df["nombre_paciente"] = (
            df["nombre_titular"].fillna("").astype(str).str.strip()
            + " " +
            df["apellido_titular"].fillna("").astype(str).str.strip()
        ).str.strip()
        df = df.drop(columns=["nombre_titular", "apellido_titular"], errors="ignore")
    elif "nombre_usuario" in df.columns and "apellido_usuario" in df.columns:
        df["nombre_paciente"] = (
            df["nombre_usuario"].fillna("").astype(str).str.strip()
            + " " +
            df["apellido_usuario"].fillna("").astype(str).str.strip()
        ).str.strip()
        df = df.drop(columns=["nombre_usuario", "apellido_usuario"], errors="ignore")

    # Filtrar solo ventas pagadas si existe la columna estado
    if "estado_cotizacion" in df.columns:
        df = df[df["estado_cotizacion"].astype(str).str.lower().str.contains("pagad", na=False)]

    # ── Preprocessing: resolver conflictos de prioridad entre columnas ──────
    # Guardar tipo_producto original antes de que sea renombrado a categoria
    if "tipo_producto" in df.columns:
        df["_tipo_producto_raw"] = df["tipo_producto"]
    # Preferir fecha_pago (fecha real de pago) sobre fecha_y_hora (creación)
    if "fecha_pago" in df.columns and "fecha_y_hora" in df.columns:
        df = df.drop(columns=["fecha_y_hora"])
    # Preferir precio_total (con descuentos aplicados) sobre precio_productos
    if "precio_total" in df.columns and "precio_productos" in df.columns:
        df = df.drop(columns=["precio_productos"])
    # rut_titular es el RUT del paciente real; unificarlo con rut_usuario
    if "rut_titular" in df.columns and "rut_usuario" not in df.columns:
        df = df.rename(columns={"rut_titular": "rut_usuario"})
    elif "rut_titular" in df.columns:
        df["rut_usuario"] = df["rut_titular"].fillna(df["rut_usuario"])
    # Evitar columna categoria duplicada: si viene categoria_producto, tiene prioridad
    if "categoria_producto" in df.columns and "categoria" in df.columns:
        df = df.drop(columns=["categoria"])
    # Si viene tipo_producto Y categoria, quedarse con categoria
    if "tipo_producto" in df.columns and "categoria" in df.columns:
        df = df.drop(columns=["tipo_producto"])

    col_map = {
        # Doctor
        "nombre_doctor": "nombre_medico",
        "doctor": "nombre_medico", "medico": "nombre_medico",
        "rut_profesional": "rut_doctor",
        # Paciente
        "rut_usuario": "rut_paciente",          # fuente original
        "rut_usuario_1": "rut_paciente",         # por si viene renombrado
        "nombre_titular": "nombre_paciente",
        "nombre_usuario": "nombre_paciente",     # archivo normalizado
        # Montos
        "precio_total": "monto", "amount": "monto", "total": "monto",
        "precio_productos": "monto", "monto_pagado": "monto", "monto_cotizado": "monto",
        # Fechas
        "fecha_ingresado": "fecha_venta", "fecha_y_hora": "fecha_venta",
        "fecha": "fecha_venta", "fecha_pago": "fecha_venta",
        # Categoría — incluye columna del archivo normalizado
        "categoria": "categoria", "tipo_producto": "categoria",
        "categoria_producto": "categoria",       # archivo normalizado
        # Orden
        "n_orden": "n_orden",
        # ── Formato recetas-por-prescriptor (Narma pharmacy output) ──────────
        "prescriptor": "nombre_medico",
        "rut_prescriptor": "rut_doctor",
        "paciente": "nombre_paciente",
        "rut_/_pasaporte_paciente": "rut_paciente",
        "tipo_de_preparacion": "producto",       # Tipo de preparación
        "monto_facturado": "monto",
        "fecha_creacionrm/op": "fecha_venta",    # Fecha creación RM/OP — fecha de prescripción (prioridad)
        "fecha_creacionot": "fecha_venta",       # Fecha creación OT — fallback
    }
    df = df.rename(columns={k: v for k, v in col_map.items() if k in df.columns})

    # Salvaguarda: si quedaron columnas duplicadas tras el rename, consolidar tomando el primer valor no nulo
    if df.columns.duplicated().any():
        df = df.loc[:, ~df.columns.duplicated(keep="first")]

    # Pre-cargar médicos existentes en memoria para evitar queries dentro del loop
    # Usamos RUT normalizado como clave para que "18655133-8" y "186551338" sean iguales
    existing_doctors_by_rut: dict = {}
    existing_doctors_by_name: dict = {}
    for doc in db.query(Doctor).all():
        if doc.rut:
            nr = _norm_rut(doc.rut)
            if nr:
                existing_doctors_by_rut[nr] = doc.id
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

    def _parse_monto(val) -> float:
        """Parsea montos en formato chileno: '78.000' → 78000.0, '1.234,56' → 1234.56"""
        if val is None:
            return 0.0
        s = str(val).strip().replace('$', '').replace('\xa0', '').replace(' ', '')
        if not s or s in ('nan', 'None', 'NaN', '-', ''):
            return 0.0
        if ',' in s:
            s = s.replace('.', '').replace(',', '.')
        else:
            parts = s.split('.')
            if len(parts) > 2:
                s = ''.join(parts)
            elif len(parts) == 2 and len(parts[1]) == 3 and parts[1].isdigit():
                s = ''.join(parts)
        try:
            return float(s)
        except (ValueError, TypeError):
            return 0.0

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
            if product and len(product) > 200:
                product = product[:197] + "..."
            # _tipo_producto_raw se preservó antes del rename; categoria puede venir directo
            tipo_prod = clean(row.get("_tipo_producto_raw", "")) or clean(row.get("tipo_producto", "")) or ""
            categoria_raw = clean(row.get("categoria", ""))
            # Si categoria_raw es un tipo genérico (ej. "Recetario Magistral a Confeccionar"), usar inferencia
            tipos_genericos = {"recetario magistral a confeccionar", "recetario magistral terminado", "comercial"}
            if categoria_raw and categoria_raw.lower() not in tipos_genericos:
                categoria = categoria_raw
            else:
                categoria = _infer_categoria(product or "", tipo_prod)
            amount_raw = row.get("monto", 0)
            date_raw = row.get("fecha_venta", None)

            amount = _parse_monto(amount_raw)

            sale_date = None
            if date_raw:
                try:
                    # Si el valor empieza con año (YYYY-MM-DD), parsear como ISO sin dayfirst
                    _date_str = str(date_raw).strip()
                    _is_iso = len(_date_str) >= 10 and _date_str[4:5] == '-' and _date_str[7:8] == '-'
                    sale_date = pd.to_datetime(date_raw, dayfirst=not _is_iso).to_pydatetime()
                    # Limitar al último día del mes de referencia (evita desfase OT/RM entre meses)
                    if _cap_dates and sale_date > _ref_max_date:
                        sale_date = _ref_max_date
                    elif sale_date > _global_max_date:
                        sale_date = _global_max_date
                except Exception:
                    sale_date = None

            date_str = sale_date.strftime("%Y%m%d") if sale_date else "nodate"
            # Prioridad: OT (recetas-por-prescriptor) > N° Cotización > N° Orden > hash compuesto
            ot_val = clean(row.get("ot", ""))
            ncot = clean(row.get("ncotizacion", ""))
            n_orden = clean(row.get("n_orden", "")) or clean(row.get("norden", ""))
            if ot_val:
                ext_id = f"ot_{ot_val}"[:200]
            elif ncot:
                ext_id = f"cot_{ncot}"[:200]
            elif n_orden:
                ext_id = f"orden_{n_orden}"[:200]
            else:
                ext_id = f"{rut_pac or ''}|{rut_doc or ''}|{date_str}|{(product or '')[:50]}"[:200]

            if ext_id in existing_ext_ids:
                # Aunque sea duplicado, actualizar doctor_name_raw si el nuevo nombre es más largo
                if doctor_name:
                    existing_sale = db.query(Sale).filter(Sale.external_id == ext_id).first()
                    if existing_sale and len(doctor_name) > len(existing_sale.doctor_name_raw or ""):
                        existing_sale.doctor_name_raw = doctor_name
                duplicates += 1
                continue
            existing_ext_ids.add(ext_id)

            # Buscar doctor en caché usando RUT normalizado
            doctor_id = None
            rut_doc_norm = _norm_rut(rut_doc) if rut_doc else None
            if rut_doc_norm and rut_doc_norm in existing_doctors_by_rut:
                doctor_id = existing_doctors_by_rut[rut_doc_norm]
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
                if rut_doc_norm:
                    existing_doctors_by_rut[rut_doc_norm] = doctor_id
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
    db.commit()  # Commit siempre: cubre nuevas filas y actualizaciones de duplicados

    # Normalización automática en background (no bloquea la respuesta)
    background_tasks.add_task(_run_normalization, db)

    return {
        "message": "Consolidado cargado exitosamente",
        "upload_id": upload.id,
        "rows_processed": len(df),
        "matched_doctors": matched,
        "new_doctors_created": new_doctors_count,
        "duplicates_skipped": duplicates,
        "normalized": "en proceso (background)",
        "errors": []
    }


@router.get("/uploads/last")
def get_last_upload(db: Session = Depends(get_db)):
    upload = db.query(SalesUpload).order_by(SalesUpload.id.desc()).first()
    if not upload:
        return None
    return {
        "id": upload.id,
        "filename": upload.filename,
        "upload_date": upload.upload_date,
        "rows_processed": upload.rows_processed,
    }


@router.get("/uploads")
def list_uploads(db: Session = Depends(get_db)):
    uploads = db.query(SalesUpload).order_by(SalesUpload.upload_date.desc()).all()
    result = []
    for u in uploads:
        sales_count = db.query(func.count(Sale.id)).filter(Sale.upload_id == u.id).scalar()
        result.append({
            "id": u.id,
            "filename": u.filename,
            "upload_date": u.upload_date,
            "rows_processed": u.rows_processed,
            "sales_count": sales_count,
        })
    return result


@router.delete("/uploads/{upload_id}")
def delete_upload(upload_id: int, db: Session = Depends(get_db)):
    upload = db.query(SalesUpload).filter(SalesUpload.id == upload_id).first()
    if not upload:
        raise HTTPException(status_code=404, detail="Upload no encontrado")
    # Eliminar ventas asociadas
    db.query(Sale).filter(Sale.upload_id == upload_id).delete()
    db.delete(upload)
    db.commit()
    return {"ok": True, "deleted_upload_id": upload_id}


@router.post("/clear-all")
def clear_all_sales(db: Session = Depends(get_db)):
    """Elimina TODAS las ventas y uploads. Útil para limpiar datos corruptos antes de re-cargar."""
    sales_deleted = db.query(Sale).delete()
    uploads_deleted = db.query(SalesUpload).delete()
    db.commit()
    return {"ok": True, "sales_deleted": sales_deleted, "uploads_deleted": uploads_deleted}


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
    # Para el nombre: preferir el más largo (más completo) que aparezca al menos 1 vez.
    # Esto asegura que "Juan Pérez" gane sobre "Juan" aunque haya menos registros nuevos.
    canonical: dict = {}
    for nr in rut_name_count:
        best_name   = max(rut_name_count[nr],  key=lambda k: len(k))                  if rut_name_count[nr]  else None
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
    # IMPORTANTE: solo considerar activos — los inactivos del paso 4 no deben volver a mezclarse
    all_docs2 = db.query(Doctor).filter(Doctor.is_active == True).all()
    name_to_docs: dict = defaultdict(list)
    for d in all_docs2:
        key = d.name.strip().lower()
        name_to_docs[key].append(d)

    name_merged = 0
    for name_key, docs in name_to_docs.items():
        if len(docs) <= 1:
            continue
        # Canónico: primero el que tiene RUT y está activo, luego max id
        canonical_doc = next((d for d in docs if d.rut and d.is_active), None) or max(docs, key=lambda d: d.id)
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

    # ── 8. Enlazar ventas sin doctor_id usando lookup directo en tabla doctors ─
    # Caso clave: ventas del nuevo formato (recetas-por-prescriptor) que traen
    # rut_doctor pero no pudieron hacer match durante la carga porque el médico
    # no tenía RUT guardado en ese momento.
    active_docs = db.query(Doctor).filter(Doctor.is_active == True).all()
    rut_doc_map: dict = {}
    name_doc_map: dict = {}
    for d in active_docs:
        nr = _norm_rut(d.rut)
        if nr:
            rut_doc_map[nr] = d.id
        name_doc_map[d.name.strip().lower()] = d.id

    rut_linked = 0
    name_linked = 0
    unmatched_sales = db.query(Sale).filter(Sale.doctor_id.is_(None)).all()
    for s in unmatched_sales:
        nr = _norm_rut(s.rut_doctor)
        if nr and nr in rut_doc_map:
            s.doctor_id = rut_doc_map[nr]
            rut_linked += 1
        elif s.doctor_name_raw and s.doctor_name_raw.strip().lower() in name_doc_map:
            s.doctor_id = name_doc_map[s.doctor_name_raw.strip().lower()]
            name_linked += 1
    db.commit()

    # ── 9. Crear médicos nuevos para ventas que siguen sin doctor_id ──────────
    # Médicos que están en el archivo de ventas pero no existen en la tabla doctors
    from collections import defaultdict, Counter
    still_unmatched = db.query(Sale).filter(Sale.doctor_id.is_(None)).all()
    doctors_created = 0

    rut_groups: dict = defaultdict(list)
    name_groups: dict = defaultdict(list)
    for s in still_unmatched:
        nr = _norm_rut(s.rut_doctor)
        if nr:
            rut_groups[nr].append(s)
        elif s.doctor_name_raw and s.doctor_name_raw.strip():
            name_groups[s.doctor_name_raw.strip().lower()].append(s)

    for nr, sales in rut_groups.items():
        if nr in rut_doc_map:
            for s in sales:
                s.doctor_id = rut_doc_map[nr]
            continue
        name_counts = Counter(s.doctor_name_raw.strip() for s in sales if s.doctor_name_raw)
        canon_name = name_counts.most_common(1)[0][0] if name_counts else "Médico sin nombre"
        raw_rut = next((s.rut_doctor for s in sales if s.rut_doctor), None)
        new_doc = Doctor(name=canon_name, rut=raw_rut, is_active=True)
        db.add(new_doc)
        db.flush()
        rut_doc_map[nr] = new_doc.id
        name_doc_map[canon_name.lower()] = new_doc.id
        for s in sales:
            s.doctor_id = new_doc.id
        doctors_created += 1

    for name_key, sales in name_groups.items():
        if name_key in name_doc_map:
            for s in sales:
                s.doctor_id = name_doc_map[name_key]
            continue
        canon_name = sales[0].doctor_name_raw.strip()
        new_doc = Doctor(name=canon_name, is_active=True)
        db.add(new_doc)
        db.flush()
        name_doc_map[name_key] = new_doc.id
        for s in sales:
            s.doctor_id = new_doc.id
        doctors_created += 1

    db.commit()

    # ── 10. Reparar médicos inactivos que aún tienen ventas apuntando a ellos ─
    # Busca doctores inactivos con ventas vigentes. Si hay un doctor activo con
    # el mismo RUT → reasigna. Si no → reactiva el doctor inactivo.
    inactive_with_sales = (
        db.query(Doctor)
        .filter(Doctor.is_active == False)
        .join(Sale, Sale.doctor_id == Doctor.id)
        .distinct()
        .all()
    )
    reactivated = 0
    sales_reassigned_step10 = 0

    # Construir mapa RUT→doctor_id de activos
    active_rut_map: dict = {}
    for d in db.query(Doctor).filter(Doctor.is_active == True).all():
        nr = _norm_rut(d.rut)
        if nr:
            active_rut_map[nr] = d.id

    for doc in inactive_with_sales:
        nr = _norm_rut(doc.rut)
        if nr and nr in active_rut_map:
            target_id = active_rut_map[nr]
            if target_id != doc.id:
                db.query(Sale).filter(Sale.doctor_id == doc.id).update(
                    {"doctor_id": target_id}, synchronize_session=False
                )
                db.query(Visit).filter(Visit.doctor_id == doc.id).update(
                    {"doctor_id": target_id}, synchronize_session=False
                )
                sales_reassigned_step10 += 1
                db.commit()
                continue
        # Sin match activo — reactivar para no perder ventas
        doc.is_active = True
        reactivated += 1

    db.commit()

    return {
        "ruts_procesados": len(canonical),
        "ventas_actualizadas": sales_updated,
        "medicos_fusionados": doctors_merged + name_merged,
        "rut_sincronizados": rut_synced,
        "ventas_enlazadas_por_rut": rut_linked,
        "ventas_enlazadas_por_nombre": name_linked,
        "medicos_creados": doctors_created,
        "medicos_reactivados": reactivated,
        "ventas_reasignadas_paso10": sales_reassigned_step10,
    }


@router.post("/normalize-doctors")
def normalize_doctors(db: Session = Depends(get_db)):
    """Normaliza médicos duplicados manualmente (también se ejecuta automáticamente tras cada carga)."""
    result = _run_normalization(db)
    return {"message": "Normalización completada", **result}


@router.post("/recategorize")
def recategorize_sales(db: Session = Depends(get_db)):
    """Re-infiere la categoría de todas las ventas usando la lógica actualizada de _infer_categoria."""
    sales = db.query(Sale).all()
    updated = 0
    for sale in sales:
        new_cat = _infer_categoria(sale.product or "", "")
        if new_cat != sale.categoria:
            sale.categoria = new_cat
            updated += 1
    db.commit()
    return {"message": f"Re-categorización completada: {updated} ventas actualizadas de {len(sales)} totales"}


@router.post("/set-doctor-categoria")
def set_doctor_categoria(data: dict, db: Session = Depends(get_db)):
    """Asigna manualmente una categoría a todas las ventas de un médico y actualiza su línea de negocio."""
    doctor_id = data.get("doctor_id")
    rut_doctor = data.get("rut_doctor")
    categoria = data.get("categoria")
    business_line_id = data.get("business_line_id")

    if not categoria:
        return {"ok": False, "error": "categoria requerida"}

    updated = 0
    if doctor_id:
        updated = db.query(Sale).filter(Sale.doctor_id == doctor_id).update(
            {"categoria": categoria}, synchronize_session=False
        )
        if business_line_id:
            doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
            if doctor:
                doctor.business_line_id = business_line_id
    elif rut_doctor:
        updated = db.query(Sale).filter(Sale.rut_doctor == rut_doctor).update(
            {"categoria": categoria}, synchronize_session=False
        )

    db.commit()
    return {"ok": True, "updated": updated}
