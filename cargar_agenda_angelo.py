"""
Reagenda visitas de Angelo (rep_id=3): 5 por día, organizadas por zona geográfica.
Carga toda la información de contacto del Excel al crear cada médico.
Ejecutar: python3 cargar_agenda_angelo.py
"""
import urllib.request
import urllib.error
import urllib.parse
import json
import time

BASE = "https://web-production-496eb.up.railway.app/api"
REP_ID = 3  # Angelo

# ─── HTTP helpers ─────────────────────────────────────────────────────────────

def api_get(path, params=None):
    url = BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=15) as r:
        return json.loads(r.read())

def api_post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data,
                                  headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def api_put(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data,
                                  headers={"Content-Type": "application/json"}, method="PUT")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def api_delete(path):
    req = urllib.request.Request(BASE + path, method="DELETE")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code

# ─── Médicos organizados por zona (5 por día) ─────────────────────────────────

AGENDA = [
    # Día 1 — Jul 7 (Lun) — Zona 1: Las Condes / Kennedy / Apoquindo
    [
        {"name": "Monica Tupper Bracho",       "specialty": "Ginecología / Cirugía Estética", "medical_center": "IntegraMédica",                   "address": "Kennedy 9001 / Larraín 5862",     "city": "Las Condes",   "phone": "+56 9 9219 3006",  "email": None},
        {"name": "Trinidad Barriga Martinez",  "specialty": "Dermatología",                   "medical_center": "RedSalud Arauco",                 "address": "Kennedy 5413",                    "city": "Las Condes",   "phone": "+56 600 718 6000", "email": None},
        {"name": "Leonardo Espindola Silva",   "specialty": "Traumatología",                  "medical_center": "Clínica Arauco",                  "address": "Kennedy 5413-B",                  "city": "Las Condes",   "phone": None,               "email": None},
        {"name": "Felipe Mardones Valdivieso", "specialty": "Traumatología / Ortopedia",      "medical_center": "Clínica UANDES",                  "address": "Av. Plaza 2501 Piso 4",           "city": "Las Condes",   "phone": "+56 22 618 3100",  "email": None},
        {"name": "Paula Giancaman",            "specialty": "Dermatología",                   "medical_center": "Clínica Lúmina Skin",             "address": "Kennedy 5757 T. Oriente Of. 1502","city": "Las Condes",   "phone": None,               "email": None},
    ],
    # Día 2 — Jul 8 (Mar) — Zona 1 cont. + Zona 2: Lo Barnechea / La Dehesa
    [
        {"name": "Jacqueline Nasra Nasra",     "specialty": "Ginecología",                    "medical_center": "IntegraMédica Alto Las Condes",   "address": "Kennedy 9001 4° piso",            "city": "Las Condes",   "phone": "600 636 6666",     "email": None},
        {"name": "Mauricio Cuello Fredes",     "specialty": "Ginecología / Oncología",        "medical_center": "Cons. Alcántara",                 "address": "Apoquindo 3990 Of. 808",          "city": "Las Condes",   "phone": "+562 2207 0333",   "email": None},
        {"name": "Camila Candales Landa",      "specialty": "Dermatología",                   "medical_center": "DermAcné",                        "address": "Lo Fontecilla 101 T-A Of. 613",  "city": "Las Condes",   "phone": "+56 9 7601 5350",  "email": None},
        {"name": "Angie Vergara Rivera",       "specialty": "Neurología",                     "medical_center": "UC Christus",                     "address": "Nevería 4444",                    "city": "Las Condes",   "phone": "+56 22 676 7000",  "email": None},
        {"name": "Veronica Vial Letelier",     "specialty": "Nutrición / Dietética",          "medical_center": "Clínica MAAT",                    "address": "Av. La Dehesa 1880",              "city": "Lo Barnechea", "phone": "+56 9 2623 3604",  "email": "contacto@clinicamaat.cl"},
    ],
    # Día 3 — Jul 9 (Mié) — Zona 2 cont. + Zona 3: Vitacura + Zona 4 inicio
    [
        {"name": "Maria Soledad Aspillaga V.", "specialty": "Endocrinología",                 "medical_center": "Clínica Alemana",                 "address": "Lo Barnechea / Vitacura",         "city": "Lo Barnechea", "phone": None,               "email": None},
        {"name": "Vicky Roizen Gottlieb",      "specialty": "Dermatología",                   "medical_center": "Globalderm",                      "address": "La Dehesa 1201 Of. 403",          "city": "Lo Barnechea", "phone": "22946 1339",       "email": "vickyroizen@gmail.com"},
        {"name": "Maria Soledad Velasco Larach","specialty": "Reumatología",                  "medical_center": "Clínica Alemana",                 "address": "Av. Manquehue Norte 1410",        "city": "Vitacura",     "phone": None,               "email": None},
        {"name": "Rene Salinas",               "specialty": "Dermatología",                   "medical_center": "Clínica Alemana Santiago",        "address": "Av. Manquehue Norte 1410",        "city": "Vitacura",     "phone": None,               "email": None},
        {"name": "Romina Milena Tarletta",     "specialty": "Ginecología",                    "medical_center": "C.M. Manuel Montt",               "address": "Av. Manuel Montt 427",            "city": "Providencia",  "phone": "+56 2 2721 4000",  "email": None},
    ],
    # Día 4 — Jul 10 (Jue) — Zona 4: Providencia + Zona 5 inicio
    [
        {"name": "Patricio Vasquez",           "specialty": "Urología",                       "medical_center": "Clínica INDISA",                  "address": "Santa María 1810",                "city": "Providencia",  "phone": "+56 2 2362 5555",  "email": None},
        {"name": "Berta Alcala",               "specialty": "Dermatología",                   "medical_center": "Instituto Dermatológico",         "address": "Antonio Bellet 77 Of. 202",       "city": "Providencia",  "phone": "+56 2 3340 1759",  "email": None},
        {"name": "Aida Manzano Chirinos",      "specialty": "Gastroenterología",              "medical_center": "C.M. Bulnes",                     "address": "Av. Bulnes 95",                   "city": "Providencia",  "phone": "226985221",        "email": None},
        {"name": "Santiago Garcia Pando",      "specialty": "Dermatología",                   "medical_center": "IDERMADOF",                       "address": "Pedro de Valdivia s/n",           "city": "Providencia",  "phone": None,               "email": None},
        {"name": "Alejandra Catalan",          "specialty": "Ginecología",                    "medical_center": "RedSalud Ñuñoa",                  "address": "Irarrázaval 2305",                "city": "Ñuñoa",        "phone": "+56 600 718 6000", "email": None},
    ],
    # Día 5 — Jul 11 (Vie) — Zona 5: Ñuñoa / Santiago Centro
    [
        {"name": "Berta Alcala",               "specialty": "Dermatología",                   "medical_center": "Instituto Dermatológico",         "address": "Paseo Ahumada 312 Of. 239",       "city": "Santiago",     "phone": "+56 2 3291 4662",  "email": None},
        {"name": "Carlos Beller Velasco",      "specialty": "Cirugía Plástica",               "medical_center": "Consulta privada",                "address": "Moneda 1040 Dpto 706",            "city": "Santiago",     "phone": None,               "email": None},
        {"name": "David Godoy Sánchez",        "specialty": "Urología",                       "medical_center": "IntegraMédica Barcelona",         "address": "Barcelona 85",                    "city": "Santiago",     "phone": "+56 600 636 6666", "email": None},
        {"name": "Angie Vergara Rivera",       "specialty": "Neurología",                     "medical_center": "UC Christus",                     "address": "Lira 85",                         "city": "Santiago",     "phone": "+56 22 676 7000",  "email": None},
        {"name": "Macarena Droguett Eterovic", "specialty": "Tricología",                     "medical_center": "Clínica Capilar Unity",           "address": "Av. Apoquindo 6410 Of. 602",      "city": "Santiago",     "phone": "+56 2 2789 4745",  "email": None},
    ],
    # Día 6 — Jul 14 (Lun) — Zona 5 fin + Zona 6: Valparaíso/Viña + Zona 7: La Serena
    [
        {"name": "Sandra Hernandez Chavez",    "specialty": "Medicina General",               "medical_center": "No especificado",                 "address": None,                              "city": "Santiago",     "phone": None,               "email": None},
        {"name": "Juan Pablo Donoso Coppa",    "specialty": "Neurología",                     "medical_center": "Clínica Ciudad del Mar",          "address": "Av. Los Castaños 1550",           "city": "Viña del Mar", "phone": None,               "email": None},
        {"name": "Veronica Chamy Picó",        "specialty": "Oncología / Hematología",        "medical_center": "Clínica Bupa Reñaca",             "address": "Anabaena 336 3° piso",            "city": "Viña del Mar", "phone": None,               "email": None},
        {"name": "Javiera Zuñiga Fuentes",     "specialty": "Ginecología",                    "medical_center": "RedSalud Valparaíso",             "address": None,                              "city": "Valparaíso",   "phone": "+56 600 718 6000", "email": None},
        {"name": "Dania Acuña",                "specialty": "Medicina General / MFF",         "medical_center": "Consulta privada",                "address": "Balmaceda 1785 Of. 216",          "city": "La Serena",    "phone": None,               "email": None},
    ],
    # Día 7 — Jul 15 (Mar) — Zona 8: Biobío + Zona 9: Los Lagos
    [
        {"name": "Diego Ruiz Cifuentes",       "specialty": "Medicina General",               "medical_center": "C.M. San Sebastián",              "address": "General Cruz 1500",               "city": "Yumbel",       "phone": None,               "email": None},
        {"name": "Cindy Araneda Zapata",       "specialty": "Medicina Estética",              "medical_center": "Centro Medistetic",               "address": "Cochrane s/n",                    "city": "Concepción",   "phone": None,               "email": None},
        {"name": "Florencia Berrios Quijada",  "specialty": "Medicina General",               "medical_center": "No especificado",                 "address": None,                              "city": "Biobío",       "phone": None,               "email": None},
        {"name": "Angelica Gaedicke Schmidt",  "specialty": "Pediatría / Neurología Inf.",    "medical_center": "Consulta privada",                "address": "Av. Vicente Pérez Rosales 1881",  "city": "Puerto Varas", "phone": "65-223 1050",      "email": None},
        {"name": "Karla Galvez Ramirez",       "specialty": "Medicina General",               "medical_center": "Clínica Andes Salud",             "address": "Av. Diego Portales 450",          "city": "Puerto Montt", "phone": "600 401 2600",     "email": None},
    ],
]

