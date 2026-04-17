# Visitadores Médicos — Contexto del Proyecto

Sistema fullstack de gestión de visitadores médicos farmacéuticos. Permite administrar representantes de ventas, médicos, visitas, ventas y comisiones. Orientado al laboratorio **Narma**.

---

## Stack Tecnológico

| Capa | Tecnologías |
|------|-------------|
| **Backend** | FastAPI 0.115.0, SQLAlchemy 2.0.0, Pydantic 2.8.0, Anthropic SDK 0.49.0, Pandas + Openpyxl, Uvicorn |
| **Frontend** | React 18 + TypeScript, Vite, React Router DOM v6, Tailwind CSS, Recharts, FullCalendar, Axios, Lucide React |
| **Base de datos** | SQLite (desarrollo) / PostgreSQL (producción) |
| **Despliegue** | Railway (`railway.json` configurado) |
| **IA** | Claude API (Anthropic) con tool-use |

---

## Estructura del Proyecto

```
visitadores-medicos/
├── backend/
│   └── app/
│       ├── main.py              # Setup, CORS, routers, seed, migraciones en caliente
│       ├── database.py          # SQLAlchemy engine + get_db
│       ├── models.py            # Modelos ORM (ver sección abajo)
│       ├── schemas.py           # Pydantic schemas (in/out)
│       └── routers/
│           ├── business_lines.py
│           ├── reps.py
│           ├── doctors.py
│           ├── visits.py
│           ├── sales.py          # Carga simple + upload-consolidado + normalización
│           ├── cardex.py         # Carga masiva de médicos desde Excel
│           ├── dashboard.py      # Stats, tracking, ranking, nuevos médicos, comisiones
│           ├── ai_agent.py       # Agente IA con Claude + tool-use
│           └── images.py         # Gestión de imágenes de productos (binario en DB)
├── frontend/
│   └── src/
│       ├── App.tsx               # Rutas por rol (admin / rep)
│       ├── api/index.ts          # Cliente Axios centralizado
│       ├── context/AuthContext.tsx
│       ├── types/index.ts
│       ├── components/
│       │   └── Layout.tsx
│       └── pages/
│           ├── AdminLogin.tsx
│           ├── RepLogin.tsx
│           ├── Login.tsx          # Redirect a /visitador
│           ├── AIAgent.tsx        # Chat con agente IA (admin + rep)
│           ├── KnowledgeBase.tsx  # Base de conocimiento
│           └── admin/
│               ├── Dashboard.tsx
│               ├── Reps.tsx
│               ├── RepDetail.tsx  # Vista detallada de un visitador (semana/mes)
│               ├── Doctors.tsx
│               ├── BusinessLines.tsx
│               ├── AdminCalendar.tsx
│               ├── Tracking.tsx
│               ├── CardexUpload.tsx
│               ├── SalesUpload.tsx
│               ├── Images.tsx
│               ├── SalesRanking.tsx
│               ├── NewDoctors.tsx
│               └── RepCommissions.tsx
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
| `ImageFile` | `image_files` | Imágenes de productos almacenadas como binario en DB con categoría y línea de negocio |

### Migraciones en caliente (`main.py → run_migrations`)

Se ejecutan automáticamente al arrancar el servidor. Agregan columnas si no existen:
- `sales`: `rut_doctor`, `rut_paciente`, `nombre_paciente`, `categoria`, `external_id`
- `doctors`: `rut`, `medical_center`, `city`, `commune`
- Índices únicos/parciales para `external_id`, `rut_doctor`, `rut` de doctors

---

## API Endpoints Principales

### `/api/sales`
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/sales/` | Lista las últimas 500 ventas |
| `POST` | `/api/sales/upload` | Carga simple por nombre de médico (legacy) |
| `POST` | `/api/sales/upload-consolidado` | **Carga avanzada**: RUT doctor/paciente, deduplicación por `external_id`, normalización automática en background |
| `POST` | `/api/sales/normalize-doctors` | Fusión manual de médicos duplicados (también corre automático post-carga) |
| `GET` | `/api/sales/uploads/last` | Última carga registrada |
| `GET` | `/api/sales/summary` | Total de ventas y visitas por médico |

