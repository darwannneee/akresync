#!/usr/bin/env bash
# Jaringan Hyperledger Fabric 2.5 lokal untuk Sistem Akreditasi.
# Pemakaian: network.sh up | deploy [--redefine] | down | clean --yes | status
# Env: STATE_DB=CouchDB|goleveldb (default CouchDB), ENDORSEMENT_POLICY, CC_VERSION (default 1.0),
#      CC_DIR (default chaincode; relatif ke root repo, mis. .runtime/test-chaincode), FABRIC_LOG (default INFO)
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/../.." && pwd)"
RT="$ROOT/.runtime/fabric"
CHANNEL="accreditation"
CC_NAME="formal-records"
CC_VERSION="${CC_VERSION:-1.0}"
CC_DIR="${CC_DIR:-chaincode}"
CC_IMAGE="akresync/formal-records-cc:latest"
NET="akresync-fabric"
CA_IMAGE="hyperledger/fabric-ca:1.5.15"
TOOLS_IMAGE="hyperledger/fabric-tools:2.5.12"
DEFAULT_POLICY="OR('UPPSMSP.peer','SekretariatMSP.peer','KEAMSP.peer','AsesorMSP.peer','MajelisMSP.peer')"
ENDORSEMENT_POLICY="${ENDORSEMENT_POLICY:-$DEFAULT_POLICY}"

# dir:MSPID:peerPort:caPort
ORGS=("upps:UPPSMSP:7051:7054" "sekretariat:SekretariatMSP:8051:8054" "kea:KEAMSP:9051:9054" "asesor:AsesorMSP:10051:10054" "majelis:MajelisMSP:11051:11054")
ORDERER_NAME="orderer.akreditasi.test"

log() { printf '\033[1;34m[fabric]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[fabric] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }
field() { local IFS=:; local a=($1); echo "${a[$2]}"; }

# ---------- state db ----------
if [[ -f "$RT/state_db" && -z "${STATE_DB:-}" ]]; then STATE_DB="$(cat "$RT/state_db")"; fi
STATE_DB="${STATE_DB:-CouchDB}"
case "$STATE_DB" in CouchDB|goleveldb) ;; *) die "STATE_DB harus CouchDB atau goleveldb";; esac
export STATE_DB FABRIC_RT="$RT"

rand() { openssl rand -hex "${1:-16}"; }

ensure_env() {
  mkdir -p "$RT"
  echo "$STATE_DB" > "$RT/state_db"
  if [[ ! -f "$RT/compose.env" ]]; then
    umask 077
    {
      echo "CA_ADMIN_PASS=$(rand 16)"
      echo "NODE_SECRET=$(rand 16)"
      echo "COUCH_USER=couchadmin"
      echo "COUCH_PASS=$(rand 16)"
      for o in "${ORGS[@]}"; do echo "REG_SECRET_$(field "$o" 0)=$(rand 16)"; done
    } > "$RT/compose.env"
  fi
  [[ -f "$RT/chaincode.env" ]] || echo "CHAINCODE_ID=pending" > "$RT/chaincode.env"
  set -a; . "$RT/compose.env"; set +a
}

dc() {
  local profiles=(--profile cc)
  [[ "$STATE_DB" == "CouchDB" ]] && profiles+=(--profile couchdb)
  docker compose -f "$DIR/docker-compose.yaml" --env-file "$RT/compose.env" "${profiles[@]}" "$@"
}
dc_all() { docker compose -f "$DIR/docker-compose.yaml" --env-file "$RT/compose.env" --profile '*' "$@"; }

tools() { # jalankan perintah di kontainer fabric-tools pada jaringan Fabric
  docker run --rm --network "$NET" -v "$RT:/fabric" -v "$DIR/configtx:/cfg:ro" \
    -e FABRIC_CFG_PATH=/etc/hyperledger/fabric "$@"
}

# peer CLI sebagai admin org: peer_cli <orgdir> <args peer...>
peer_cli() {
  local org="$1"; shift
  local o port msp
  for o in "${ORGS[@]}"; do [[ "$(field "$o" 0)" == "$org" ]] && msp="$(field "$o" 1)"; done
  tools -e CORE_PEER_TLS_ENABLED=true -e CORE_PEER_LOCALMSPID="$msp" \
    -e CORE_PEER_ADDRESS="peer0.$org.akreditasi.test:7051" \
    -e CORE_PEER_TLS_ROOTCERT_FILE="/fabric/orgs/$org/nodes/peer0.$org.akreditasi.test/tls/ca.crt" \
    -e CORE_PEER_MSPCONFIGPATH="/fabric/orgs/$org/users/admin/msp" \
    "$TOOLS_IMAGE" peer "$@"
}

