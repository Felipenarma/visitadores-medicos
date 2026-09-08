"""
Script para asignar médicos a Angelo Coppola.
Estrategia: RUT exacto → nombre fuzzy → muestra no encontrados
"""
import re, glob, os
import requests
import pandas as pd
from difflib import SequenceMatcher

API = "https://web-production-496eb.up.railway.app/api"

def norm_rut(r):
    if not r or (isinstance(r, float) and pd.isna(r)): return None
    return re.sub(r'[\.\-\s]', '', str(r)).upper()

def sim(a, b):
    return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()

# ── Buscar Angelo ─────────────────────────────────────────────────────────────
reps = requests.get(f"{API}/reps/").json()
angelo = next((r for r in reps if 'Angelo' in r['name'] or 'angelo' in r.get('email','')), None)
if not angelo:
    print("Creando Angelo Coppola...")
    resp = requests.post(f"{API}/reps/", json={"name":"Angelo Coppola","email":"angelo@narma.cl","is_active":True})
    angelo = resp.json()
angelo_id = angelo['id']
print(f"Angelo ID: {angelo_id}, doctores actuales: {angelo.get('doctor_count', '?')}")

# ── Leer Excel de médicos ─────────────────────────────────────────────────────
search_paths = [
    os.path.expanduser("~/Library/Application Support/Claude/**/medicos_2026-09-08.xlsx"),
    "./medicos_2026-09-08.xlsx",
]
rut_file = None
for p in search_paths:
    found = glob.glob(p, recursive=True)
    if found:
        rut_file = found[0]; break

if not rut_file:
    print("ERROR: No encontré medicos_2026-09-08.xlsx")
    exit(1)

df = pd.read_excel(rut_file)
print(f"\nExcel: {len(df)} filas, columnas: {df.columns.tolist()}")

# ── Obtener todos los médicos de la BD ───────────────────────────────────────
print("Cargando médicos de la BD...")
all_docs = requests.get(f"{API}/doctors/").json()
print(f"BD: {len(all_docs)} médicos total")
con_rut = [d for d in all_docs if d.get('rut')]
print(f"BD: {len(con_rut)} con RUT, {len(all_docs)-len(con_rut)} sin RUT")
if con_rut:
    print(f"Muestra RUT BD: {[d['rut'] for d in con_rut[:3]]}")

# Índice por RUT normalizado
rut_idx = {norm_rut(d['rut']): d for d in all_docs if d.get('rut')}
# Índice por nombre
name_idx = all_docs

# ── Matching ──────────────────────────────────────────────────────────────────
asignar = {}  # id → nombre
no_match = []

for _, row in df.iterrows():
    nombre = str(row.get('Nombre', '')).strip()
    rut_raw = row.get('RUT', '')
    rut_norm = norm_rut(rut_raw)

    # 1. Por RUT
    if rut_norm and rut_norm in rut_idx:
        d = rut_idx[rut_norm]
        asignar[d['id']] = f"{nombre} [RUT]"
        continue

    # 2. Por nombre (fuzzy ≥ 0.80)
    if nombre:
        mejor = max(all_docs, key=lambda d: sim(nombre, d.get('nombre', d.get('name', ''))))
        nombre_bd = mejor.get('nombre', mejor.get('name', ''))
        score = sim(nombre, nombre_bd)
        if score >= 0.80:
            asignar[mejor['id']] = f"{nombre} → {nombre_bd} [nombre={score:.2f}]"
            continue

    no_match.append(f"{nombre} (RUT: {rut_raw})")

print(f"\nMatch: {len(asignar)} | Sin match: {len(no_match)}")
if no_match:
    print("Sin match:")
    for x in no_match[:20]:
        print(f"  {x}")

# ── Asignar ───────────────────────────────────────────────────────────────────
print(f"\nAsignando {len(asignar)} médicos a Angelo ({angelo_id})...")
ok = err = 0
for doc_id, label in asignar.items():
    r = requests.put(f"{API}/doctors/{doc_id}/assign-rep", json={"rep_id": angelo_id})
    if r.status_code == 200:
        ok += 1
    else:
        err += 1
        print(f"  ERROR doc {doc_id}: {r.status_code}")

print(f"\n{'='*50}")
print(f"✓ {ok} médicos asignados a Angelo Coppola (ID {angelo_id})")
print(f"✗ {err} errores | {len(no_match)} sin match en BD")
