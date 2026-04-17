# Visitadores Médicos — Contexto del Proyecto

Sistema fullstack de gestión de visitadores médicos farmacéuticos. Permite administrar representantes de ventas, médicos, visitas, ventas y comisiones.

## Stack Tecnológico

**Backend:** FastAPI 0.115.0, SQLAlchemy 2.0.0, Pydantic 2.8.0, Anthropic SDK 0.49.0, Pandas + Openpyxl (Excel), Uvicorn
**Frontend:** React 18 + TypeScript, Vite, React Router DOM, Tailwind CSS, Recharts, FullCalendar, Axios, Lucide React
**Despliegue:** Railway (railway.json configurado), SQLite en dev / PostgreSQL en prod

## Estructura del Proyecto

```
visitadores-medicos/
├── backend/
│   └── app/
│       ├── main.py           # Setup, CORS, routers, endpoint /api/seed
│       ├── database.py       # SQLAlchemy engine
│       ├── models.py         # Modelos ORM
│       ├── schemas.py        # Pydantic schemas
│       └── routers/
│           ├── business_lines.py
│           ├── reps.py
│           ├── doctors.py
│           ├── visits.py
│           ├── sales.py
│           ├── cardex.py
│           ├── dashboard.py
│           ├── agent.py       # Agente IA con Claude
│           └── images.py
├── frontend/
│   └── src/
│       ├── App.tsx            # Rutas por rol (admin/rep)
│       ├── api/index.ts       # Cliente Axios
│       ├── context/AuthContext.tsx
│       ├── types/index.ts
│       └── pages/
│           ├── admin/         # Dashboard, Reps, Doctors, BusinessLines, AdminCalendar,
│           │                  # Tracking, CardexUpload, SalesUpload, Images,
│           │                  # SalesRanking, NewDoctors, RepCommissions
│           ├── rep/           # RepDashboard, RepCalendar, RepDoctors
│           └── (common)       # AIAgent, KnowledgeBase, AdminLogin, RepLogin
├── start.sh
└── railway.json
```

## Modelos de Base de Datos

| Modelo | Descripción |
|--------|-------------|
| `BusinessLine` | Líneas de producto (Cannabis Medicinal, Hormonas, Dermatología…) |
| `MedicalRep` | Representantes con territorio/zona, activar/desactivar |
| `Doctor` | Médicos con especialidad, frecuencia de visita, rep asignado, RUT indexado |
| `Visit` | Visitas: `scheduled`, `completed`, `missed`, `cancelled` |
| `Sale` | Ventas vinculadas a médicos (monto, producto). `external_id` único para evitar duplicados |
| `SalesUpload` | Tracking de cargas masivas de ventas |
| `CardexUpload` | Tracking de cargas masivas de médicos |

## Funcionalidades Implementadas

### Admin
- Dashboard con analytics: visitas del día, stats semanales, tasa de completitud, visitas perdidas
- CRUD completo de representantes, médicos y líneas de negocio
- Calendario de visitas (todos los reps)
- Carga masiva Excel: cardex de médicos y ventas con matching automático
- Tracking diario de completitud por rep y fecha
- Ranking de médicos por ventas
- Listado de médicos nuevos
- Cálculo de comisiones por representante
- Gestión de imágenes de productos

### Representantes
- Dashboard personal con métricas propias
- Calendario personal de visitas
- Lista de médicos asignados

### Agente IA
- Claude API con tool-use (Anthropic SDK)
- Herramientas: `get_my_visits`, `get_my_doctors`, `schedule_visit`, `complete_visit`, `update_visit`
- Prompt del sistema en español

### Autenticación
- Portales separados admin/rep
- Protección de rutas por rol via React Context

## Cómo correr el proyecto

```bash
# Desde la raíz
./start.sh

# O manualmente:
# Backend
cd backend && uvicorn app.main:app --reload

# Frontend
cd frontend && npm run dev
```
