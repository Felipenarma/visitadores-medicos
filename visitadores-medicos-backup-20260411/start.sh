#!/bin/bash

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "================================================"
echo "  Visitadores Médicos - Iniciando aplicación"
echo "================================================"

# Check for .env file in backend
if [ ! -f "$BASE_DIR/backend/.env" ]; then
  echo ""
  echo "⚠️  Archivo .env no encontrado en backend/"
  echo "   Copiando desde .env.example..."
  cp "$BASE_DIR/backend/.env.example" "$BASE_DIR/backend/.env"
  echo ""
  echo "   IMPORTANTE: Edita backend/.env y agrega tu ANTHROPIC_API_KEY"
  echo "   para usar el Agente IA."
  echo ""
fi

# Start backend
echo "▶ Iniciando backend (FastAPI)..."
cd "$BASE_DIR/backend"

# Install dependencies if needed
pip install -r requirements.txt -q 2>&1 | tail -5

# Start uvicorn in background
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID"

# Wait for backend to start
sleep 3

# Start frontend
echo ""
echo "▶ Iniciando frontend (Vite + React)..."
cd "$BASE_DIR/frontend"

# Install npm packages if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
  echo "  Instalando dependencias npm..."
  npm install
fi

npm run dev &
FRONTEND_PID=$!
echo "  Frontend PID: $FRONTEND_PID"

echo ""
echo "================================================"
echo "  ✅ Aplicación iniciada correctamente"
echo ""
echo "  Backend API:  http://localhost:8000"
echo "  Frontend:     http://localhost:5173"
echo "  API Docs:     http://localhost:8000/docs"
echo ""
echo "  Presiona Ctrl+C para detener"
echo "================================================"

# Handle Ctrl+C
cleanup() {
  echo ""
  echo "Deteniendo servicios..."
  kill $BACKEND_PID 2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  echo "¡Hasta luego!"
  exit 0
}
trap cleanup INT TERM

wait