VISIT_DATES = [
    "2026-07-07",  # Zona 1: Las Condes
    "2026-07-08",  # Zona 1 + 2
    "2026-07-09",  # Zona 2 + 3 + 4
    "2026-07-10",  # Zona 4: Providencia
    "2026-07-11",  # Zona 5: Santiago
    "2026-07-14",  # Zona 6 + 7: Valparaíso / La Serena
    "2026-07-15",  # Zona 8 + 9: Biobío / Los Lagos
]

# ─── 1. Eliminar visitas ya programadas para Angelo desde Jul 7 ───────────────
print("🗑️  Eliminando visitas previas de Angelo desde Jul 7...")
try:
    visits = api_get("/visits/", {"rep_id": REP_ID, "status": "scheduled",
                                   "date_from": "2026-07-07", "date_to": "2026-07-31"})
    for v in visits:
        api_delete(f"/visits/{v['id']}")
    print(f"  Eliminadas: {len(visits)} visitas\n")
except Exception as e:
    print(f"  ⚠️  {e}\n")

# ─── 2. Crear médicos y programar visitas ─────────────────────────────────────
total_created = 0
total_visits  = 0

ZONA_LABELS = [
    "Zona 1 — Las Condes / Kennedy",
    "Zona 1+2 — Las Condes / Lo Barnechea",
    "Zona 2+3+4 — Lo Barnechea / Vitacura / Providencia",
    "Zona 4 — Providencia / Ñuñoa",
    "Zona 5 — Santiago Centro",
    "Zona 6+7 — Valparaíso / La Serena",
    "Zona 8+9 — Biobío / Los Lagos",
]

