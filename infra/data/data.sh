#!/usr/bin/env bash
# Pemakaian: data.sh up | down | clean --yes | status
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
export DATA_RT="$ROOT/.runtime/data" MIGRATIONS_DIR="$ROOT/db/migrations"
dc() { docker compose -f "$DIR/docker-compose.yaml" "$@"; }

ensure_env() {
  mkdir -p "$DATA_RT"
  if [[ ! -f "$DATA_RT/.env" ]]; then
    umask 077
    cat > "$DATA_RT/.env" <<ENV
POSTGRES_USER=akreditasi
POSTGRES_PASSWORD=$(openssl rand -hex 16)
POSTGRES_DB=akreditasi
ENV
    echo "[data] kredensial dibuat: $DATA_RT/.env"
  fi
}

case "${1:-}" in
  up)
    ensure_env
    dc up -d
    "$DIR/register-connector.sh" ;;
  down) ensure_env; dc down ;;
  clean)
    [[ "${2:-}" == "--yes" ]] || { echo "clean menghapus volume Docker dan kredensial di $DATA_RT/.env. Jalankan: data.sh clean --yes" >&2; exit 1; }
    ensure_env; dc down -v --remove-orphans
    # hanya berkas yang dibuat skrip ini
    [[ -f "$DATA_RT/.env" ]] && unlink "$DATA_RT/.env"
    rmdir "$DATA_RT" 2>/dev/null || true ;;
  status)
    ensure_env; dc ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}'
    curl -fsS http://127.0.0.1:8083/connectors/akresync-outbox/status 2>/dev/null || echo "(konektor belum terdaftar)" ;;
  *) echo "pemakaian: $0 up | down | clean --yes | status"; exit 1 ;;
esac