ORDERER_CA="/fabric/orgs/orderer/nodes/$ORDERER_NAME/tls/ca.crt"

wait_for() { # <deskripsi> <timeout detik> <perintah...>
  local desc="$1" t="$2"; shift 2
  local i=0
  until "$@" >/dev/null 2>&1; do
    i=$((i+2)); [[ $i -ge $t ]] && die "timeout menunggu: $desc"; sleep 2
  done
}

# ---------- up ----------
cmd_up() {
  ensure_env
  mkdir -p "$RT/ca" "$RT/orgs"
  log "menyalakan Fabric CA (6) ..."
  dc up -d ca-orderer ca-upps ca-sekretariat ca-kea ca-asesor ca-majelis
  wait_for "CA siap" 90 bash -c "for f in orderer upps sekretariat kea asesor majelis; do test -s '$RT/ca/'\$f/tls-cert.pem || exit 1; done"
  for o in "${ORGS[@]}"; do
    wait_for "CA $(field "$o" 0) merespons" 60 curl -fsS --cacert "$RT/ca/$(field "$o" 0)/tls-cert.pem" "https://127.0.0.1:$(field "$o" 3)/cainfo"
  done
  wait_for "CA orderer merespons" 60 curl -fsS --cacert "$RT/ca/orderer/tls-cert.pem" "https://127.0.0.1:6054/cainfo"

  enroll_org orderer OrdererMSP ca-orderer ca-orderer orderer "$ORDERER_NAME" "$ORDERER_NAME" "" ""
  for o in "${ORGS[@]}"; do
    local d; d="$(field "$o" 0)"
    local sv="REG_SECRET_$d"
    enroll_org "$d" "$(field "$o" 1)" "ca-$d" "ca-$d" peer "peer0.$d.akreditasi.test" "peer0.$d.akreditasi.test" "registrar-$d" "${!sv}"
  done

  if [[ ! -s "$RT/channel/$CHANNEL.block" ]]; then
    log "membuat genesis block channel $CHANNEL (configtxgen)"
    mkdir -p "$RT/channel"
    tools -e FABRIC_CFG_PATH=/cfg "$TOOLS_IMAGE" configtxgen -profile AccreditationChannel -channelID "$CHANNEL" -outputBlock "/fabric/channel/$CHANNEL.block"
  fi

  log "menyalakan orderer + peer (state db: $STATE_DB) ..."
  if [[ "$STATE_DB" == "CouchDB" ]]; then
    dc up -d $(for o in "${ORGS[@]}"; do echo "couchdb.$(field "$o" 0).akreditasi.test"; done)
  fi
  dc up -d "$ORDERER_NAME" $(for o in "${ORGS[@]}"; do echo "peer0.$(field "$o" 0).akreditasi.test"; done)

  log "orderer join channel (osnadmin) ..."
  local adm="/fabric/orgs/orderer/users/admin/tls"
  osn() { tools "$TOOLS_IMAGE" osnadmin "$@" -o "$ORDERER_NAME:7053" --ca-file "$ORDERER_CA" --client-cert "$adm/server.crt" --client-key "$adm/server.key"; }
  wait_for "orderer admin API" 60 osn channel list
  if ! osn channel list 2>/dev/null | grep -q "\"name\": *\"$CHANNEL\""; then
    osn channel join --channelID "$CHANNEL" --config-block "/fabric/channel/$CHANNEL.block" | tail -3
  else log "orderer sudah ada di channel"; fi

  for o in "${ORGS[@]}"; do
    local d; d="$(field "$o" 0)"
    log "peer0.$d join channel ..."
    wait_for "peer0.$d siap" 90 peer_cli "$d" node status
    if peer_cli "$d" channel list 2>/dev/null | grep -qx "$CHANNEL"; then log "  sudah tergabung"; else
      local n=0
      until peer_cli "$d" channel join -b "/fabric/channel/$CHANNEL.block" 2>&1 | tail -1 | grep -q "Successfully"; do
        n=$((n+1)); [[ $n -ge 5 ]] && die "peer0.$d gagal join"; sleep 3
      done
    fi
  done
  write_network_json
  log "up selesai. Berikutnya: network.sh deploy"
}

