#!/bin/bash
# Script para empaquetar la aplicación Wooly Wonder

echo "🧹 Limpiando compilaciones anteriores..."
rm -rf dist/ release/

echo "🧶 Iniciando la compilación y empaquetado de Wooly Wonder..."

if [ "$1" == "win" ]; then
  npm run build:win
elif [ "$1" == "linux" ]; then
  npm run build:linux
elif [ "$1" == "win-linux" ]; then
  npm run build:win-linux
elif [ "$1" == "all" ]; then
  npm run build:all
else
  npm run build:electron
fi

echo "✅ ¡Empaquetado completado! Revisa la carpeta 'release' para ver los instaladores."
