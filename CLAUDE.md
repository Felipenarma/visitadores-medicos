# Visitadores Médicos — Contexto del Proyecto

Sistema fullstack de gestión de visitadores médicos farmacéuticos. Permite administrar representantes de ventas, médicos, visitas, ventas y comisiones. Orientado al laboratorio **Narma**.

---

## Stack Tecnológico

| Capa | Tecnologías |
|------|-------------|
| **Backend** | FastAPI 0.115.0, SQLAlchemy 2.0.0, Pydantic 2.8.0, Anthropic SDK 0.49.0, Pandas + Openpyxl, APScheduler 3.10.4, Uvicorn |
| **Frontend** | React 18 + TypeScript, Vite, React Router DOM v6, Tailwind CSS, Recharts, FullCalendar, Axios, Lucide React |
| **Base de datos** | SQLite (desarrollo) / PostgreSQL (producción) |
| **Despliegue** | Backend: Railway (`railway.json`). Frontend: Vercel (`frontend/vercel.json`) |
| **IA** | Claude API (Anthropic) — modelo `claude-sonnet-4-5` con tool-use |

---

## Estructura del Proyecto

```
visitadores-medicos/
├── backend/
│   └── app/
│       ├── main.py              # Setup, CORS, routers, seed, migraciones en caliente, APScheduler
│       ├── database.py          # SQLAlchemy engine + get_db
│       ├── models.py            # Modelos ORM (ver sección abajo)
│       ├── schemas.py           # Pydantic schemas (in/out)
│       └── routers/
│           ├── business_lines.py
│           ├── reps.py
│           ├── doctors.py       # Búsqueda de RUT con normalización Python (sin/con guión)
│           ├── visits.py
│           ├── sales.py         # Carga simple + upload-consolidado + normalización
│           ├── cardex.py        # Carga masiva de médicos desde Excel
│           ├── dashboard.py     # Stats, tracking, ranking, nuevos médicos, comisiones
│           ├── ai_agent.py      # Agente IA visitadores — tools: visitas, médicos, knowledge, images
│           ├── mike.py          # Agente Mike (admin) — tools: dashboard, ventas, Excel export, reporte semanal
│           ├── images.py        # Gestión de imágenes/QR (binario en DB)
│           └── knowledge.py     # Base de conocimiento — CRUD + upload archivos (PDF/Excel/CSV/Word)
├── frontend/
│   └── src/
│       ├── App.tsx               # Rutas por rol (admin / rep)
│       ├── api/index.ts          # Cliente Axios centralizado (baseURL=/api)
│       ├── context/AuthContext.tsx
│       ├── types/index.ts
│       ├── components/
│       │   └── Layout.tsx
│       └── pages/
│           ├── AdminLogin.tsx
│           ├── RepLogin.tsx
│           ├── AIAgent.tsx        # Chat agente visitadores (admin + rep)
│           ├── KnowledgeBase.tsx  # Base de conocimiento con botón Re-procesar archivos
│           └── admin/
│               ├── Dashboard.tsx
│               ├── Reps.tsx
│               ├── RepDetail.tsx
│               ├── Doctors.tsx    # Analítica de ventas con gráfico comparativo mes/mes anterior
│               ├── BusinessLines.tsx
│               ├── AdminCalendar.tsx
│               ├── Tracking.tsx
│               ├── CardexUpload.tsx
│               ├── SalesUpload.tsx
│               ├── Images.tsx
│               ├── SalesRanking.tsx   # Bloqueado: no navega a meses futuros
│               ├── NewDoctors.tsx     # Bloqueado: no navega a meses futuros
│               ├── RepCommissions.tsx # Bloqueado: no navega a meses futuros
│               └── Mike.tsx           # Chat Mike: charts, export Excel, localStorage persistence
│           └── rep/
│               ├── RepDashboard.tsx
│               ├── RepCalendar.tsx
│               └── RepDoctors.tsx
├── start.sh
└── railway.json
```

---

## Modelos de Base de Datos

