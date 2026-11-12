#!/usr/bin/env bash
# Mendaftarkan (idempoten) konektor Debezium Outbox. Kredensial dibaca dari .runtime/data/.env.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$DIR/../../.runtime/data/.env"
CONNECT_URL="${CONNECT_URL:-http://127.0.0.1:8083}"
NAME="${CONNECTOR_NAME:-akresync-outbox}"
[[ -f "$ENV_FILE" ]] || { echo "tidak ada $ENV_FILE; jalankan data.sh up dulu" >&2; exit 1; }
set -a; . "$ENV_FILE"; set +a

echo "menunggu Kafka Connect ..."
for i in $(seq 1 60); do
  curl -fsS "$CONNECT_URL/connectors" >/dev/null 2>&1 && break
  sleep 2
  [[ $i -eq 60 ]] && { echo "Connect tidak merespons" >&2; exit 1; }
done

CONFIG="$(sed -e "s|@POSTGRES_USER@|$POSTGRES_USER|" -e "s|@POSTGRES_PASSWORD@|$POSTGRES_PASSWORD|" -e "s|@POSTGRES_DB@|$POSTGRES_DB|" "$DIR/outbox-connector.json.tmpl")"
curl -fsS -X PUT -H 'Content-Type: application/json' --data "$CONFIG" "$CONNECT_URL/connectors/$NAME/config" >/dev/null
st=""
for i in $(seq 1 30); do
  st="$(curl -fsS "$CONNECT_URL/connectors/$NAME/status" 2>/dev/null || true)"
  if [[ "$(echo "$st" | jq -r '.connector.state + "/" + (.tasks[0].state // "-")' 2>/dev/null)" == "RUNNING/RUNNING" ]]; then
    echo "konektor $NAME RUNNING"; exit 0
  fi
  sleep 2
done
echo "konektor belum RUNNING:" >&2; echo "$st" >&2; exit 1