enroll_org() { # org msp caName caHost kind nodeName nodeHost regId regSecret
  local org="$1"
  if [[ -f "$RT/orgs/$org/.enrolled" ]]; then log "kripto $org sudah ada (lewati)"; return; fi
  log "enroll/register $org via $3 ..."
  docker run --rm --network "$NET" -v "$RT:/fabric" -v "$DIR/scripts:/scripts:ro" \
    -e ORG="$org" -e MSPID="$2" -e CA_NAME="$3" -e CA_HOST="$4" -e KIND="$5" -e NODE_NAME="$6" -e NODE_HOST="$7" \
    -e NODE_SECRET="$NODE_SECRET" -e CA_ADMIN_PASS="$CA_ADMIN_PASS" -e REG_ID="$8" -e REG_SECRET="$9" \
    "$CA_IMAGE" sh /scripts/enroll-org.sh
  touch "$RT/orgs/$org/.enrolled"
}

write_network_json() {
  local f="$RT/network.json" first=1
  {
    echo "{"
    echo "  \"channel\": \"$CHANNEL\","
    echo "  \"chaincode\": \"$CC_NAME\","
    echo "  \"orgs\": {"
    for o in "${ORGS[@]}"; do
      local d msp pp cp sv
      d="$(field "$o" 0)"; msp="$(field "$o" 1)"; pp="$(field "$o" 2)"; cp="$(field "$o" 3)"; sv="REG_SECRET_$d"
      [[ $first -eq 0 ]] && echo ","
      first=0
      cat <<JSON
    "$msp": {
      "peerEndpoint": "127.0.0.1:$pp",
      "peerHostAlias": "peer0.$d.akreditasi.test",
      "peerTlsCaPath": "$RT/orgs/$d/nodes/peer0.$d.akreditasi.test/tls/ca.crt",
      "caUrl": "https://127.0.0.1:$cp",
      "caName": "ca-$d",
      "caTlsCertPath": "$RT/ca/$d/tls-cert.pem",
      "registrarId": "registrar-$d",
      "registrarSecret": "${!sv}"
    }
JSON
    done | sed '$ s/$//'
    echo "  }"
    echo "}"
  } > "$f"
  chmod 600 "$f"
  jq . "$f" >/dev/null || die "network.json tidak valid"
  log "ditulis $f"
}