| Modelo | Tabla | Descripción |
|--------|-------|-------------|
| `BusinessLine` | `business_lines` | Líneas de producto con nombre, color y descripción |
| `MedicalRep` | `medical_reps` | Visitadores: nombre, email, teléfono, territorio, zona, activo/inactivo |
| `Doctor` | `doctors` | Médicos: nombre, RUT (indexado), especialidad, dirección, teléfono, correo, frecuencia de visita, rep asignado, línea de negocio |
| `Visit` | `visits` | Visitas: `scheduled` / `completed` / `missed` / `cancelled`. Vinculada a doctor y rep |
| `Sale` | `sales` | Ventas: producto, monto, fecha, doctor vinculado, RUT doctor, RUT paciente, categoría, `external_id` único para deduplicación |
| `SalesUpload` | `sales_uploads` | Tracking de cada carga masiva de ventas |
| `CardexUpload` | `cardex_uploads` | Tracking de cada carga masiva de médicos |
| `KnowledgeEntry` | `knowledge_entries` | Base de conocimiento: título, categoría, contenido extraído, línea de negocio |
| `ImageFile` | `image_files` | Imágenes/QR almacenados como binario en DB con categoría y línea de negocio |

### Migraciones en caliente (`main.py → run_migrations`)

Se ejecutan automáticamente al arrancar. Agregan columnas si no existen:
- `sales`: `rut_doctor`, `rut_paciente`, `nombre_paciente`, `categoria`, `external_id`
- `doctors`: `rut`, `medical_center`, `city`, `commune`
- Índices únicos/parciales para `external_id`, `rut_doctor`, `rut` de doctors

---

## API Endpoints Principales

### `/api/knowledge`
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/knowledge` | Lista entradas activas (filtro opcional por categoría) |
| `GET` | `/api/knowledge/categories` | Categorías: productos, protocolos, faq, general, archivo |
| `POST` | `/api/knowledge` | Crear entrada manual |
| `PUT` | `/api/knowledge/{id}` | Actualizar entrada |
| `DELETE` | `/api/knowledge/{id}` | Eliminar entrada |
| `POST` | `/api/knowledge/upload` | Subir archivo único (PDF/Excel/CSV/Word/TXT) |
| `POST` | `/api/knowledge/upload-multiple` | Subir múltiples archivos |
| `POST` | `/api/knowledge/{id}/reprocess` | Re-extraer contenido de un archivo nuevo |

### `/api/images`
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/images` | Lista imágenes/QR (filtro opcional por categoría: qr/product/general) |
| `POST` | `/api/images` | Subir imagen (PNG/JPG/GIF/WebP/SVG, máx 5MB) |
| `GET` | `/api/images/{id}/file` | Servir imagen binaria |
| `DELETE` | `/api/images/{id}` | Eliminar imagen |

### `/api/mike`
| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/mike/chat` | Chat con agente Mike (admin) |
| `GET` | `/api/mike/export/{token}` | Descargar Excel generado por Mike (token efímero en RAM) |
| `POST` | `/api/mike/weekly-report` | Dispara reporte semanal por email (también corre automático lunes 8am Chile) |

### `/api/agent`
| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/agent/chat` | Chat con agente visitadores (rep + admin) |

### `/api/sales`
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/sales/` | Lista las últimas 500 ventas |
| `POST` | `/api/sales/upload` | Carga simple por nombre de médico (legacy) |
| `POST` | `/api/sales/upload-consolidado` | **Carga avanzada**: RUT doctor/paciente, deduplicación por `external_id`, normalización automática en background |
| `POST` | `/api/sales/normalize-doctors` | Fusión manual de médicos duplicados |
| `GET` | `/api/sales/uploads/last` | Última carga registrada |
| `GET` | `/api/sales/summary` | Total de ventas y visitas por médico |

### `/api/dashboard`
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/dashboard/stats` | KPIs generales |
| `GET` | `/api/dashboard/today` | Visitas de hoy |
| `GET` | `/api/dashboard/visits-by-rep` | Visitas del mes por visitador |
| `GET` | `/api/dashboard/sales-by-business-line` | Distribución de ventas por línea de negocio |
| `GET` | `/api/dashboard/daily-tracking?date=` | Completitud de visitas por rep y fecha |
| `GET` | `/api/dashboard/rep/{id}/stats` | Stats personales de un rep |
| `GET` | `/api/dashboard/rep/{id}/detail` | Detalle semana + mes de un rep |
| `GET` | `/api/dashboard/doctor-ranking?month=&year=` | Ranking médicos por unidades vendidas |
| `GET` | `/api/dashboard/new-doctors?month=&year=` | Médicos que prescriben por primera vez |
| `GET` | `/api/dashboard/sales-by-doctor?month=&year=&top=` | Mes actual vs anterior por médico |
| `GET` | `/api/dashboard/rep-commissions?month=&year=` | Comisiones por rep |

