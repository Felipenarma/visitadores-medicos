#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "🔓 Eliminando locks..."
rm -f .git/index.lock .git/HEAD.lock

echo "📦 Agregando archivos..."
git add -A

echo "💾 Commiteando..."
git commit -m "feat: sessions, efectividad, tracking, recategorize"

echo "🚀 Subiendo a GitHub/Railway..."
git push origin main

echo "🌐 Desplegando frontend en Vercel..."
cd frontend && npx vercel --prod

echo "✅ Deploy completo"