# ---------- deploy ----------
cmd_deploy() {
  local redefine=0; [[ "${1:-}" == "--redefine" ]] && redefine=1
  ensure_env
  [[ -s "$RT/channel/$CHANNEL.block" ]] || die "jalankan 'network.sh up' dulu"
  [[ -f "$ROOT/$CC_DIR/dist/index.js" ]] || die "$CC_DIR/dist/index.js tidak ada (build chaincode dulu)"

  log "build image chaincode dari $CC_DIR ..."
  docker build -q -f "$DIR/chaincode.Dockerfile" --build-arg CC_DIR="$CC_DIR" -t "$CC_IMAGE" "$ROOT" >/dev/null

  local pkg="$RT/chaincode"; mkdir -p "$pkg/src"
  cat > "$pkg/src/connection.json" <<JSON
{ "address": "cc-formal-records:9999", "dial_timeout": "10s", "tls_required": false }
JSON
  cat > "$pkg/metadata.json" <<JSON
{ "type": "ccaas", "label": "${CC_NAME}_${CC_VERSION}" }
JSON
  (cd "$pkg/src" && COPYFILE_DISABLE=1 tar czf ../code.tar.gz connection.json)
  (cd "$pkg" && COPYFILE_DISABLE=1 tar czf "$CC_NAME.tgz" metadata.json code.tar.gz)
  local PKG_ID
  PKG_ID="$(peer_cli upps lifecycle chaincode calculatepackageid "/fabric/chaincode/$CC_NAME.tgz")"
  [[ -n "$PKG_ID" ]] || die "gagal menghitung package id"
  log "package id: $PKG_ID"
  umask 077; echo "CHAINCODE_ID=$PKG_ID" > "$RT/chaincode.env"

  for o in "${ORGS[@]}"; do
    local d; d="$(field "$o" 0)"
    if peer_cli "$d" lifecycle chaincode queryinstalled 2>/dev/null | grep -q "$PKG_ID"; then log "install peer0.$d: sudah"; else
      log "install di peer0.$d ..."
      peer_cli "$d" lifecycle chaincode install "/fabric/chaincode/$CC_NAME.tgz" 2>&1 | tail -2
    fi
  done

  log "menyalakan kontainer chaincode ..."
  dc up -d --force-recreate cc-formal-records

  local seq committed
  committed="$(peer_cli upps lifecycle chaincode querycommitted -C "$CHANNEL" -n "$CC_NAME" 2>/dev/null || true)"
  if [[ -n "$committed" && $redefine -eq 0 ]]; then
    log "chaincode sudah committed (sequence terdaftar); image & kontainer diperbarui. Pakai --redefine untuk menaikkan sequence."
    show_committed; return
  fi
  if [[ -n "$committed" ]]; then
    seq=$(( $(echo "$committed" | sed -n 's/.*Sequence: \([0-9]*\),.*/\1/p') + 1 ))
  else seq=1; fi
  log "definisi chaincode: sequence=$seq policy=$ENDORSEMENT_POLICY"

  for o in "${ORGS[@]}"; do
    local d; d="$(field "$o" 0)"
    log "approve org $d ..."
    peer_cli "$d" lifecycle chaincode approveformyorg -o "$ORDERER_NAME:7050" --tls --cafile "$ORDERER_CA" \
      --channelID "$CHANNEL" --name "$CC_NAME" --version "$CC_VERSION" --package-id "$PKG_ID" --sequence "$seq" \
      --signature-policy "$ENDORSEMENT_POLICY" 2>&1 | tail -1
  done

  local peers=()
  for o in "${ORGS[@]}"; do
    local d; d="$(field "$o" 0)"
    peers+=(--peerAddresses "peer0.$d.akreditasi.test:7051" --tlsRootCertFiles "/fabric/orgs/$d/nodes/peer0.$d.akreditasi.test/tls/ca.crt")
  done
  log "commit chaincode ..."
  peer_cli upps lifecycle chaincode commit -o "$ORDERER_NAME:7050" --tls --cafile "$ORDERER_CA" \
    --channelID "$CHANNEL" --name "$CC_NAME" --version "$CC_VERSION" --sequence "$seq" \
    --signature-policy "$ENDORSEMENT_POLICY" "${peers[@]}" 2>&1 | tail -2
  show_committed
}

show_committed() { peer_cli upps lifecycle chaincode querycommitted -C "$CHANNEL" -n "$CC_NAME"; }

# ---------- down / clean / status ----------
cmd_down() { ensure_env; dc_all down; log "dihentikan (volume dipertahankan)"; }

cmd_clean() {
  [[ "${1:-}" == "--yes" ]] || die "clean menghapus kontainer, volume, dan $RT. Jalankan: network.sh clean --yes"
  mkdir -p "$RT"; [[ -f "$RT/compose.env" ]] || echo "CA_ADMIN_PASS=x
COUCH_USER=x
COUCH_PASS=x" > "$RT/compose.env"
  dc_all down -v --remove-orphans || true
  # hapus lewat kontainer agar aman terhadap kepemilikan berkas dari bind mount
  docker run --rm -v "$RT:/fabric" alpine sh -c 'rm -rf /fabric/* /fabric/.[!.]* 2>/dev/null' || true
  rm -rf "$RT"
  log "bersih"
}

cmd_status() {
  ensure_env
  dc_all ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}'
  for o in "${ORGS[@]}"; do
    local d; d="$(field "$o" 0)"
    echo "--- peer0.$d channels: $(peer_cli "$d" channel list 2>/dev/null | tr '\n' ' ')"
  done
  show_committed 2>/dev/null || echo "(chaincode belum committed)"
}

case "${1:-}" in
  up) cmd_up ;;
  deploy) shift; cmd_deploy "$@" ;;
  down) cmd_down ;;
  clean) shift; cmd_clean "$@" ;;
  status) cmd_status ;;
  *) echo "pemakaian: $0 up | deploy [--redefine] | down | clean --yes | status"; exit 1 ;;
esac
