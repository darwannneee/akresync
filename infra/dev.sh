#!/usr/bin/env bash
# Orkestrasi infrastruktur lokal: ipfs + data + fabric.
# Pemakaian: dev.sh up [--deploy] | deploy | down | status
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "${1:-}" in
  up)
    "$DIR/ipfs/ipfs.sh" up
    "$DIR/data/data.sh" up
    "$DIR/fabric/network.sh" up
    [[ "${2:-}" == "--deploy" ]] && "$DIR/fabric/network.sh" deploy
    echo "Infra siap. Berkas runtime: $(cd "$DIR/.." && pwd)/.runtime/" ;;
  deploy) "$DIR/fabric/network.sh" deploy ;;
  down)
    "$DIR/fabric/network.sh" down
    "$DIR/data/data.sh" down
    "$DIR/ipfs/ipfs.sh" down ;;
  status)
    "$DIR/ipfs/ipfs.sh" status
    echo; "$DIR/data/data.sh" status
    echo; "$DIR/fabric/network.sh" status ;;
  *) echo "pemakaian: $0 up [--deploy] | deploy | down | status"; exit 1 ;;
esac
