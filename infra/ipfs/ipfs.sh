#!/usr/bin/env bash
# Pemakaian: ipfs.sh up | down | clean --yes | status
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
export IPFS_RT="$ROOT/.runtime/ipfs"
dc() { docker compose -f "$DIR/docker-compose.yaml" "$@"; }

ensure_key() {
  mkdir -p "$IPFS_RT"
  if [[ ! -f "$IPFS_RT/swarm.key" ]]; then
    umask 077
    printf '/key/swarm/psk/1.0.0/\n/base16/\n%s\n' "$(openssl rand -hex 32)" > "$IPFS_RT/swarm.key"
    echo "[ipfs] swarm.key dibuat: $IPFS_RT/swarm.key"
  fi
}

case "${1:-}" in
  up) ensure_key; dc up -d ;;
  down) ensure_key; dc down ;;
  clean)
    [[ "${2:-}" == "--yes" ]] || { echo "clean menghapus volume Docker dan swarm.key di $IPFS_RT. Jalankan: ipfs.sh clean --yes" >&2; exit 1; }
    ensure_key; dc down -v --remove-orphans
    [[ -f "$IPFS_RT/swarm.key" ]] && unlink "$IPFS_RT/swarm.key"
    rmdir "$IPFS_RT" 2>/dev/null || true ;;
  status)
    ensure_key; dc ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}'
    curl -fsS -X POST http://127.0.0.1:5001/api/v0/id 2>/dev/null | head -c 200 || echo "(API belum siap)"; echo
    echo "peer swarm: $(curl -fsS -X POST http://127.0.0.1:5001/api/v0/swarm/peers 2>/dev/null || echo '?')" ;;
  *) echo "pemakaian: $0 up | down | clean --yes | status"; exit 1 ;;
esac
