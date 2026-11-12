import type { CriterionCode, Instrument, InstrumentCriterion, InstrumentItem } from './types.js';

/**
 * Instrumen Penilaian Akreditasi Program Studi, Program Doktor, LAM Teknik 2025.
 * Sumber: "Pedoman Penilaian Instrumen LAM Teknik 2025", bagian Program Doktor:
 *  - Form Laporan Asesmen Kecukupan / Lapangan (53 nomor, kolom NO, ELEMEN, INDIKATOR, DESKRIPSI, SKOR);
 *  - Lampiran "Bobot Penilaian Akreditasi Program Studi" (65 indikator berbobot, hlm. 273-277 pedoman);
 *  - Form Rekomendasi Pembinaan (judul Kriteria 1-7).
 *
 * Yang TIDAK dinyatakan pedoman (sengaja tidak diisi/dikarang): skala skor, deskriptor tiap tingkat skor,
 * rumus skor total, ambang peringkat, syarat perlu, rumus butir kuantitatif, dan nama tabel LKPS.
 */

export const CRITERIA_DOKTOR_2025: InstrumentCriterion[] = [
  { code: 'K1', title: 'Diferensiasi Misi (Visi, Misi, Tujuan, dan Strategi)', scored: true },
  { code: 'K2', title: 'Akuntabilitas', scored: true },
  { code: 'K3', title: 'Relevansi Pendidikan, Penelitian, dan PkM', scored: true },
  { code: 'K4', title: 'Sumber Daya Manusia', scored: true },
  { code: 'K5', title: 'Sarana, Prasarana, dan Keselamatan Kesehatan Kerja dan Lingkungan (K3L)', scored: true },
  { code: 'K6', title: 'Mahasiswa dan Luaran Mahasiswa', scored: true },
  { code: 'K7', title: 'Sistem Penjaminan Mutu', scored: true },
  {
    code: 'K8',
    title: 'Program Pengembangan',
    scored: true,
    note:
      'Pedoman tidak memberi judul Kriteria 8, tetapi butir 51-53 (analisis lingkungan eksternal/SWOT, tujuan strategi pengembangan, program pengembangan berkelanjutan) memiliki bobot di Lampiran sehingga ikut dihitung. Bila kebijakan LAM menyatakan tidak dinilai, ubah scored menjadi false (total maksimum turun menjadi 375.96).',
  },
];

/** Pemetaan nomor butir ke kriteria diturunkan dari kesesuaian topik dengan judul Kriteria 1-7; pedoman tidak mencetaknya eksplisit. */
function criterionOf(no: number): CriterionCode {
  if (no <= 3) return 'K1';
  if (no <= 11) return 'K2';
  if (no <= 24) return 'K3';
  if (no <= 35) return 'K4';
  if (no <= 37) return 'K5';
  if (no <= 45) return 'K6';
  if (no <= 50) return 'K7';
  return 'K8';
}

/** [NO, ELEMEN ('' = sama dengan baris sebelumnya), INDIKATOR, BOBOT, kuantitatif] */
type Row = [number, string, string, number, boolean?];

