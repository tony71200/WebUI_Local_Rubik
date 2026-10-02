#!/usr/bin/env sh
# Rubik Rings - quick start for Linux.
# Opens dist/index.html in the default browser; builds it first if it is missing.
# Usage: ./run-linux.sh            or   ./run-linux.sh rebuild   (rebuild after updating the code)
set -e
cd "$(dirname "$0")"

if [ "$1" = "rebuild" ] || [ ! -f dist/index.html ]; then
  if ! command -v node >/dev/null 2>&1; then
    echo "[!] Cần Node.js 22.12 trở lên để build lần đầu / Node.js 22.12+ is needed for the first build."
    echo "    Xem / See: https://nodejs.org  (hoặc / or nvm: https://github.com/nvm-sh/nvm)"
    exit 1
  fi
  if ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)"; then
    echo "[!] Node.js quá cũ / Node.js is too old: $(node -v). Cần / Needed: 22.12+"
    exit 1
  fi
  echo "== Cài thư viện / Installing packages (npm ci)..."
  npm ci
  # npm can print an error and still exit 0 (e.g. a locked file): check the result itself
  [ -x node_modules/.bin/tsc ] || { echo "[!] npm ci thất bại / npm ci failed"; exit 1; }
  echo "== Build (npm run build)..."
  npm run build
  [ -f dist/index.html ] || { echo "[!] Build thất bại / Build failed"; exit 1; }
fi

echo "== Mở / Opening dist/index.html"
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "dist/index.html" >/dev/null 2>&1 &
else
  echo "Mở file này bằng Chrome/Edge / Open this file in Chrome/Edge: $(pwd)/dist/index.html"
fi
