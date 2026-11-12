-- Skema basis data off-chain sistem akreditasi.
-- 12 tabel inti: users, submissions, document_versions, payments, assessor_offers, assessments,
--   al_schedules, upps_responses, ai_analyses, formal_records, outbox, audit_status.
-- 5 tabel pendukung: institutions, study_programs, fabric_identities, refresh_tokens, certificates.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===== Pendukung: master =====
CREATE TABLE institutions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  pddikti_code  text UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE study_programs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  uuid NOT NULL REFERENCES institutions(id),
  name            text NOT NULL,
  level           text NOT NULL CHECK (level IN ('D3','D4','S1','S2','S3','PROFESI')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, name, level)
);

-- ===== Inti: users =====
CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL UNIQUE,
  password_hash   text NOT NULL,
  full_name       text NOT NULL,
  role            text NOT NULL CHECK (role IN ('upps','sek_adm','sek_keu','kea','asesor','majelis')),
  institution_id  uuid REFERENCES institutions(id),
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (role <> 'upps' OR institution_id IS NOT NULL)
);

-- ===== Pendukung: identitas Fabric (custodial) & sesi =====
CREATE TABLE fabric_identities (
  user_id                uuid PRIMARY KEY REFERENCES users(id),
  msp_id                 text NOT NULL,
  enrollment_id          text NOT NULL UNIQUE,
  fabric_role            text NOT NULL CHECK (fabric_role IN ('upps','sek_adm','kea','asesor','majelis')),
  certificate_pem        text NOT NULL,
  encrypted_private_key  bytea NOT NULL,   -- AES-256-GCM dengan IDENTITY_MASTER_KEY
  key_iv                 bytea NOT NULL,
  key_tag                bytea NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id),
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ===== Inti: submissions (proyeksi tahap) =====
CREATE TABLE submissions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upps_user_id          uuid NOT NULL REFERENCES users(id),
  institution_id        uuid NOT NULL REFERENCES institutions(id),
  program_id            uuid NOT NULL REFERENCES study_programs(id),
  stage                 text NOT NULL DEFAULT 'draft' CHECK (stage IN (
                          'draft','submitted','admin_revision','admin_rejected','admin_verified',
                          'invoice_issued','payment_proof_uploaded','payment_verified','in_assessment',
                          'al_submitted','responses_completed','final_verified','decided','released')),
  ak_status             text NOT NULL DEFAULT 'not_started' CHECK (ak_status IN (
                          'not_started','offered','offer_rejected','effective','ak_partial','ak_complete',
                          'consistency_returned','consistency_approved')),
  al_schedule_status    text NOT NULL DEFAULT 'not_started' CHECK (al_schedule_status IN (
                          'not_started','proposed','approved','rejected')),
  document_set_version  integer NOT NULL DEFAULT 1,
  chain_stage           text,               -- salinan terakhir STAGE di ledger
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX submissions_upps_idx ON submissions(upps_user_id);
CREATE INDEX submissions_stage_idx ON submissions(stage);

-- ===== Inti: document_versions (berkas terenkripsi di IPFS) =====
CREATE TABLE document_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   uuid NOT NULL REFERENCES submissions(id),
  set_version     integer NOT NULL,
  doc_type        text NOT NULL CHECK (doc_type IN ('LED','LKPS','SUPPORT','PAYMENT_PROOF','AL_MINUTES','CERTIFICATE')),
  file_name       text NOT NULL,
  mime_type       text NOT NULL,
  size_bytes      bigint NOT NULL,
  sha256_plain    char(64) NOT NULL,
  cid             text NOT NULL,          -- CID ciphertext
  wrapped_dek     bytea NOT NULL,         -- DEK dibungkus DOCUMENT_MASTER_KEY
  dek_iv          bytea NOT NULL,
  dek_tag         bytea NOT NULL,
  file_iv         bytea NOT NULL,
  file_tag        bytea NOT NULL,
  uploaded_by     uuid NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_versions_sub_idx ON document_versions(submission_id, set_version);
