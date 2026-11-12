-- Modul AI pendukung keputusan (RAG atas LED/LKPS). Idempoten.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS index_status text NOT NULL DEFAULT 'pending';
ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS index_error text;
ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS indexed_at timestamptz;
ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS index_stats jsonb;
DO $$ BEGIN
  ALTER TABLE document_versions ADD CONSTRAINT document_versions_index_status_chk
    CHECK (index_status IN ('pending','indexing','indexed','failed','skipped'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Dokumen yang sudah ada sebelum modul AI dan bukan LED/LKPS tidak diindeks.
UPDATE document_versions SET index_status='skipped' WHERE doc_type NOT IN ('LED','LKPS') AND index_status='pending';
CREATE INDEX IF NOT EXISTS document_versions_index_idx ON document_versions(index_status) WHERE index_status IN ('pending','indexing');

CREATE TABLE IF NOT EXISTS document_chunks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id  uuid NOT NULL REFERENCES submissions(id),
  document_id    uuid NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
  set_version    integer NOT NULL,
  doc_type       text NOT NULL CHECK (doc_type IN ('LED','LKPS')),
  chunk_index    integer NOT NULL,
  locator        text NOT NULL,
  text           text NOT NULL,
  text_sha256    char(64) NOT NULL,
  token_estimate integer NOT NULL,
  embedding      vector(768),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS document_chunks_sub_idx ON document_chunks(submission_id, set_version);
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx ON document_chunks USING hnsw (embedding vector_cosine_ops);

ALTER TABLE ai_analyses ALTER COLUMN model DROP NOT NULL;
ALTER TABLE ai_analyses ALTER COLUMN prompt_version DROP NOT NULL;
ALTER TABLE ai_analyses ALTER COLUMN result DROP NOT NULL;
ALTER TABLE ai_analyses ALTER COLUMN result_sha256 DROP NOT NULL;
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'AK';
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'queued';
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS error text;
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES users(id);
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS set_version integer;
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS prompt_template_sha256 char(64);
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS requested_model text;
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS used_model text;
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS model_version text;
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS fallbacks jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS thinking_level text;
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS retrieved jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS dropped jsonb;
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS input_tokens integer;
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS output_tokens integer;
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS latency_ms integer;
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS finished_at timestamptz;
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DO $$ BEGIN
  ALTER TABLE ai_analyses ADD CONSTRAINT ai_analyses_phase_chk CHECK (phase IN ('AK','AL'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE ai_analyses ADD CONSTRAINT ai_analyses_status_chk CHECK (status IN ('queued','running','done','failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS ai_analyses_sub_idx ON ai_analyses(submission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_analyses_status_idx ON ai_analyses(status) WHERE status IN ('queued','running');

-- Alur otomatis: pemeriksaan jenis dokumen (heuristik, tanpa panggilan generasi) dan pemicu analisis.
ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS doc_check jsonb;
ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS checked_at timestamptz;
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS trigger text NOT NULL DEFAULT 'manual';
DO $$ BEGIN
  ALTER TABLE ai_analyses ADD CONSTRAINT ai_analyses_trigger_chk CHECK (trigger IN ('auto','manual'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS ai_analyses_auto_uq ON ai_analyses(submission_id, set_version) WHERE trigger = 'auto';

-- Embedding lokal/Gemini: tiap potongan mencatat model penyematnya; indeks inkremental dan dapat dilanjutkan.
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS embedding_model text;
UPDATE document_chunks SET embedding_model = 'gemini:gemini-embedding-001' WHERE embedding IS NOT NULL AND embedding_model IS NULL;
CREATE INDEX IF NOT EXISTS document_chunks_sha_idx ON document_chunks(text_sha256, embedding_model) WHERE embedding IS NOT NULL;
ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS index_retry_at timestamptz;
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS embedding_model text;