const ROWS: Row[] = [
  [1, 'Kekhasan VMTS', 'Pernyataan VMTS yang unik dan spesifik sebagai identitas PT, UPPS, dan visi keilmuan Program Studi sebagai keunggulan kompetitif yang didukung dengan Renstra dan kurikulum yang memadai.', 0.97],
  [2, 'Mekanisme penyusunan VMTS', 'Mekanisme dan keterlibatan pemangku kepentingan dalam penyusunan VMTS UPPS dan tujuan utama yang ingin dicapai dalam penyusunan visi keilmuan Program Studi dengan mempertimbangkan kebutuhan masyarakat dan tantangan global.', 0.63],
  [3, 'Tingkat Pemahaman dan Pencapaian VMTS', 'Tingkat pemahaman dan pencapaian VMTS UPPS dan visi keilmuan Program Studi oleh seluruh pemangku kepentingan internal dan eksternal serta pencapaian konkret jangka pendek dan jangka menengah yang telah ditetapkan dalam VMTS UPPS dan visi keilmuan Program Studi.', 0.22],
  [4, 'Sistem tata pamong', 'Kelengkapan struktur organisasi dan kebijakan operasional yang berpedoman pada statuta Perguruan Tinggi yang digunakan.', 1.01],
  [4, '', 'Perwujudan Good University Governance mengacu pada sistem tata kelola yang efektif, transparan, dan akuntabel.', 0.53],
  [5, 'Komitmen pimpinan dan kemampuan manajerial', 'Pimpinan UPPS memiliki komitmen pada: (1) Visi dan tujuan organisasi; (2) Integritas dan transparansi; (3) Pengembangan sumber daya.', 0.29],
  [5, '', 'Kemampuan manajerial pimpinan UPPS.', 0.61],
  [6, 'Relevansi dan Tingkat Kerja Sama', 'Relevansi kerja sama pendidikan, penelitian, dan PkM dengan Visi UPPS serta Visi Keilmuan Program Studi.', 0.78],
  [6, '', 'Kerja sama tingkat internasional, nasional, wilayah/lokal yang relevan dengan program studi dan dikelola oleh UPPS dalam 3 tahun terakhir.', 1.57],
  [7, 'Pelaksanaan kerja sama', 'UPPS memiliki bukti yang sahih terkait kerja sama yang telah memenuhi 3 aspek berikut: (1) Memberikan manfaat bagi program studi dalam pemenuhan proses pembelajaran, penelitian, PkM; (2) Memberikan peningkatan kinerja tridharma dan fasilitas pendukung program studi; (3) Memberikan kepuasan kepada mitra industri dan mitra kerja sama lainnya.', 1.39],
  [8, 'Pengelolaan Keuangan', 'UPPS memiliki praktik pengelolaan sumber daya keuangan secara efektif dan efisien.', 1.6],
  [9, 'Biaya operasional, penelitian, dan PkM', 'Biaya operasional pendidikan (BOP).', 0.48, true],
  [10, '', 'Dana Penelitian DTPS (DPD).', 0.48, true],
  [11, '', 'Dana PkM (DPkMD).', 0.24, true],
  [12, 'Pemutakhiran kurikulum', 'Keterlibatan pemangku kepentingan dalam proses evaluasi dan pemutakhiran kurikulum.', 0.93],
  [13, 'Profil lulusan dan CPL', 'Profil lulusan yang ditetapkan oleh Program Studi.', 1.04],
  [13, '', 'Kesesuaian Profil lulusan dengan capaian pembelajaran (CPL).', 1.04],
  [14, 'Kesesuaian dan tinjauan CPL', 'Kesesuaian CPL dengan standar kompetensi lulusan yang mencakup: (1) Konsep rekayasa terapan yang spesifik dengan disiplin ilmu terkait; (2) kemampuan teknis dan kemampuan beradaptasi dengan standar keteknikan dan Teknologi Baru; (3) Keterampilan komunikasi dan kemampuan kerja tim; (4) kepatuhan terhadap etika profesi.', 0.89],
  [14, '', 'Proses tinjauan rutin CPL.', 0.97],
  [15, 'Kualitas input mahasiswa', 'Metode rekrutmen dan sistem seleksi.', 0.93],
  [15, '', 'Kriteria penerimaan mahasiswa.', 1.86],
  [15, '', 'Proses seleksi.', 1.2],
  [16, 'Rencana Proses Pembelajaran (RPS)', 'Ketersediaan dan kelengkapan dokumen RPS yang terdiri dari: 1. Nama program studi, nama dan kode mata kuliah, semester, sks, nama dosen pengampu; 2. Capaian pembelajaran lulusan yang dibebankan pada capaian pembelajaran mata kuliah; 3. Kemampuan akhir yang direncanakan pada tiap tahap pembelajaran untuk memenuhi capaian pembelajaran lulusan; 4. Bahan kajian yang terkait dengan kemampuan yang akan dicapai; 5. Metode pembelajaran; 6. Waktu yang disediakan untuk mencapai kemampuan pada tiap tahap pembelajaran; 7. Pengalaman belajar mahasiswa yang diwujudkan dalam deskripsi tugas yang harus dikerjakan oleh mahasiswa selama satu semester; 8. Kriteria, indikator, dan bobot penilaian; dan 9. Daftar referensi yang digunakan.', 0.68],
  [16, '', 'Proses tinjauan rutin RPS.', 1.52],
  [17, 'Proses Pembelajaran', 'Proses pembelajaran untuk memastikan efektivitas, kualitas, dan keberhasilan pencapaian CPL.', 0.93],
  [17, '', 'Tinjauan rutin proses pembelajaran.', 0.93],
  [18, 'Integrasi Penelitian dan PkM dalam pembelajaran', 'Hasil Penelitian dan Pengabdian kepada Masyarakat (PkM) dalam pembelajaran.', 2.16],
  [19, 'Suasana Akademik', 'Pengelolaan suasana akademik.', 1.33],
  [19, '', 'Integritas dan kebebasan ilmiah: kebebasan akademik, mimbar akademik, dan otonomi keilmuan.', 1.33],
  [20, 'Penelitian', 'Kesesuaian penelitian dalam mendukung VMTS UPPS dan visi keilmuan program yang mencakup unsur-unsur sebagai berikut: (1) UPPS memiliki peta jalan penelitian yang mendukung VMTS UPPS dan visi keilmuan program studi; (2) Peta jalan memayungi tema penelitian dosen dan mahasiswa dalam mendukung pengembangan kapasitas dosen dan mahasiswa; (3) Melakukan evaluasi secara berkala untuk memastikan keselarasan dengan Visi; (4) memberikan dampak positif bagi masyarakat.', 1.25],
  [21, '', 'Penelitian DTPS yang sesuai dengan peta jalan penelitian dan pelaksanaannya melibatkan mahasiswa program studi dalam 3 tahun terakhir.', 1.1],
  [22, '', 'Penelitian DTPS yang menjadi rujukan tema tesis/disertasi mahasiswa program studi dalam 3 tahun terakhir.', 0.52],
  [23, 'PkM', 'Kesesuaian PkM dalam mendukung VMTS UPPS dan visi keilmuan Program Studi yang mencakup unsur-unsur sebagai berikut: (1) UPPS memiliki peta jalan PkM yang mendukung VMTS UPPS dan visi keilmuan program studi; (2) Peta jalan yang memayungi tema PkM dosen dan mahasiswa dalam mendukung pengembangan kapasitas dosen dan mahasiswa; (3) Melakukan evaluasi secara berkala untuk memastikan keselarasan dengan Visi; (4) memberikan dampak positif bagi masyarakat.', 0.84],
  [24, '', 'PkM DTPS yang sesuai dengan peta jalan PkM dan pelaksanaannya melibatkan mahasiswa program studi dalam 3 tahun terakhir.', 0.73],
  [25, 'Profil Dosen', 'Kecukupan Jumlah DTPS.', 2.28, true],
  [26, '', 'Jabatan akademik DTPS.', 2.07, true],
  [27, 'Tenaga Kependidikan', 'Kualifikasi dan kecukupan laboran / teknisi / administrator sistem untuk mendukung proses pembelajaran sesuai dengan kebutuhan program studi.', 1.76],
  [28, 'Beban Kerja DTPS', 'Rerata Beban Kerja (RBK) DTPS.', 1.2, true],
  [29, 'Kinerja DTPS', 'Kegiatan penelitian DTPS yang mendukung Visi UPPS dan Visi Keilmuan program studi dalam 3 tahun terakhir.', 0.38],
  [30, '', 'Kegiatan PkM DTPS yang mendukung Visi UPPS dan Visi Keilmuan program studi dalam 3 tahun terakhir.', 0.22],
  [31, '', 'Publikasi ilmiah dengan tema yang mendukung Visi UPPS dan Visi keilmuan program studi yang dihasilkan DTPS dalam 3 tahun terakhir.', 0.38],
  [32, '', 'Luaran penelitian dan PkM yang mendukung Visi UPPS dan Visi Keilmuan program studi yang dihasilkan DTPS dalam 3 tahun terakhir.', 0.22],
  [33, '', 'Publikasi ilmiah dengan tema yang mendukung visi UPPS dan visi keilmuan program studi yang dihasilkan DTPS dalam 3 tahun terakhir.', 5.97],
  [34, '', 'Persentase Karya ilmiah Bereputasi (PKIB) DTPS pada jurnal bereputasi atau publikasi dalam prosiding internasional ber-ISSN/ISBN terindeks Scopus/IEEE Explore/SPIE yang disitasi dalam 3 tahun terakhir.', 5.97, true],
  [35, '', 'Persentase DTPS yang memiliki karya ilmiah sebagai penulis pertama dan/atau penulis korespondensi dalam mendukung keunggulan kompetitif UPPS dan Program studi.', 5.97, true],
  [36, 'Sarana dan Prasarana', 'Kecukupan dan mutu sarana dan prasarana untuk mendukung kegiatan akademik yang meliputi: (1) Ketersediaan media pembelajaran, perangkat elektronik, alat praktik laboratorium; (2) Ketersediaan ruang kelas, laboratorium sesuai dengan panduan asosiasi penyelenggara program studi, dan perpustakaan; (3) Kelayakan sarana dan prasarana; (4) Kemudahan akses sarana prasarana.', 2.28],
  [36, '', 'Kecukupan dan mutu sarana dan prasarana untuk mendukung kegiatan non akademik yang meliputi: (1) Pusat kesehatan, pusat layanan konseling, pusat layanan karir, dan fasilitas ibadah; (2) Kelayakan sarana dan prasarana; dan (3) Kemudahan akses sarana prasarana.', 2.28],
  [37, 'Keselamatan Kesehatan Kerja dan Lingkungan (K3L)', 'Keselamatan Kesehatan Kerja dan Lingkungan (K3L) yang meliputi: (1) UPPS memiliki kebijakan dan tata kelola K3L yang mencakup komitmen untuk memenuhi peraturan K3L; (2) Fasilitas K3L; (3) Bukti sahih pelaksanaan K3L; dan (4) Tinjauan secara berkala K3L dan pelaksanaannya.', 2.0],
  [38, 'Mahasiswa asing', 'Persentase mahasiswa asing.', 0.83, true],
  [39, 'IPK Lulusan', 'IPK lulusan.', 1.21, true],
  [40, 'Prestasi akademik mahasiswa', 'Prestasi mahasiswa di bidang akademik dalam 3 tahun terakhir.', 1.83],
  [41, 'Masa studi', 'Masa studi. MS = Rerata masa studi lulusan (tahun).', 1.21, true],
  [42, 'Persentase lulusan tepat waktu', 'Persentase kelulusan tepat waktu (PTW).', 1.21, true],
  [43, 'Publikasi ilmiah mahasiswa', 'Publikasi ilmiah mahasiswa, yang dihasilkan secara mandiri atau bersama DTPS, dengan judul yang relevan dengan bidang program studi dalam 3 tahun terakhir.', 1.49],
  [44, '', 'Luaran penelitian dan PkM yang dihasilkan mahasiswa untuk mendukung visi UPPS dan Visi Keilmuan Program Studi, baik secara mandiri atau bersama DTPS dalam 3 tahun terakhir.', 0.37],
  [45, 'Tracer Study', 'Pelaksanaan tracer study yang mencakup 5 aspek sebagai berikut: (1) Pelaksanaan tracer study terkoordinasi di tingkat PT; (2) Kegiatan tracer study dilakukan secara reguler setiap tahun dan terdokumentasi; (3) Isi kuesioner mencakup seluruh pertanyaan inti tracer study DIKTI; (4) Ditargetkan pada seluruh populasi (lulusan TS-2 s.d. TS-1); dan (5) Hasilnya disosialisasikan dan digunakan untuk pengembangan kurikulum dan pembelajaran.', 3.29],
  [46, 'Keberadaan unit penjaminan mutu dan komitmen pimpinan', 'Keberadaan unit penjaminan mutu UPPS dan komitmen pimpinan dengan keberadaan 4 aspek: (1) dokumen legal pembentukan unsur pelaksana penjaminan mutu; (2) dokumen legal bahwa auditor bersifat independen; (3) Dokumen pelaksanaan audit mutu internal; (4) Dokumen Rapat Tinjauan Manajemen (RTM).', 2.07],
  [46, 'Ketersediaan perangkat SPMI dan pengakuan mutu eksternal', 'Ketersediaan perangkat SPMI yang minimal mencakup: 1. Kebijakan SPMI; 2. Pedoman penerapan siklus PPEPP standar pendidikan tinggi dalam SPMI; 3. Standar dan/atau kriteria, norma, acuan mutu penyelenggaraan pendidikan dan pengelolaan perguruan tinggi; dan 4. Tata cara pendokumentasian implementasi SPMI, serta sistem penjaminan mutu memiliki pengakuan mutu dari lembaga audit eksternal, lembaga akreditasi, dan lembaga sertifikasi.', 2.07],
  [47, 'Indikator Kinerja Tambahan (IKT)', 'IKT disusun sesuai dengan unsur: (1) tujuan strategis organisasi; (2) memberikan dampak positif dan terukur; (3) menunjukkan daya saing internasional; (4) telah diukur dan dianalisis untuk perbaikan UPPS dan Program studi.', 2.67],
  [48, 'Keterlaksanaan Penjaminan Mutu dan Audit Mutu Internal', 'Keterlaksanaan Sistem Penjaminan Mutu Internal (SPMI) yang memenuhi aspek berikut: (1) Tersedianya dokumen IKU dan IKT Pendidikan, Penelitian dan PkM; (2) Terlaksananya siklus penjaminan mutu (siklus PPEPP); (3) Bukti sahih efektivitas pelaksanaan penjaminan mutu; (4) Tersedianya bukti peningkatan standar.', 4.0],
  [49, 'Evaluasi Capaian Kinerja', 'Analisis ketercapaian atau ketidaktercapaian kinerja UPPS pada budaya, relevansi, akuntabilitas, dan diferensiasi misi yang memenuhi aspek: (1) Penggunaan metode yang tepat dalam mengukur kinerja; (2) Evaluasi indikator yang tidak tercapai dengan mencari akar masalah dan faktor pendukung ketercapaian; (3) Dilakukan proses tinjauan rutin hasil pengukuran kinerja; (4) Hasil pengukuran kinerja disebarluaskan kepada pemangku kepentingan.', 2.65],
  [50, 'Kepuasan Pemangku Kepentingan', 'Pengukuran kepuasan para pemangku kepentingan (mahasiswa, dosen, tenaga kependidikan, lulusan, pengguna, mitra industri, dan mitra lainnya) terhadap layanan manajemen, yang memenuhi aspek-aspek berikut: (1) Menggunakan instrumen kepuasan yang sahih, andal, mudah digunakan; (2) Dilaksanakan secara berkala, serta datanya terekam secara komprehensif; (3) Dianalisis dengan metode yang tepat serta bermanfaat untuk pengambilan keputusan; (4) Tingkat kepuasan dan umpan balik ditindaklanjuti untuk perbaikan dan peningkatan mutu luaran secara berkala dan tersistem; (5) Dilakukan review terhadap pelaksanaan pengukuran kepuasan dosen dan mahasiswa, serta (6) Hasilnya dipublikasikan dan mudah diakses oleh dosen dan mahasiswa.', 3.13],
  [51, 'Analisis Lingkungan Eksternal dalam Pengembangan UPPS dan Prodi serta analisis SWOT', 'Analisis lingkungan eksternal dalam pengembangan UPPS dan Program Studi. Ketepatan analisis SWOT yang mengacu pada lingkungan eksternal dan analisis SWOT setiap kriteria.', 2.67],
  [52, 'Tujuan Strategi Pengembangan', 'Ketepatan di dalam menetapkan tujuan strategis pengembangan.', 1.87],
  [53, 'Program Pengembangan Berkelanjutan', 'UPPS memiliki kebijakan, ketersediaan sumber daya, kemampuan melaksanakan, dan kerealistikan program pengembangan berkelanjutan.', 2.45],
];

