"""
Carga la agenda de visitas de Angelo (rep_id=3) en la app.
Crea médicos que no existen y programa una visita para cada uno.
Ejecutar: python3 cargar_agenda_angelo.py
"""
import urllib.request
import urllib.parse
import json
import time

class requests:
    @staticmethod
    def get(url, params=None, timeout=15):
        if params:
            url += "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return type("R", (), {"status_code": r.status, "json": lambda self=None, b=r.read(): json.loads(b), "text": r.read().decode()})()
    @staticmethod
    def post(url, json=None, timeout=15):
        data = __import__("json").dumps(json).encode()
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read()
                return type("R", (), {"status_code": r.status, "json": lambda self=None, b=body: __import__("json").loads(b), "text": body.decode()})()
        except urllib.error.HTTPError as e:
            body = e.read()
            return type("R", (), {"status_code": e.code, "json": lambda self=None, b=body: __import__("json").loads(b), "text": body.decode()})()
    @staticmethod
    def put(url, json=None, timeout=10):
        data = __import__("json").dumps(json).encode()
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="PUT")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return type("R", (), {"status_code": r.status})()
        except urllib.error.HTTPError as e:
            return type("R", (), {"status_code": e.code})()


BASE = "https://web-production-496eb.up.railway.app/api"
REP_ID = 3  # Angelo

