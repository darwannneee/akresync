-- Analisis otomatis dapat memakai ulang hasil analisis sebelumnya bila isi LED dan LKPS identik (SHA-256 sama),
-- sehingga unggah ulang berkas yang sama tidak memanggil layanan AI lagi. Aditif dan idempoten.
ALTER TABLE ai_analyses ADD COLUMN IF NOT EXISTS reused_from uuid REFERENCES ai_analyses(id);
