#!/usr/bin/env bash
# Rebuild the web panel so the backend can serve it at {BACKEND_URL}/api/panel/
set -e
cd "$(dirname "$0")"
BACKEND_URL=$(grep REACT_APP_BACKEND_URL ../backend/.env | cut -d '=' -f2)
PUBLIC_URL=/api/panel REACT_APP_BACKEND_URL="$BACKEND_URL" GENERATE_SOURCEMAP=false CI=false yarn build
echo "Web panel built → open $BACKEND_URL/api/panel/"