# 35 médicos de la agenda Junio 2026
MEDICOS = [
    {"name": "Monica Tupper Bracho",      "specialty": "Ginecología / Cirugía Estética", "address": "Kennedy 9001 / Larraín 5862", "city": "Las Condes",    "phone": "+56 9 9219 3006", "email": None},
    {"name": "Trinidad Barriga Martinez", "specialty": "Dermatología",                   "address": "Kennedy 5413",                "city": "Las Condes",    "phone": "+56 600 718 6000","email": None},
    {"name": "Leonardo Espindola Silva",  "specialty": "Traumatología",                  "address": "Kennedy 5413-B",              "city": "Las Condes",    "phone": None,              "email": None},
    {"name": "Felipe Mardones Valdivieso","specialty": "Traumatología / Ortopedia",      "address": "Av. Plaza 2501 Piso 4",       "city": "Las Condes",    "phone": "+56 22 618 3100", "email": None},
    {"name": "Paula Giancaman",           "specialty": "Dermatología",                   "address": "Kennedy 5757 T. Oriente Of. 1502","city": "Las Condes","phone": None,              "email": None},
    {"name": "Jacqueline Nasra Nasra",    "specialty": "Ginecología",                    "address": "Kennedy 9001 4° piso",        "city": "Las Condes",    "phone": "600 636 6666",    "email": None},
    {"name": "Mauricio Cuello Fredes",    "specialty": "Ginecología / Oncología",        "address": "Apoquindo 3990 Of. 808",      "city": "Las Condes",    "phone": "+562 2207 0333",  "email": None},
    {"name": "Camila Candales Landa",     "specialty": "Dermatología",                   "address": "Lo Fontecilla 101 T-A Of. 613","city": "Las Condes",   "phone": "+56 9 7601 5350", "email": None},
    {"name": "Angie Vergara Rivera",      "specialty": "Neurología",                     "address": "Nevería 4444",                "city": "Las Condes",    "phone": "+56 22 676 7000", "email": None},
    {"name": "Veronica Vial Letelier",    "specialty": "Nutrición / Dietética",          "address": "Av. La Dehesa 1880",          "city": "Lo Barnechea",  "phone": "+56 9 2623 3604", "email": "contacto@clinicamaat.cl"},
    {"name": "Maria Soledad Aspillaga V.","specialty": "Endocrinología",                 "address": "Lo Barnechea / Vitacura",     "city": "Lo Barnechea",  "phone": None,              "email": None},
    {"name": "Vicky Roizen Gottlieb",     "specialty": "Dermatología",                   "address": "La Dehesa 1201 Of. 403",      "city": "Lo Barnechea",  "phone": "22946 1339",      "email": "vickyroizen@gmail.com"},
    {"name": "Maria Soledad Velasco Larach","specialty":"Reumatología",                  "address": "Av. Manquehue Norte 1410",    "city": "Vitacura",      "phone": None,              "email": None},
    {"name": "Rene Salinas",              "specialty": "Dermatología",                   "address": "Av. Manquehue Norte 1410",    "city": "Vitacura",      "phone": None,              "email": None},
    {"name": "Romina Milena Tarletta",    "specialty": "Ginecología",                    "address": "Av. Manuel Montt 427",        "city": "Providencia",   "phone": "+56 2 2721 4000", "email": None},
    {"name": "Patricio Vasquez",          "specialty": "Urología",                       "address": "Santa María 1810",            "city": "Providencia",   "phone": "+56 2 2362 5555", "email": None},
    {"name": "Berta Alcala",              "specialty": "Dermatología",                   "address": "Antonio Bellet 77 Of. 202",   "city": "Providencia",   "phone": "+56 2 3340 1759", "email": None},
    {"name": "Aida Manzano Chirinos",     "specialty": "Gastroenterología",              "address": "Av. Bulnes 95",               "city": "Providencia",   "phone": "226985221",       "email": None},
    {"name": "Santiago Garcia Pando",     "specialty": "Dermatología",                   "address": "Pedro de Valdivia s/n",       "city": "Providencia",   "phone": None,              "email": None},
    {"name": "Alejandra Catalan",         "specialty": "Ginecología",                    "address": "Irarrázaval 2305",            "city": "Ñuñoa",         "phone": "+56 600 718 6000","email": None},
    {"name": "Berta Alcala",              "specialty": "Dermatología",                   "address": "Paseo Ahumada 312 Of. 239",   "city": "Santiago",      "phone": "+56 2 3291 4662", "email": None},
    {"name": "Carlos Beller Velasco",     "specialty": "Cirugía Plástica",              "address": "Moneda 1040 Dpto 706",        "city": "Santiago",      "phone": None,              "email": None},
    {"name": "David Godoy Sánchez",       "specialty": "Urología",                       "address": "Barcelona 85",                "city": "Santiago",      "phone": "+56 600 636 6666","email": None},
    {"name": "Angie Vergara Rivera",      "specialty": "Neurología",                     "address": "Lira 85",                     "city": "Santiago",      "phone": "+56 22 676 7000", "email": None},
    {"name": "Macarena Droguett Eterovic","specialty": "Tricología",                     "address": "Av. Apoquindo 6410 Of. 602", "city": "Santiago",      "phone": "+56 2 2789 4745", "email": None},
    {"name": "Sandra Hernandez Chavez",   "specialty": "Medicina General",               "address": None,                          "city": "Santiago",      "phone": None,              "email": None},
    {"name": "Juan Pablo Donoso Coppa",   "specialty": "Neurología",                     "address": "Av. Los Castaños 1550",       "city": "Viña del Mar",  "phone": None,              "email": None},
    {"name": "Veronica Chamy Picó",       "specialty": "Oncología / Hematología",        "address": "Anabaena 336 3° piso",        "city": "Viña del Mar",  "phone": None,              "email": None},
    {"name": "Javiera Zuñiga Fuentes",    "specialty": "Ginecología",                    "address": None,                          "city": "Valparaíso",    "phone": "+56 600 718 6000","email": None},
    {"name": "Dania Acuña",               "specialty": "Medicina General / MFF",         "address": "Balmaceda 1785 Of. 216",      "city": "La Serena",     "phone": None,              "email": None},
    {"name": "Diego Ruiz Cifuentes",      "specialty": "Medicina General",               "address": "General Cruz 1500",           "city": "Yumbel",        "phone": None,              "email": None},
    {"name": "Cindy Araneda Zapata",      "specialty": "Medicina Estética",              "address": "Cochrane s/n",                "city": "Concepción",    "phone": None,              "email": None},
    {"name": "Florencia Berrios Quijada", "specialty": "Medicina General",               "address": None,                          "city": "Biobío",        "phone": None,              "email": None},
    {"name": "Angelica Gaedicke Schmidt", "specialty": "Pediatría / Neurología Inf.",   "address": "Av. Vicente Pérez Rosales 1881","city":"Puerto Varas",  "phone": "65-223 1050",     "email": None},
    {"name": "Karla Galvez Ramirez",      "specialty": "Medicina General",               "address": "Av. Diego Portales 450",      "city": "Puerto Montt",  "phone": "600 401 2600",    "email": None},
]