-- Satu LED dan satu LKPS per versi set; SUPPORT boleh banyak.
CREATE UNIQUE INDEX document_versions_main_uq ON document_versions(submission_id, set_version, doc_type)
  WHERE doc_type IN ('LED','LKPS');

-- ===== Inti: payments =====
CREATE TABLE payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id      uuid NOT NULL REFERENCES submissions(id),
  version            integer NOT NULL DEFAULT 1,
  invoice_no         text NOT NULL UNIQUE,
  amount             numeric(14,2) NOT NULL CHECK (amount > 0),
  issued_by          uuid NOT NULL REFERENCES users(id),
  issued_at          timestamptz NOT NULL DEFAULT now(),
  proof_document_id  uuid REFERENCES document_versions(id),
  proof_uploaded_at  timestamptz,
  status             text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','proof_uploaded','verified','rejected')),
  verified_by        uuid REFERENCES users(id),
  verified_at        timestamptz,
  notes              text
);
CREATE INDEX payments_sub_idx ON payments(submission_id);

-- ===== Inti: assessor_offers (proyeksi penawaran + konsistensi AK) =====
CREATE TABLE assessor_offers (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id          uuid NOT NULL REFERENCES submissions(id),
  version                integer NOT NULL DEFAULT 1,
  offer_no               integer NOT NULL,
  chain_seq              integer,           -- seq catatan ASSESSOR_OFFER di ledger
  assessor1_id           uuid NOT NULL REFERENCES users(id),
  assessor2_id           uuid NOT NULL REFERENCES users(id),
  lead_assessor_id       uuid NOT NULL REFERENCES users(id),
  status                 text NOT NULL DEFAULT 'offered' CHECK (status IN ('offered','effective','rejected','replaced')),
  assessor1_response     text CHECK (assessor1_response IN ('ACCEPT','REJECT')),
  assessor2_response     text CHECK (assessor2_response IN ('ACCEPT','REJECT')),
  upps_response          text CHECK (upps_response IN ('ACCEPT','REJECT')),
  rejection_review_notes text,
  rejection_reviewed_by  uuid REFERENCES users(id),
  rejection_reviewed_at  timestamptz,
  consistency_status     text NOT NULL DEFAULT 'pending' CHECK (consistency_status IN ('pending','approved','returned')),
  consistency_notes      text,
  consistency_by         uuid REFERENCES users(id),
  consistency_at         timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, offer_no),
  CHECK (assessor1_id <> assessor2_id),
  CHECK (lead_assessor_id IN (assessor1_id, assessor2_id))
);

-- ===== Inti: assessments (skor rinci off-chain) =====
CREATE TABLE assessments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id          uuid NOT NULL REFERENCES submissions(id),
  offer_id               uuid NOT NULL REFERENCES assessor_offers(id),
  assessor_id            uuid NOT NULL REFERENCES users(id),
  phase                  text NOT NULL CHECK (phase IN ('AK','AL')),
  version                integer NOT NULL DEFAULT 1,
  status                 text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted')),
  scores                 jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {kriteria: {butir: nilai}}
  total_score            numeric(6,2),
  score_summary_sha256   char(64),
  minutes_document_id    uuid REFERENCES document_versions(id),
  chain_record_key       text,
  submitted_at           timestamptz,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, assessor_id, phase)
);

-- ===== Inti: al_schedules =====
CREATE TABLE al_schedules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id  uuid NOT NULL REFERENCES submissions(id),
  version        integer NOT NULL,
  proposed_by    uuid NOT NULL REFERENCES users(id),
  start_date     date NOT NULL,
  end_date       date NOT NULL,
  location       text NOT NULL,
  mode           text NOT NULL CHECK (mode IN ('luring','daring','hibrida')),
  status         text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected')),
  decided_by     uuid REFERENCES users(id),
  decided_at     timestamptz,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, version),
  CHECK (end_date >= start_date)
);

