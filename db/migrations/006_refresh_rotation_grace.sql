-- Masa tenggang rotasi refresh token: mencatat kapan token dirotasi (bukan dicabut lewat keluar/logout),
-- agar permintaan refresh hampir bersamaan dengan token lama tidak mencabut sesi. Aditif dan idempoten.
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS rotated_at timestamptz;