for day_idx, (date_str, medicos_dia) in enumerate(zip(VISIT_DATES, AGENDA)):
    print(f"📅 {date_str} — {ZONA_LABELS[day_idx]}")

    for med in medicos_dia:
        # Buscar si el médico ya existe
        try:
            results = api_get("/doctors/", {"search": med["name"]})
        except Exception as e:
            print(f"  ❌ Error buscando {med['name']}: {e}")
            continue

        doctor_id = None
        for doc in results:
            if doc["name"].strip().lower() == med["name"].strip().lower() and doc.get("is_active"):
                doctor_id = doc["id"]
                # Actualizar con info completa y asignar a Angelo
                api_put(f"/doctors/{doctor_id}", {
                    "rep_id":         REP_ID,
                    "specialty":      med["specialty"],
                    "medical_center": med["medical_center"],
                    "address":        med["address"],
                    "city":           med["city"],
                    "phone":          med["phone"] or doc.get("phone"),
                    "email":          med["email"] or doc.get("email"),
                })
                print(f"  🔄 Actualizado: {med['name']}")
                break

        if not doctor_id:
            status, body = api_post("/doctors/", {
                "name":           med["name"],
                "specialty":      med["specialty"],
                "medical_center": med["medical_center"],
                "address":        med["address"],
                "city":           med["city"],
                "phone":          med["phone"],
                "email":          med["email"],
                "rep_id":         REP_ID,
                "is_active":      True,
                "visit_frequency": 30,
            })
            if status in (200, 201):
                doctor_id = body["id"]
                total_created += 1
                print(f"  ✅ Creado: {med['name']} ({med['city']})")
            else:
                print(f"  ❌ Error creando {med['name']}: {status} — {str(body)[:80]}")
                continue

        # Programar visita
        status, body = api_post("/visits/", {
            "doctor_id":      doctor_id,
            "rep_id":         REP_ID,
            "scheduled_date": date_str,
            "status":         "scheduled",
            "notes":          f"Agenda Jun 2026 — {med['city']} — {med['medical_center'] or ''}".strip(" —"),
        })
        if status in (200, 201):
            total_visits += 1
        else:
            print(f"  ⚠️  Visita fallida {med['name']}: {status}")

        time.sleep(0.15)
    print()

print("=" * 55)
print(f"✅ Médicos nuevos creados:  {total_created}")
print(f"📅 Visitas programadas:     {total_visits}")
print(f"📆 Del {VISIT_DATES[0]} al {VISIT_DATES[-1]}")
print(f"📊 5 visitas/día · 7 días · organizadas por zona")
