import type { SubmissionStage } from '@akreditasi/shared';
import { Stepper, type StepState } from '../../components/ui';
import type { SubmissionDetail } from '../../api/types';
import { AK_LABEL, AL_LABEL } from '../common/labels';

/** Urutan bisnis tetap: pengajuan → verifikasi → pembayaran → [AK ‖ jadwal AL] → AL → tanggapan → verifikasi akhir → penetapan → penerbitan. */
const MAIN = [
  'Pengajuan', 'Verifikasi kelengkapan', 'Tagihan & pembayaran', 'Cabang paralel (AK ‖ Jadwal AL)',
  'Asesmen lapangan (AL)', 'Tanggapan UPPS', 'Verifikasi akhir KEA', 'Penetapan Majelis', 'Penerbitan hasil',
];

function currentIndex(s: SubmissionDetail): number {
  const st: SubmissionStage = s.stage;
  const branchesDone = s.akStatus === 'consistency_approved' && s.alScheduleStatus === 'approved';
  switch (st) {
    case 'draft': return 0;
    case 'submitted': case 'admin_revision': case 'admin_rejected': return 1;
    case 'admin_verified': case 'invoice_issued': case 'payment_proof_uploaded': return 2;
    case 'payment_verified': case 'in_assessment': return branchesDone ? 4 : 3;
    case 'al_submitted': return 5;
    case 'responses_completed': return 6;
    case 'final_verified': return 7;
    case 'decided': return 8;
    case 'released': return 9;
  }
}

export function StageStepper({ s }: { s: SubmissionDetail }) {
  const cur = currentIndex(s);
  const blocked = s.stage === 'admin_rejected' || s.stage === 'admin_revision';
  const steps = MAIN.map((label, i) => {
    let state: StepState = i < cur ? 'done' : i === cur ? 'current' : 'todo';
    if (i === cur && s.stage === 'admin_rejected') state = 'blocked';
    return { label, state, note: i === 1 && blocked ? (s.stage === 'admin_rejected' ? 'Ditolak' : 'Menunggu revisi UPPS') : undefined };
  });

  const akOrder = ['offered', 'effective', 'ak_partial', 'ak_complete', 'consistency_approved'] as const;
  const akLabels = ['Penawaran asesor', 'Penugasan berlaku', 'Penilaian AK (2 asesor)', 'AK lengkap', 'Konsistensi KEA'];
  const akIdx = s.akStatus === 'offer_rejected' ? 0 : s.akStatus === 'consistency_returned' ? 3 : akOrder.indexOf(s.akStatus as (typeof akOrder)[number]);
  const akSteps = akLabels.map((label, i) => {
    const state: StepState = s.akStatus === 'consistency_approved' ? 'done' : i < akIdx ? 'done' : i === akIdx ? 'current' : 'todo';
    const note = i === akIdx && (s.akStatus === 'offer_rejected' || s.akStatus === 'consistency_returned') ? AK_LABEL[s.akStatus] : undefined;
    return { label, state: note ? ('blocked' as StepState) : state, note };
  });
  const alIdx = s.alScheduleStatus === 'not_started' ? 0 : s.alScheduleStatus === 'proposed' ? 1 : s.alScheduleStatus === 'rejected' ? 1 : 2;
  const alSteps = [
    { label: 'Usul jadwal AL (KEA)', state: (s.alScheduleStatus === 'not_started' ? 'current' : 'done') as StepState },
    { label: 'Persetujuan Sekretariat Administrasi', state: (s.alScheduleStatus === 'rejected' ? 'blocked' : alIdx === 1 ? 'current' : alIdx === 2 ? 'done' : 'todo') as StepState, note: s.alScheduleStatus === 'rejected' ? 'Ditolak, usulkan ulang' : undefined },
    { label: 'Jadwal ditetapkan', state: (s.alScheduleStatus === 'approved' ? 'done' : 'todo') as StepState },
  ];
  const active = cur === 3;

  return (
    <div className="space-y-4">
      <Stepper orientation="horizontal" steps={steps.map((x, i) => (i === 3 ? { ...x, note: `AK: ${AK_LABEL[s.akStatus]} · Jadwal: ${AL_LABEL[s.alScheduleStatus]}` } : x))} />
      {cur >= 2 && (
        <div className={`grid gap-3 rounded-lg border p-3 md:grid-cols-2 ${active ? 'border-navy-700 bg-navy-50' : 'border-slate-200 bg-slate-50'}`}>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-navy-900">Cabang AK — penugasan &amp; asesmen kecukupan</h3>
            <Stepper steps={akSteps} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-navy-900">Cabang jadwal AL</h3>
            <Stepper steps={alSteps} />
          </div>
        </div>
      )}
    </div>
  );
}
