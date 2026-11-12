import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Download, Eye, UserCheck, XCircle } from 'lucide-react';
import { api, downloadFile, errorMessage, fetchBlob } from '../../api/client';
import { Badge, Button, Card, ConfirmDialog, DataTable, DL, EmptyState, Field, FormError, Modal, Notice, PageHeader, Skeleton, Tabs, Textarea, type Tone } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { fmtDateTime } from '../../lib/labels';
import { REG_STATUS_LABEL, useUppsRegistration, useUppsRegistrations, type RegFile, type RegStatus, type RegSummary } from './uppsRegistrations';

const TONE: Record<RegStatus, Tone> = { pending_verification: 'warn', approved: 'success', rejected: 'danger' };
export const RegStatusBadge = ({ status }: { status: RegStatus }) => <Badge tone={TONE[status]}>{REG_STATUS_LABEL[status]}</Badge>;
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2).replace('.', ',')} MB` : `${(n / 1024).toFixed(1).replace('.', ',')} KB`);

type Filter = 'pending_verification' | 'approved' | 'rejected' | 'all';

export function UppsVerificationList() {
  const nav = useNavigate();
  const q = useUppsRegistrations();
  const [tab, setTab] = useState<Filter>('pending_verification');
  const all = q.data ?? [];
  const count = (s: RegStatus) => all.filter((r) => r.status === s).length;
  const rows = tab === 'all' ? all : all.filter((r) => r.status === tab);
  return (
    <div>
      <PageHeader eyebrow="Sekretariat Administrasi" title="Verifikasi Akun UPPS"
        subtitle="Periksa data dan dokumen pendaftaran perwakilan UPPS. Akun baru dapat digunakan setelah Bapak/Ibu menyetujui pendaftaran." />
      {q.isError && <div className="mb-4"><FormError message={errorMessage(q.error)} /></div>}
      <Tabs label="Status pendaftaran" value={tab} onChange={setTab} tabs={[
        { id: 'pending_verification', label: 'Menunggu verifikasi', count: count('pending_verification') },
        { id: 'approved', label: 'Disetujui', count: count('approved') },
        { id: 'rejected', label: 'Ditolak', count: count('rejected') },
        { id: 'all', label: 'Semua', count: all.length },
      ]} />
      <div className="mt-5" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {q.isLoading ? <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
          : rows.length === 0 ? <EmptyState icon={<UserCheck size={22} />} title={tab === 'pending_verification' ? 'Tidak ada pendaftaran yang menunggu' : 'Belum ada data'}>Pendaftaran UPPS yang masuk akan tampil di sini.</EmptyState>
          : <DataTable<RegSummary> rows={rows} rowKey={(r) => r.id} caption="Pendaftaran akun UPPS" onRowClick={(r) => nav(`/sekretariat/administrasi/akun-upps/${r.id}`)}
              columns={[
                { key: 'u', header: 'UPPS', primary: true, cell: (r) => <div><div className="font-medium text-ink">{r.uppsName}</div><div className="text-sm text-muted">{r.institutionName}</div></div> },
                { key: 'p', header: 'Penanggung jawab', cell: (r) => <div><div>{r.picName}</div><div className="text-sm text-muted">{r.email}</div></div> },
                { key: 'n', header: 'Prodi', align: 'right', cell: (r) => r.programCount },
                { key: 's', header: 'Status', cell: (r) => <RegStatusBadge status={r.status} /> },
                { key: 'd', header: 'Didaftarkan', cell: (r) => fmtDateTime(r.createdAt) },
                { key: 'a', header: '', cell: (r) => <Link to={`/sekretariat/administrasi/akun-upps/${r.id}`} onClick={(e) => e.stopPropagation()}><Button size="sm" variant={r.status === 'pending_verification' ? 'primary' : 'secondary'}>{r.status === 'pending_verification' ? 'Periksa pendaftaran' : 'Lihat rincian'}</Button></Link> },
              ]} />}
      </div>
    </div>
  );
}

function FileRow({ regId, f }: { regId: string; f: RegFile }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const path = `/upps-registrations/${regId}/files/${f.kind}`;
  const preview = async () => {
    setBusy(true);
    try { const url = URL.createObjectURL(await fetchBlob(path)); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="min-w-0 flex-1 basis-56"><p className="font-medium text-ink">{f.label}</p><p className="truncate text-sm text-muted">{f.fileName} · {kb(f.sizeBytes)}</p></div>
      <Button size="sm" variant="secondary" loading={busy} onClick={() => void preview()} icon={<Eye size={16} />}>Pratinjau</Button>
      <Button size="sm" variant="secondary" onClick={() => { downloadFile(path, f.fileName).catch((e) => toast.error(errorMessage(e))); }} icon={<Download size={16} />}>Unduh</Button>
    </li>
  );
}

function PhotoPreview({ regId }: { regId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null; let live = true;
    fetchBlob(`/upps-registrations/${regId}/files/photo`).then((b) => { if (live) { u = URL.createObjectURL(b); setUrl(u); } }).catch(() => undefined);
    return () => { live = false; if (u) URL.revokeObjectURL(u); };
  }, [regId]);
  return url ? <img src={url} alt="Foto penanggung jawab" className="h-32 w-28 rounded-lg border border-line object-cover" /> : <Skeleton className="h-32 w-28" />;
}

export function UppsVerificationDetail() {
  const { id = '' } = useParams();
  const q = useUppsRegistration(id);
  const qc = useQueryClient();
  const toast = useToast();
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState('');
  const [noteErr, setNoteErr] = useState<string | null>(null);
  const decide = useMutation({
    mutationFn: (b: { result: 'approved' | 'rejected'; note?: string }) => api.post(`/upps-registrations/${id}/decision`, b),
    onSuccess: (_d, b) => {
      toast.push({ kind: 'success', title: b.result === 'approved' ? 'Pendaftaran disetujui' : 'Pendaftaran ditolak', lines: [b.result === 'approved' ? 'Akun UPPS kini aktif dan program studinya dapat dipilih.' : 'Alasan penolakan akan ditampilkan kepada pendaftar saat mencoba masuk.'] });
      setApproveOpen(false); setRejectOpen(false);
      void qc.invalidateQueries({ queryKey: ['upps-registrations'] }); void qc.invalidateQueries({ queryKey: ['upps-registration', id] });
    },
    onError: (e) => { toast.error(errorMessage(e)); setApproveOpen(false); },
  });
  if (q.isLoading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  if (q.isError || !q.data) return <FormError message={q.isError ? errorMessage(q.error) : 'Pendaftaran tidak ditemukan.'} />;
  const r = q.data;
  const pending = r.status === 'pending_verification';
  return (
    <div className="space-y-6">
      <Link to="/sekretariat/administrasi/akun-upps" className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:underline"><ArrowLeft size={16} aria-hidden />Kembali ke daftar pendaftaran</Link>
      <PageHeader eyebrow="Verifikasi Akun UPPS" title={r.uppsName} subtitle={r.institutionName} actions={<RegStatusBadge status={r.status} />} />
      {!pending && (
        <Notice tone={r.status === 'approved' ? 'success' : 'danger'} title={r.status === 'approved' ? 'Pendaftaran telah disetujui' : 'Pendaftaran telah ditolak'}>
          {r.reviewedByName ? `Oleh ${r.reviewedByName}` : ''}{r.reviewedAt ? `, ${fmtDateTime(r.reviewedAt)}` : ''}.{r.reviewNote ? ` Catatan: ${r.reviewNote}` : ''}
        </Notice>
      )}
      <Card title="Profil UPPS">
        <div className="flex flex-wrap gap-6">
          {r.hasPhoto && <PhotoPreview regId={r.id} />}
          <div className="min-w-0 flex-1 basis-80">
            <DL items={[['Nama UPPS', r.uppsName], ['Institusi', r.institutionName], ['Pimpinan tertinggi UPPS', r.leaderName], ['Penanggung jawab akun', r.picName], ['Surel', r.email], ['Telepon', r.phone], ['Didaftarkan', fmtDateTime(r.createdAt)]]} />
          </div>
        </div>
      </Card>
      <Card title="Jenjang dan program studi" description="Program studi ini akan dibuat pada institusi tersebut saat pendaftaran disetujui.">
        <DataTable rows={r.programs} rowKey={(p) => p.id} caption="Program studi terdaftar" columns={[
          { key: 'l', header: 'Jenjang', cell: (p) => p.levelLabel },
          { key: 'n', header: 'Program studi', primary: true, cell: (p) => <span className="font-medium text-ink">{p.programName}</span> },
          { key: 'h', header: 'Ketua prodi', cell: (p) => p.headName ?? '—' },
          { key: 'c', header: 'Letak prodi', cell: (p) => <div>{p.location ?? '—'}{p.lat != null && p.lng != null && <div className="text-xs text-faint">{p.lat}, {p.lng}</div>}</div> },
        ]} />
      </Card>
      <Card title="Dokumen registrasi" description="Periksa kesesuaian isi dokumen dengan data pendaftaran. Keutuhan berkas diverifikasi otomatis saat dibuka.">
        <ul className="divide-y divide-line">{r.files.map((f) => <FileRow key={f.kind} regId={r.id} f={f} />)}</ul>
      </Card>
      {pending && (
        <Card title="Keputusan verifikasi" description="Bila disetujui, identitas jaringan akun dibuat dan program studi didaftarkan. Bila ditolak, catatan Bapak/Ibu akan dibaca pendaftar.">
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setApproveOpen(true)} icon={<CheckCircle2 size={16} />}>Setujui pendaftaran</Button>
            <Button variant="danger" onClick={() => { setNote(''); setNoteErr(null); setRejectOpen(true); }} icon={<XCircle size={16} />}>Tolak pendaftaran</Button>
          </div>
        </Card>
      )}
      <ConfirmDialog open={approveOpen} title="Setujui pendaftaran akun UPPS?" permanent={false} confirmLabel="Ya, setujui pendaftaran" pending={decide.isPending}
        items={[['UPPS', r.uppsName], ['Institusi', r.institutionName], ['Penanggung jawab', `${r.picName} (${r.email})`], ['Jumlah program studi', r.programs.length]]}
        onCancel={() => setApproveOpen(false)} onConfirm={() => decide.mutate({ result: 'approved' })}>
        <p className="text-sm text-muted">Proses ini membuat identitas jaringan untuk akun tersebut. Bila gagal, pendaftaran tetap menunggu dan dapat dicoba kembali.</p>
      </ConfirmDialog>
      <Modal open={rejectOpen} onClose={() => (decide.isPending ? undefined : setRejectOpen(false))} title="Tolak pendaftaran akun UPPS"
        footer={<><Button variant="secondary" disabled={decide.isPending} onClick={() => setRejectOpen(false)}>Batal</Button><Button variant="danger" loading={decide.isPending} onClick={() => { if (note.trim().length < 3) { setNoteErr('Catatan penolakan wajib diisi, minimal 3 karakter.'); return; } decide.mutate({ result: 'rejected', note: note.trim() }); }}>Ya, tolak pendaftaran</Button></>}>
        <Field label="Catatan penolakan" required error={noteErr ?? undefined} hint="Jelaskan apa yang perlu diperbaiki. Catatan ini ditampilkan kepada pendaftar saat mencoba masuk.">
          {(p) => <Textarea {...p} rows={4} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </Modal>
    </div>
  );
}
