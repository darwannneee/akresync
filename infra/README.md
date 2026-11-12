# Infrastruktur Lokal

Tiga stack Docker Compose untuk pengembangan: **Fabric** (jaringan akreditasi), **data** (PostgreSQL + Kafka + Debezium) dan **ipfs** (penyimpanan dokumen terenkripsi, swarm privat). Semua port hanya di `127.0.0.1`.

## Prasyarat

- Docker Desktop (Compose v2) dengan minimal ~6 GB RAM dan 4 CPU untuk Docker; `jq`, `curl`, `openssl` di host.
- Chaincode sudah di-build: `pnpm --filter @akreditasi/chaincode build` (menghasilkan `chaincode/dist/index.js`).
- Image berarsitektur arm64 dan amd64 tersedia untuk semua komponen (Fabric 2.5.12, Fabric CA 1.5.15, CouchDB 3.3.3, Postgres 16.6, Kafka 3.9.0, Debezium 2.7.3, Kubo 0.32.1).

## Perintah

```bash
infra/dev.sh up --deploy   # ipfs + data + fabric (CA, enroll, channel) + deploy chaincode
infra/dev.sh status
infra/dev.sh down          # hentikan semua, volume tetap

# per stack
infra/ipfs/ipfs.sh   up | down | status | clean --yes
infra/data/data.sh   up | down | status | clean --yes     # up juga mendaftarkan konektor Debezium
infra/fabric/network.sh up | deploy [--redefine] | down | status | clean --yes
```

`network.sh deploy` membangun image chaincode (`infra/fabric/chaincode.Dockerfile`, Chaincode-as-a-Service), memasang paket pada 5 peer, approve oleh 5 org, commit, lalu menjalankan kontainer `cc-formal-records`. Menjalankan `deploy` lagi hanya membangun ulang image dan memulai ulang kontainer chaincode; gunakan `--redefine` untuk menaikkan sequence (mis. setelah mengubah endorsement policy).

Variabel lingkungan `network.sh`:

| Variabel | Default | Keterangan |
|---|---|---|
| `STATE_DB` | `CouchDB` | `CouchDB` atau `goleveldb` (tanpa kontainer CouchDB; untuk VPS). Dipilih saat `up` dan diingat. |
| `ENDORSEMENT_POLICY` | `OR('UPPSMSP.peer','SekretariatMSP.peer','KEAMSP.peer','AsesorMSP.peer','MajelisMSP.peer')` | Dipakai saat `deploy`. |
| `CC_VERSION` | `1.0` | Label/versi paket chaincode. |
| `CC_DIR` | `chaincode` | Folder chaincode (relatif root repo) yang berisi `package.json` dan `dist/`. |
| `FABRIC_LOG` | `INFO` | Level log peer/orderer. |

## Port

| Layanan | Port host |
|---|---|
| Orderer / admin | 7050 / 7053 |
| CA orderer | 6054 |
| UPPS peer / CA | 7051 / 7054 |
| Sekretariat peer / CA | 8051 / 8054 |
| KEA peer / CA | 9051 / 9054 |
| Asesor peer / CA | 10051 / 10054 |
| Majelis peer / CA | 11051 / 11054 |
| PostgreSQL | 5433 (db `akreditasi`) |
| Kafka | 9092 |
| Debezium Connect | 8083 |
| IPFS API / gateway lokal | 5001 / 8080 |

CouchDB, chaincode (9999) dan swarm IPFS (4001) tidak dipublikasikan ke host.

## Jaringan Fabric

- Channel `accreditation`, chaincode `formal-records` (contract `FormalRecordContract`).
- Org: OrdererOrg (`OrdererMSP`) dengan 1 orderer etcdraft, dan 5 org peserta (`UPPSMSP`, `SekretariatMSP`, `KEAMSP`, `AsesorMSP`, `MajelisMSP`), masing-masing 1 peer + CouchDB + Fabric CA (TLS aktif, NodeOUs aktif). Domain `*.akreditasi.test`.
- Seluruh material kripto dibuat dengan `fabric-ca-client` (bukan cryptogen) sehingga atribut ecert berfungsi.
- Tiap CA punya identitas registrar `registrar-<org>` (`hf.Registrar.Roles=client`, `hf.Registrar.Attributes=role,uid`, `hf.Revoker=true`). API mendaftarkan dan meng-enroll pengguna sendiri dengan atribut `role=<peran>:ecert,uid=<uuid>:ecert`.
- Batas memori: peer 512m, CouchDB 256m, CA 96m, orderer 256m, chaincode 256m.

## Yang dihasilkan di `.runtime/` (diabaikan git)

| Path | Isi |
|---|---|
| `.runtime/fabric/network.json` | Konfigurasi koneksi untuk API (endpoint peer, CA, path TLS, registrar per org) |
| `.runtime/fabric/compose.env` | Kata sandi CA, CouchDB, dan secret registrar (acak) |
| `.runtime/fabric/ca/<org>/` | Data server CA (termasuk `tls-cert.pem`) |
| `.runtime/fabric/orgs/<org>/` | MSP org, identitas admin, MSP + TLS node |
| `.runtime/fabric/channel/accreditation.block` | Genesis block channel |
| `.runtime/fabric/chaincode/`, `chaincode.env` | Paket CCaaS dan package ID |
| `.runtime/data/.env` | Kredensial PostgreSQL (acak) |
| `.runtime/ipfs/swarm.key` | Kunci swarm privat IPFS |

## Catatan

- Konektor Debezium `akresync-outbox` membaca `public.outbox` lewat publication `outbox_pub` dan mengirim ke topik `audit.<aggregatetype>` (payload JSON tanpa schema).
- IPFS berjalan dengan `LIBP2P_FORCE_PNET=1`, tanpa bootstrap, relay, dan mDNS; `ipfs swarm peers` selalu kosong pada node tunggal.
- `down` mempertahankan volume; `clean --yes` menghapus kontainer, volume, dan berkas runtime stack terkait.
