#!/bin/sh
# Dijalankan DI DALAM kontainer fabric-ca (image hyperledger/fabric-ca) oleh network.sh.
# Membuat seluruh material kripto sebuah org lewat fabric-ca-client (tanpa cryptogen).
# Env wajib: ORG MSPID CA_NAME CA_HOST KIND(peer|orderer) NODE_NAME NODE_HOST NODE_SECRET CA_ADMIN_PASS
# Env opsional (hanya org peserta): REG_ID REG_SECRET
set -eu

CA_URL_HOSTPORT="${CA_HOST}:7054"
CA_TLS="/fabric/ca/${ORG}/tls-cert.pem"
BASE="/fabric/orgs/${ORG}"
HOMES="/fabric/ca-clients/${ORG}"
export FABRIC_CA_CLIENT_TLS_CERTFILES="${CA_TLS}"

# --- 1. Enroll bootstrap admin CA ---
export FABRIC_CA_CLIENT_HOME="${HOMES}/caadmin"
mkdir -p "${FABRIC_CA_CLIENT_HOME}"
fabric-ca-client enroll -u "https://admin:${CA_ADMIN_PASS}@${CA_URL_HOSTPORT}" --caname "${CA_NAME}" >/dev/null 2>&1

reg() { # name secret type [attrs]
  if [ -n "${4:-}" ]; then
    fabric-ca-client register --caname "${CA_NAME}" --id.name "$1" --id.secret "$2" --id.type "$3" --id.attrs "$4" 2>&1 | grep -v 'already registered' | grep -i error && return 1 || true
  else
    fabric-ca-client register --caname "${CA_NAME}" --id.name "$1" --id.secret "$2" --id.type "$3" 2>&1 | grep -v 'already registered' | grep -i error && return 1 || true
  fi
  return 0
}

ADMIN_NAME="${ORG}-admin"
reg "${ADMIN_NAME}" "${NODE_SECRET}" admin
reg "${NODE_NAME}" "${NODE_SECRET}" "${KIND}"
if [ -n "${REG_ID:-}" ]; then
  reg "${REG_ID}" "${REG_SECRET}" client '"hf.Registrar.Roles=client","hf.Registrar.Attributes=role,uid","hf.Revoker=true"'
fi

# --- 2. MSP organisasi (verifikasi) + NodeOUs ---
mkdir -p "${BASE}/msp/cacerts" "${BASE}/msp/tlscacerts"
cp "/fabric/ca/${ORG}/ca-cert.pem" "${BASE}/msp/cacerts/ca.pem"
cp "/fabric/ca/${ORG}/ca-cert.pem" "${BASE}/msp/tlscacerts/tlsca.pem"
cat > "${BASE}/msp/config.yaml" <<YAML
NodeOUs:
  Enable: true
  ClientOUIdentifier:
    Certificate: cacerts/ca.pem
    OrganizationalUnitIdentifier: client
  PeerOUIdentifier:
    Certificate: cacerts/ca.pem
    OrganizationalUnitIdentifier: peer
  AdminOUIdentifier:
    Certificate: cacerts/ca.pem
    OrganizationalUnitIdentifier: admin
  OrdererOUIdentifier:
    Certificate: cacerts/ca.pem
    OrganizationalUnitIdentifier: orderer
YAML

enroll_msp() { # name dir
  export FABRIC_CA_CLIENT_HOME="${HOMES}/$1"
  mkdir -p "${FABRIC_CA_CLIENT_HOME}"
  fabric-ca-client enroll -u "https://$1:${NODE_SECRET}@${CA_URL_HOSTPORT}" --caname "${CA_NAME}" -M "$2" >/dev/null 2>&1
  cp "${BASE}/msp/config.yaml" "$2/config.yaml"
  # samakan nama berkas CA dengan yang diacu config.yaml (NodeOUs)
  for f in "$2"/cacerts/*.pem; do [ "$f" = "$2/cacerts/ca.pem" ] || mv "$f" "$2/cacerts/ca.pem"; done
  mkdir -p "$2/tlscacerts"; cp "${BASE}/msp/tlscacerts/tlsca.pem" "$2/tlscacerts/tlsca.pem"
}
enroll_tls() { # name dir hosts
  export FABRIC_CA_CLIENT_HOME="${HOMES}/$1-tls"
  mkdir -p "${FABRIC_CA_CLIENT_HOME}"
  fabric-ca-client enroll -u "https://$1:${NODE_SECRET}@${CA_URL_HOSTPORT}" --caname "${CA_NAME}" -M "$2" --enrollment.profile tls --csr.hosts "$3" >/dev/null 2>&1
  cp "$2"/signcerts/cert.pem "$2/server.crt"
  cp "$2"/keystore/*_sk "$2/server.key"
  cp "$2"/tlscacerts/*.pem "$2/ca.crt"
}

# --- 3. Admin ---
enroll_msp "${ADMIN_NAME}" "${BASE}/users/admin/msp"
enroll_tls "${ADMIN_NAME}" "${BASE}/users/admin/tls" "localhost"

# --- 4. Node (peer0 / orderer) ---
enroll_msp "${NODE_NAME}" "${BASE}/nodes/${NODE_NAME}/msp"
enroll_tls "${NODE_NAME}" "${BASE}/nodes/${NODE_NAME}/tls" "${NODE_HOST},localhost,127.0.0.1"
echo "enroll ${ORG}: ok"