function buildItems(): InstrumentItem[] {
  const perNo = new Map<number, number>();
  for (const r of ROWS) perNo.set(r[0], (perNo.get(r[0]) ?? 0) + 1);
  const seen = new Map<number, number>();
  let lastElement = '';
  return ROWS.map(([no, element, indicator, weight, quant]) => {
    if (element) lastElement = element;
    const idx = (seen.get(no) ?? 0) + 1;
    seen.set(no, idx);
    const multi = (perNo.get(no) ?? 1) > 1;
    const isQuant = quant === true;
    return {
      id: multi ? `${no}.${idx}` : String(no),
      no,
      sub: multi ? idx : null,
      criterion: criterionOf(no),
      element: lastElement,
      indicator,
      weight,
      descriptors: null,
      dataSource: 'LED dan LKPS',
      quantitative: isQuant,
      formula: no === 41 ? 'MS = Rerata masa studi lulusan (tahun)' : null,
      ...(isQuant ? { note: 'Bersifat angka terukur menurut bunyi indikator; pedoman tidak menyatakan rumus ataupun tabel LKPS. Nilai acuan diambil dari LKPS.' } : {}),
    };
  });
}

export const ITEMS_DOKTOR_2025: InstrumentItem[] = buildItems();

const SCORED_WEIGHT = ITEMS_DOKTOR_2025.reduce((a, i) => a + i.weight, 0);
const SCALE_MAX = 4;