### `/api/dashboard`
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/dashboard/stats` | KPIs generales: doctores, reps activos, visitas del día/semana |
| `GET` | `/api/dashboard/today` | Visitas de hoy con doctor y rep |
| `GET` | `/api/dashboard/visits-by-rep` | Visitas del mes por visitador |
| `GET` | `/api/dashboard/sales-by-business-line` | Distribución de ventas por línea de negocio |
| `GET` | `/api/dashboard/daily-tracking?date=` | Completitud de visitas por visitador para una fecha |
| `GET` | `/api/dashboard/rep/{id}/stats` | Stats personales de un rep |
| `GET` | `/api/dashboard/rep/{id}/detail` | Detalle de visitas semana + mes de un rep |
| `GET` | `/api/dashboard/doctor-ranking?month=&year=` | Ranking de médicos por unidades vendidas en el mes |
| `GET` | `/api/dashboard/new-doctors?month=&year=` | Médicos que prescriben por primera vez en el período |
| `GET` | `/api/dashboard/sales-by-doctor?month=&year=&top=` | Mes actual vs anterior por médico (top N) |
| `GET` | `/api/dashboard/rep-commissions?month=&year=` | Comisiones por rep: ventas, médicos nuevos, detalle por doctor y categoría |

### Otros routers
- `/api/reps` — CRUD de visitadores
- `/api/doctors` — CRUD de médicos
- `/api/visits` — CRUD de visitas
- `/api/business-lines` — CRUD de líneas de negocio
- `/api/cardex/upload` — Carga masiva de médicos desde Excel
- `/api/agent` — Chat con agente IA (Claude)
- `/api/images` — CRUD de imágenes de productos (almacenamiento binario en DB)

---

## Inferencia de Categorías de Producto

La función `_infer_categoria` (en `sales.py`) clasifica ventas por palabras clave en el nombre del producto o en el `tipo_producto`. Orden de prioridad:

1. **Producto Terminado** — marcas comerciales: `hormogel`, `lenzetto`, `estreva`, `duphaston`, `progendo`, etc.
2. **Pelo** — `minoxidil`, `finasteride`, `dutasteride`
3. **Fertilidad** — `clomifeno`, `coenzima q10`, `coq10`
4. **Cannabis Medicinal** — `cbd`, `thc`, `cannabis`, `vaporizable`, `aceite sublingual`, etc.
5. **Hormonas** — `testosterona`, `progesterona`, `dhea`, `estradiol`, `estriol`, `trh`
6. **Dermatología** — `derma`, `retinol`, `ácido hialurónico`
7. **Control de Peso** — `semaglutida`, `ozempic`, `saxenda`, `tirzepatida`
8. **Suero Terapia** — `suero`, `glutatión`, `vitamina c/d`, `b12`
9. Si `tipo_producto` contiene `magistral` → **Cannabis Medicinal** (por defecto Narma)

---

## Normalización de Médicos Duplicados (`_run_normalization`)

Se ejecuta en background automáticamente tras cada `upload-consolidado`. También disponible manualmente vía `POST /api/sales/normalize-doctors`.

### Pasos:
1. Agrupa todas las ventas por RUT doctor normalizado (sin puntos/guiones)
2. Calcula el nombre canónico, `doctor_id` y RUT más frecuentes por RUT normalizado
3. Actualiza ventas con nombre/RUT/doctor_id canónico
4. Fusiona médicos duplicados **por RUT** en la tabla `doctors` (desactiva los duplicados)
5. Fusiona médicos duplicados **por nombre** (para doctors sin RUT)
6. Sincroniza RUT entre tablas: `ventas → doctors` y `doctors → ventas`

---

## Funcionalidades por Rol

### Admin
- **Dashboard** — KPIs generales, visitas del día, distribución por línea de negocio, visitas por rep
- **Visitadores** — CRUD, activar/desactivar, vista detallada con semana/mes
- **Médicos** — CRUD, filtros por rep y línea de negocio
- **Líneas de negocio** — CRUD con color personalizado
- **Calendario** — Calendario global de visitas (todos los reps), FullCalendar
- **Tracking diario** — Completitud de visitas por rep y fecha
- **Carga Cardex** — Excel con médicos (crea o actualiza)
- **Carga Ventas** — Consolidado normalizado con deduplicación automática y match por RUT
- **Ranking de médicos** — Unidades vendidas mes actual vs anterior por médico
- **Médicos nuevos** — Primera prescripción en el período seleccionado
- **Comisiones** — Resumen por visitador: ventas totales, médicos activos, médicos nuevos, desglose por categoría y detalle por médico
- **Imágenes** — Upload y gestión de imágenes de productos por línea de negocio
- **Agente IA** — Chat con Claude para consultas sobre visitas y médicos
- **Base de conocimiento** — Documentación interna

### Visitador (Rep)
- **Dashboard personal** — Métricas propias: médicos, visitas del día/semana/mes, tasa de completitud
- **Calendario personal** — Visitas propias, FullCalendar
- **Mis médicos** — Lista de médicos asignados
- **Agente IA** — Chat con Claude (tools: ver visitas, agendar, completar, actualizar)

---

## Agente IA (Claude)

- Usa Anthropic SDK con **tool-use**
- Tools disponibles: `get_my_visits`, `get_my_doctors`, `schedule_visit`, `complete_visit`, `update_visit`
- System prompt en español
- Disponible para admin y reps desde el mismo componente `AIAgent.tsx`

---

## Autenticación

- Portales separados: `/admin-login` y `/visitador`
- Sin JWT; sesión manejada por `AuthContext` (React Context + localStorage)
- Protección de rutas por rol vía `PrivateRoute` component

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

## Despliegue en Railway

Configurado via `railway.json`. Base de datos PostgreSQL en producción (se detecta automáticamente por `DATABASE_URL`). La variable de entorno `ANTHROPIC_API_KEY` es requerida para el agente IA.

---

*Última actualización: 2026-04-16*