### Otros routers
- `/api/reps` — CRUD de visitadores
- `/api/doctors` — CRUD de médicos (búsqueda de RUT normalizada: acepta con/sin guión)
- `/api/visits` — CRUD de visitas
- `/api/business-lines` — CRUD de líneas de negocio
- `/api/cardex/upload` — Carga masiva de médicos desde Excel

---

## Agentes IA

### Agente Visitadores (`ai_agent.py` → `/api/agent/chat`)
Agente para visitadores y admin. Tools disponibles:
- `get_my_visits` — visitas del rep (today/week/upcoming/all)
- `get_my_doctors` — médicos asignados al rep
- `schedule_visit` — programar visita
- `complete_visit` — marcar visita como completada
- `get_doctor_info` — info detallada de un médico
- `search_knowledge` — busca en base de conocimiento (con fallback: si no hay match devuelve todas las entradas activas)
- `search_images` — busca imágenes y QR, devuelve URL directa para compartir

**Importante:** `search_knowledge` y `search_images` tienen fallback automático — si el query no hace match exacto en la DB, devuelven todas las entradas/imágenes disponibles para que el agente siempre tenga contexto.

### Agente Mike (`mike.py` → `/api/mike/chat`)
Agente ejecutivo para admin. Tools disponibles:
- `get_dashboard_overview` — KPIs del día/semana/mes
- `get_all_reps_summary` — resumen de visitadores con tasa de cumplimiento
- `get_doctor_ranking` — ranking de médicos por ventas
- `get_new_doctors` — médicos que prescriben por primera vez
- `get_monthly_trend` — tendencia de ventas últimos N meses
- `get_rep_commissions` — comisiones por visitador
- `export_to_excel` — genera Excel descargable (token efímero en `_export_store` en RAM)

Mike además genera **charts** automáticamente en el chat (Recharts bar/line) y tiene **persistencia en localStorage**.

**Reporte semanal automático:** APScheduler dispara `POST /api/mike/weekly-report` cada lunes 8am hora Chile.

---

## Base de Conocimiento (`knowledge.py`)

Extracción de contenido de archivos:
- **Excel/CSV** → función `_df_to_readable()`: genera `[Registro N] Col: val | Col: val` (max 300 filas por hoja, todas las hojas)
- **PDF** → extracción página por página con pypdf (instalado en Railway)
- **Word (.docx)** → extracción de XML interno
- **TXT/MD/JSON** → texto plano

Los PDFs de brochures Narma están cargados como entradas en categoría `productos`:
- Crema Base HRT (ID 7)
- DHEA (ID 8)
- Coenzima Q10 (ID 9)
- Testosterona (ID 10)
- Control de Peso (ID 11)
- Dermatología (ID 12)

Los QR de Narma están en `/api/images`:
- QR Laboratorio (ID 4)
- QR Control de Peso (ID 3)
- QR Dermatología (ID 2)
- QR Hormonas (ID 1)

---

## Inferencia de Categorías de Producto

La función `_infer_categoria` (en `sales.py`) clasifica ventas por palabras clave. Orden de prioridad:

1. **Producto Terminado** — `hormogel`, `lenzetto`, `estreva`, `duphaston`, `progendo`, etc.
2. **Pelo** — `minoxidil`, `finasteride`, `dutasteride`
3. **Fertilidad** — `clomifeno`, `coenzima q10`, `coq10`
4. **Cannabis Medicinal** — `cbd`, `thc`, `cannabis`, `vaporizable`, `aceite sublingual`, etc.
5. **Hormonas** — `testosterona`, `progesterona`, `dhea`, `estradiol`, `estriol`, `trh`
6. **Dermatología** — `derma`, `retinol`, `ácido hialurónico`
7. **Control de Peso** — `semaglutida`, `ozempic`, `saxenda`, `tirzepatida`
8. **Suero Terapia** — `suero`, `glutatión`, `vitamina c/d`, `b12`
9. Si `tipo_producto` contiene `magistral` → **Cannabis Medicinal**

---

## Normalización de Médicos Duplicados (`_run_normalization`)

Se ejecuta en background automáticamente tras cada `upload-consolidado`.

### Pasos:
1. Agrupa ventas por RUT doctor normalizado (sin puntos/guiones)
2. Calcula nombre canónico, `doctor_id` y RUT más frecuentes
3. Actualiza ventas con valores canónicos
4. Fusiona médicos duplicados por RUT (desactiva duplicados)
5. Fusiona médicos duplicados por nombre (para doctors sin RUT)
6. Sincroniza RUT entre tablas

