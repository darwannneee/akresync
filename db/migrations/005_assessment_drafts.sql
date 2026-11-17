-- Draf penilaian ulang AK disimpan terpisah dari skor resmi (scores/total_score) yang sudah diserahkan.
-- Aditif dan idempoten: hanya menambah kolom baru, tanpa mengubah data lama.
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS draft_scores jsonb;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS draft_total_score numeric(6,2);
