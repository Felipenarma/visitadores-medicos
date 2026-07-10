"""
Reasigna los médicos de dermatología de Angelo (rep_id=3) sin ventas a Marco Martinez.
Los médicos CON ventas se quedan con Angelo.
"""

import requests

BASE_URL = "https://web-production-496eb.up.railway.app/api"

# 1. Encontrar a Marco Martinez
print("Buscando visitadores...")
reps_resp = requests.get(f"{BASE_URL}/reps/")
reps = reps_resp.json()

marco = next((r for r in reps if "marco" in r["name"].lower()), None)
if not marco:
    print("❌ No se encontró a Marco Martinez. Visitadores disponibles:")
    for r in reps:
        print(f"  ID {r['id']}: {r['name']}")
    exit(1)

marco_id = marco["id"]
print(f"✅ Marco Martinez encontrado: ID {marco_id}")

# 2. Obtener médicos de dermatología de Angelo (rep_id=3)
print("\nObteniendo médicos de dermatología de Angelo...")
params = {"rep_id": 3, "specialty": "Dermatolog", "limit": 500}
docs_resp = requests.get(f"{BASE_URL}/doctors/", params=params)
doctors = docs_resp.json()
print(f"   Total encontrados: {len(doctors)}")

# 3. Clasificar
con_ventas = [d for d in doctors if d.get("has_sales")]
sin_ventas = [d for d in doctors if not d.get("has_sales") and d.get("is_active", True)]

print(f"\n   Con ventas (se quedan con Angelo): {len(con_ventas)}")
for d in con_ventas:
    print(f"     - [{d['id']}] {d['name']}")

print(f"\n   Sin ventas (se reasignan a Marco): {len(sin_ventas)}")

# 4. Reasignar
print(f"\nReasignando {len(sin_ventas)} médicos a Marco Martinez (ID {marco_id})...")
ok = 0
fail = 0
for doc in sin_ventas:
    resp = requests.put(f"{BASE_URL}/doctors/{doc['id']}", json={"rep_id": marco_id})
    if resp.status_code == 200:
        ok += 1
        print(f"  ✅ [{doc['id']}] {doc['name']}")
    else:
        fail += 1
        print(f"  ❌ [{doc['id']}] {doc['name']} → {resp.status_code}: {resp.text[:100]}")

print(f"\n{'='*50}")
print(f"Reasignados correctamente: {ok}")
print(f"Errores: {fail}")
print(f"Sin cambios (con ventas): {len(con_ventas)}")