---

## Funcionalidades por Rol

### Admin
- Dashboard, Visitadores, Médicos, Líneas de negocio, Calendario global
- Tracking diario, Carga Cardex, Carga Ventas
- Ranking de médicos (bloqueado en mes actual, no navega al futuro)
- Médicos nuevos (bloqueado en mes actual)
- Comisiones (bloqueado en mes actual)
- Imágenes/QR — upload y gestión
- **Mike** — agente IA ejecutivo con charts y export Excel
- **Base de conocimiento** — documentos/brochures con botón Re-procesar
- **Agente IA visitadores** — misma interfaz que los reps

### Visitador (Rep)
- Dashboard personal, Calendario personal, Mis médicos
- **Agente IA** — gestión de visitas + consulta de base de conocimiento + compartir QR/imágenes

---

## Autenticación

- Portales separados: `/admin-login` y `/visitador`
- Sin JWT; sesión manejada por `AuthContext` (React Context + localStorage)
- Protección de rutas por rol vía `PrivateRoute`

---

## Rutas del Frontend

| Ruta | Componente | Rol |
|------|-----------|-----|
| `/admin-login` | AdminLogin | — |
| `/visitador` | RepLogin | — |
| `/admin/dashboard` | Dashboard | admin |
| `/admin/reps` | Reps | admin |
| `/admin/reps/:id` | RepDetail | admin |
| `/admin/doctors` | Doctors | admin |
| `/admin/business-lines` | BusinessLines | admin |
| `/admin/calendar` | AdminCalendar | admin |
| `/admin/tracking` | Tracking | admin |
| `/admin/cardex` | CardexUpload | admin |
| `/admin/sales` | SalesUpload | admin |
| `/admin/sales-ranking` | SalesRanking | admin |
| `/admin/new-doctors` | NewDoctors | admin |
| `/admin/commissions` | RepCommissions | admin |
| `/admin/images` | Images | admin |
| `/admin/agent` | AIAgent | admin |
| `/admin/knowledge` | KnowledgeBase | admin |
| `/admin/mike` | Mike | admin |
| `/rep/dashboard` | RepDashboard | rep |
| `/rep/calendar` | RepCalendar | rep |
| `/rep/doctors` | RepDoctors | rep |
| `/rep/agent` | AIAgent | rep |

---

## Líneas de Negocio (seed automático al arrancar)

| Nombre | Color |
|--------|-------|
| Cannabis Medicinal | `#10B981` (verde) |
| Hormonas | `#8B5CF6` (púrpura) |
| Dermatología | `#F59E0B` (ámbar) |
| Control de Peso | `#EF4444` (rojo) |
| Suero Terapia | `#3B82F6` (azul) |

---

## Cómo correr el proyecto

```bash
# Desde la raíz del proyecto
./start.sh

# O manualmente:

# Backend (puerto 8000)
cd backend
uvicorn app.main:app --reload

# Frontend (puerto 5173)
cd frontend
npm run dev
```

### Seed de datos de prueba
```
POST /api/seed
```
Crea 3 reps, 10 médicos y visitas para los últimos 3 meses y próximos 3 meses.

---

## Despliegue

- **Backend:** Railway — `railway up --service web`
- **Frontend:** Vercel — `cd frontend && npx vercel --prod`
- Variable de entorno requerida: `ANTHROPIC_API_KEY` (sin espacios ni saltos de línea)
- PostgreSQL se detecta automáticamente por `DATABASE_URL`

---

## Notas Técnicas Importantes

- **ANTHROPIC_API_KEY**: debe hacer `.strip()` al leerla — Railway puede agregar `\n` al final
- **Modelo Claude**: `claude-sonnet-4-5` (sin sufijo de fecha)
- **export_url de Mike**: es relativa a `/api` (ej: `/mike/export/{token}`). El axios tiene `baseURL=/api` así que NO incluir `/api` en la URL
- **_export_store**: dict en RAM — los tokens de Excel se pierden si Railway reinicia el servidor. Si falla la descarga, pedir a Mike que regenere el Excel
- **Búsqueda de RUT**: normalización Python con `re.sub(r'[\.\-\s]', '', rut).upper()` — funciona con y sin guión/puntos
- **pypdf**: instalado en Railway para extracción de PDFs página por página

---

*Última actualización: 2026-04-25*
