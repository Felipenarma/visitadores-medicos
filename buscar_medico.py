"""
Busca y reactiva a la doctora Aida Manzano (o cualquier médico por nombre/RUT).
Ejecutar: python3 buscar_medico.py
"""
import requests

BASE_URL = "https://web-production-496eb.up.railway.app/api"

# ── Buscar por nombre ─────────────────────────────────────────────────────────
print("=== Buscando por nombre 'Manzano' (activos) ===")
r = requests.get(f"{BASE_URL}/doctors/", params={"search": "Manzano", "is_active": True})
activos = r.json() if r.ok else []
print(f"Activos: {len(activos)}")
for d in activos:
    print(f"  ID={d['id']} | {d['name']} | RUT={d.get('rut')} | rep={d.get('rep_name')} | has_sales={d.get('has_sales')}")

print()
print("=== Buscando por nombre 'Manzano' (inactivos) ===")
r2 = requests.get(f"{BASE_URL}/doctors/", params={"search": "Manzano", "is_active": False})
inactivos = r2.json() if r2.ok else []
print(f"Inactivos: {len(inactivos)}")
for d in inactivos:
    print(f"  ID={d['id']} | {d['name']} | RUT={d.get('rut')} | rep={d.get('rep_name')}")

print()
print("=== Buscando por RUT 25374366 ===")
r3 = requests.get(f"{BASE_URL}/doctors/", params={"search": "25374366"})
por_rut = r3.json() if r3.ok else []
print(f"Por RUT: {len(por_rut)}")
for d in por_rut:
    print(f"  ID={d['id']} | {d['name']} | RUT={d.get('rut')} | is_active={d.get('is_active')}")

# ── Reactivar si está inactiva ────────────────────────────────────────────────
if inactivos:
    print()
    respuesta = input("¿Deseas reactivar los médicos inactivos encontrados? (s/n): ").strip().lower()
    if respuesta == 's':
        for d in inactivos:
            r_update = requests.put(f"{BASE_URL}/doctors/{d['id']}", json={"is_active": True})
            if r_update.ok:
                print(f"  ✓ Reactivada: {d['name']} (ID={d['id']})")
            else:
                print(f"  ✗ Error al reactivar {d['name']}: {r_update.text}")
elif not activos and not por_rut:
    print()
    print("❌ No se encontró ningún médico con ese nombre o RUT.")
    print("   Puede que esté registrada con un nombre diferente en la base de datos.")
