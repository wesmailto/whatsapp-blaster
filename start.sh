#!/bin/bash
# ── WhatsApp Blaster — Start Script ──────────────────────────────────────────
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   WhatsApp Blaster                   ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Install node dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies (first time only)…"
  npm install
  echo "✅ Done."
fi

echo "🚀 Starting at http://localhost:5050"
echo "   Press Ctrl+C to stop."
echo ""

# Open browser after a short delay (gives the server time to start)
(sleep 2 && open "http://localhost:5050" 2>/dev/null || xdg-open "http://localhost:5050" 2>/dev/null || true) &

node service.js