-- ===== Inti: upps_responses (tanggapan UPPS & ketua asesor) =====
CREATE TABLE upps_responses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id  uuid NOT NULL REFERENCES submissions(id),
  responder_role text NOT NULL CHECK (responder_role IN ('upps','lead_assessor')),
  responder_id   uuid NOT NULL REFERENCES users(id),
  response_type  text NOT NULL CHECK (response_type IN ('accept','objection','resolution')),
  body           text NOT NULL,
  document_id    uuid REFERENCES document_versions(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX upps_responses_sub_idx ON upps_responses(submission_id);

-- ===== Inti: ai_analyses (dipakai setelah K1) =====
CREATE TABLE ai_analyses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id   uuid NOT NULL REFERENCES submissions(id),
  document_id     uuid REFERENCES document_versions(id),
  model           text NOT NULL,
  prompt_version  text NOT NULL,
  result          jsonb NOT NULL,
  result_sha256   char(64) NOT NULL,
  created_by      uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ===== Inti: formal_records (proyeksi catatan on-chain, satu baris per versi) =====
CREATE TABLE formal_records (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id  uuid NOT NULL REFERENCES submissions(id),
  record_type    text NOT NULL CHECK (record_type IN ('SUBMISSION','ADMIN_VERIFICATION','ASSESSOR_OFFER',
                   'ASSIGNMENT_RESPONSE','ASSESSMENT_RESULT','FINAL_VERIFICATION','DECISION')),
  record_key     text NOT NULL,
  seq            integer NOT NULL,
  version        integer NOT NULL,
  request_id     text NOT NULL UNIQUE,
  actor_user_id  uuid REFERENCES users(id),
  payload        jsonb NOT NULL,
  payload_bytes  integer NOT NULL,          -- ukuran nilai catatan di world state (indikator beban)
  tx_id          text,
  block_number   bigint,
  status         text NOT NULL DEFAULT 'pending_chain' CHECK (status IN ('pending_chain','committed','failed')),
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  committed_at   timestamptz,
  UNIQUE (record_key, version)
);
CREATE INDEX formal_records_sub_idx ON formal_records(submission_id);
CREATE INDEX formal_records_pending_idx ON formal_records(status) WHERE status = 'pending_chain';

-- ===== Inti: outbox (insert-only, dibaca Debezium Outbox Event Router) =====
CREATE TABLE outbox (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregatetype  text NOT NULL,
  aggregateid    text NOT NULL,
  type           text NOT NULL,           -- AuditEventKind
  submission_id  uuid REFERENCES submissions(id),
  payload        jsonb NOT NULL,          -- OutboxPayload {event, snapshot}
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_sub_idx ON outbox(submission_id);

CREATE FUNCTION outbox_insert_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'outbox bersifat insert-only';
END $$;
CREATE TRIGGER outbox_no_update BEFORE UPDATE OR DELETE ON outbox
  FOR EACH ROW EXECUTE FUNCTION outbox_insert_only();

-- ===== Inti: audit_status (status pengiriman audit, terpisah dari outbox) =====
CREATE TABLE audit_status (
  event_id      uuid PRIMARY KEY REFERENCES outbox(id),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','committed','failed')),
  attempts      integer NOT NULL DEFAULT 0,
  tx_id         text,
  block_number  bigint,
  last_error    text,
  committed_at  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_status_pending_idx ON audit_status(status) WHERE status <> 'committed';

-- ===== Pendukung: certificates =====
CREATE TABLE certificates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id      uuid NOT NULL UNIQUE REFERENCES submissions(id),
  decision_record_id uuid NOT NULL REFERENCES formal_records(id),
  certificate_no     text NOT NULL UNIQUE,
  document_id        uuid NOT NULL REFERENCES document_versions(id),
  issued_by          uuid NOT NULL REFERENCES users(id),
  issued_at          timestamptz NOT NULL DEFAULT now()
);

-- Publikasi untuk Debezium (hanya outbox).
CREATE PUBLICATION outbox_pub FOR TABLE outbox;
