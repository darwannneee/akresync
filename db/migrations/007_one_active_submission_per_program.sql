-- Satu prodi hanya boleh memiliki satu pengajuan aktif. Pengajuan baru diizinkan lagi setelah
-- pengajuan sebelumnya selesai (sertifikat terbit) atau ditolak pada verifikasi administrasi.
CREATE UNIQUE INDEX IF NOT EXISTS submissions_one_active_per_program
  ON submissions(program_id) WHERE stage NOT IN ('released', 'admin_rejected');