export const INSTRUMENT_DOKTOR_2025: Instrument = {
  id: 'lamteknik-2025-doktor',
  version: '2025.1',
  program: 'Program Doktor',
  title: 'Instrumen Akreditasi Program Studi Program Doktor LAM Teknik 2025',
  source: {
    document: 'Pedoman Penilaian Instrumen LAM Teknik 2025',
    form: 'Form Laporan Asesmen Kecukupan dan Asesmen Lapangan, Program Doktor (hlm. 251-260 dan 261-270)',
    weightTable: 'Lampiran: Bobot Penilaian Akreditasi Program Studi (hlm. 273-277)',
  },
  criteria: CRITERIA_DOKTOR_2025,
  items: ITEMS_DOKTOR_2025,
  scale: {
    min: 0,
    max: SCALE_MAX,
    allowed: [0, 1, 2, 3, 4],
    stated: false,
    note: 'Pedoman tidak menyatakan skala kolom SKOR maupun deskriptor tiap tingkat. Skala bilangan bulat 0 sampai 4 dipakai sebagai asumsi kerja (selaras praktik akreditasi dan prototipe sebelumnya); ganti di sini bila ada matriks penilaian resmi.',
  },
  total: {
    rule: 'Skor total = jumlah (skor butir x bobot butir) atas seluruh butir berbobot.',
    stated: false,
    maxTotal: Math.round(SCALE_MAX * SCORED_WEIGHT * 100) / 100,
    note: 'Pedoman hanya mencantumkan bobot per butir (jumlah bobot 100,98 karena pembulatan). Rumus total adalah pembacaan harfiah "bobot butir", bukan rumus yang dinyatakan pedoman.',
  },
  rankThresholds: null,
  rankNote: 'Pedoman ini tidak memuat ambang skor untuk peringkat (Unggul, Baik Sekali, Baik); peringkat ditetapkan Majelis.',
  syaratPerlu: null,
  syaratPerluNote: 'Pedoman ini tidak memuat syarat perlu peringkat.',
};
