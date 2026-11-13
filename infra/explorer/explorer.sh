#!/usr/bin/env bash
# Pemakaian: infra/explorer/explorer.sh up|down|clean
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUNTIME_DIR="$ROOT/.runtime"; OUT="$RUNTIME_DIR/explorer"
export RUNTIME_DIR
cmd="${1:-up}"
compose() { docker compose -f "$ROOT/infra/explorer/docker-compose.yaml" "$@"; }

gen() {
  mkdir -p "$OUT/connection-profile"
  [ -f "$OUT/db.env" ] || echo "EXPLORER_DB_PASSWORD=$(openssl rand -hex 16)" > "$OUT/db.env"
  local key; key="$(basename "$(ls "$RUNTIME_DIR"/fabric/orgs/upps/users/admin/msp/keystore/*_sk | head -1)")"
  cat > "$OUT/config.json" <<JSON
{ "network-configs": { "akresync": { "name": "Jaringan Akreditasi", "profile": "./connection-profile/akresync.json" } },
  "license": "Apache-2.0" }
JSON
  cat > "$OUT/connection-profile/akresync.json" <<JSON
{
  "name": "akresync", "version": "1.0.0",
  "client": { "tlsEnable": true, "adminCredential": { "id": "exploreradmin", "password": "unused" },
    "enableAuthentication": false, "organization": "UPPSMSP",
    "connection": { "timeout": { "peer": { "endorser": "300" }, "orderer": "300" } } },
  "channels": { "accreditation": { "peers": { "peer0.upps.akreditasi.test": {} } } },
  "organizations": { "UPPSMSP": { "mspid": "UPPSMSP",
    "adminPrivateKey": { "path": "/tmp/crypto/upps/users/admin/msp/keystore/$key" },
    "peers": ["peer0.upps.akreditasi.test"],
    "signedCert": { "path": "/tmp/crypto/upps/users/admin/msp/signcerts/cert.pem" } } },
  "peers": { "peer0.upps.akreditasi.test": {
    "tlsCACerts": { "path": "/tmp/crypto/upps/nodes/peer0.upps.akreditasi.test/tls/ca.crt" },
    "url": "grpcs://peer0.upps.akreditasi.test:7051" } }
}
JSON
}

case "$cmd" in
  up) gen; set -a; . "$OUT/db.env"; set +a; compose up -d
      echo "Explorer: http://127.0.0.1:8090" ;;
  down) set -a; . "$OUT/db.env" 2>/dev/null || true; set +a; EXPLORER_DB_PASSWORD="${EXPLORER_DB_PASSWORD:-x}" compose down ;;
  clean) EXPLORER_DB_PASSWORD=x compose down -v; rm -rf "$OUT" ;;
  *) echo "pakai: $0 up|down|clean"; exit 1 ;;
esac