# Fechas de visita: distribuidas en las próximas 4 semanas (lunes a viernes)
import datetime
def next_business_days(start_date, count):
    dates = []
    d = start_date
    while len(dates) < count:
        if d.weekday() < 5:  # lunes a viernes
            dates.append(d)
        d += datetime.timedelta(days=1)
    return dates

start = datetime.date(2026, 7, 7)  # próximo lunes
visit_dates = next_business_days(start, len(MEDICOS))

created = 0
skipped = 0
errors = 0

for i, med in enumerate(MEDICOS):
    date_str = visit_dates[i].isoformat()
    print(f"\n[{i+1}/{len(MEDICOS)}] {med['name']} → visita {date_str}")

    # 1. Buscar si el médico ya existe
    try:
        r = requests.get(f"{BASE}/doctors/", params={"search": med["name"]}, timeout=15)
        existing = r.json()
    except Exception as e:
        print(f"  ❌ Error buscando: {e}")
        errors += 1
        continue

    # Buscar coincidencia exacta de nombre
    doctor_id = None
    for doc in existing:
        if doc["name"].strip().lower() == med["name"].strip().lower() and doc.get("is_active"):
            doctor_id = doc["id"]
            print(f"  ✓ Ya existe (ID {doctor_id})")
            # Asignar a Angelo si no tiene rep
            if not doc.get("rep_id"):
                requests.put(f"{BASE}/doctors/{doctor_id}", json={"rep_id": REP_ID}, timeout=10)
                print(f"  → Asignado a Angelo")
            break

    # 2. Crear si no existe
    if not doctor_id:
        payload = {
            "name":      med["name"],
            "specialty": med["specialty"],
            "address":   med["address"],
            "phone":     med["phone"],
            "email":     med["email"],
            "rep_id":    REP_ID,
            "is_active": True,
            "visit_frequency": 30,
        }
        try:
            r = requests.post(f"{BASE}/doctors/", json=payload, timeout=15)
            if r.status_code in (200, 201):
                doctor_id = r.json()["id"]
                print(f"  ✅ Creado (ID {doctor_id})")
                created += 1
            else:
                print(f"  ❌ Error creando: {r.status_code} {r.text[:100]}")
                errors += 1
                continue
        except Exception as e:
            print(f"  ❌ Excepción creando: {e}")
            errors += 1
            continue

    # 3. Programar visita
    visit_payload = {
        "doctor_id":      doctor_id,
        "rep_id":         REP_ID,
        "scheduled_date": date_str,
        "status":         "scheduled",
        "notes":          f"Agenda Junio 2026 — {med['city']}",
    }
    try:
        r = requests.post(f"{BASE}/visits/", json=visit_payload, timeout=15)
        if r.status_code in (200, 201):
            print(f"  📅 Visita programada para {date_str}")
        else:
            print(f"  ⚠️  Visita no creada: {r.status_code} {r.text[:100]}")
    except Exception as e:
        print(f"  ❌ Error visita: {e}")

    time.sleep(0.2)  # evitar sobrecarga

print(f"\n{'='*50}")
print(f"✅ Creados: {created} médicos nuevos")
print(f"⏭️  Ya existían: {len(MEDICOS) - created - errors}")
print(f"❌ Errores: {errors}")
print(f"📅 Visitas programadas desde {visit_dates[0]} hasta {visit_dates[-1]}")
