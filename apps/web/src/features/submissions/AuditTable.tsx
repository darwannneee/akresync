import { useState } from 'react';
import { ShieldCheck, ScrollText } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import type { AuditEventView, AuditVerifyResult } from '../../api/types';
import { Button, CopyableMono, DataTable, EmptyState, Notice, StatusDot, TechnicalDetails } from '../../components/ui';
import { AUDIT_KIND_LABEL, AUDIT_PHASE_LABEL, auditPhase, fmtDateTime, roleName, type AuditPhase } from '../../lib/labels';
import { useToast } from '../../components/Toast';

type VerifyState = AuditVerifyResult | { error: string };

const PHASE_TONE: Record<AuditPhase, 'ok' | 'warn' | 'bad' | 'gray'> = { committed: 'ok', pending: 'warn', retrying: 'warn', failed: 'bad', saved: 'gray' };
/** Status bukti pencatatan sebagai titik + teks. */
export function ProofStatus({ status, attempts }: { status?: string | null; attempts?: number | null }) {
  const phase = auditPhase({ status: status ?? 'saved', attempts });
  return <StatusDot tone={PHASE_TONE[phase]}>{AUDIT_PHASE_LABEL[phase]}</StatusDot>;
}

export function AuditTable({ events }: { events: AuditEventView[] }) {
  const [res, setRes] = useState<Record<string, VerifyState>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  if (!events.length) return <EmptyState title="Belum ada peristiwa audit" icon={<ScrollText size={22} />}>Setiap tindakan yang tersimpan di sistem akan tercatat di sini.</EmptyState>;
  const verify = async (id: string) => {
    setBusy(id);
    try { const r = (await api.get<AuditVerifyResult>(`/audit/${id}/verify`)).data; setRes((x) => ({ ...x, [id]: r })); }
    catch (e) { setRes((x) => ({ ...x, [id]: { error: errorMessage(e) } })); toast.error(errorMessage(e)); }
    finally { setBusy(null); }
  };
  return (
    <DataTable rows={events} rowKey={(e) => e.eventId} caption="Jejak audit"
      columns={[
        { key: 'p', header: 'Peristiwa', primary: true, cell: (e) => <div><div className="font-medium text-ink">{AUDIT_KIND_LABEL[e.kind] ?? e.kind}</div><div className="text-[13px] text-faint">{roleName(e.actorRole)} · {fmtDateTime(e.occurredAt)}</div></div> },
        { key: 's', header: 'Bukti', cell: (e) => <div className="max-w-[16rem]"><ProofStatus status={e.status} attempts={e.attempts} /></div> },
        { key: 't', header: 'Rincian teknis', cell: (e) => <TechnicalDetails items={[['Nomor transaksi', <CopyableMono key="t" value={e.txId} full />], ['Blok', e.blockNumber], ['Sidik jari data', <CopyableMono key="h" value={e.payloadSha256} full />], ['Versi', e.version], ['Percobaan pencatatan', e.attempts], ...(e.lastError ? [['Catatan galat terakhir', <span key="le" className="break-words">{e.lastError}</span>] as [string, React.ReactNode]] : [])]} /> },
        { key: 'v', header: 'Pemeriksaan', cell: (e) => {
          const r = res[e.eventId];
          return (
            <div>
              <Button variant="ghost" size="sm" icon={<ShieldCheck size={15} />} loading={busy === e.eventId} disabled={e.status !== 'committed'} title={e.status !== 'committed' ? 'Tersedia setelah tercatat permanen' : undefined} onClick={() => void verify(e.eventId)}>Periksa keutuhan</Button>
              {r && ('error' in r ? <p className="mt-1 text-sm text-bad">{r.error}</p> : <div className="mt-1"><StatusDot tone={r.match ? 'ok' : 'bad'}>{r.match ? 'Terverifikasi utuh' : 'Tidak sesuai'}</StatusDot>{r.message && <p className="text-[13px] text-faint">{r.message}</p>}</div>)}
            </div>
          );
        } },
      ]} />
  );
}

/** Memeriksa keutuhan seluruh peristiwa audit yang sudah tercatat permanen. */
export function VerifyAll({ events }: { events: AuditEventView[] }) {
  const [state, setState] = useState<{ ok: number; bad: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const committed = events.filter((e) => e.status === 'committed');
  const run = async () => {
    setBusy(true); let ok = 0; let bad = 0;
    try {
      for (const e of committed) { const r = (await api.get<AuditVerifyResult>(`/audit/${e.eventId}/verify`)).data; if (r.match) ok++; else bad++; }
      setState({ ok, bad, total: committed.length });
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      <Button variant="secondary" size="sm" className="w-full" icon={<ShieldCheck size={15} />} loading={busy} disabled={!committed.length} onClick={() => void run()}>Periksa keutuhan bukti</Button>
      {state && (state.bad === 0 ? <Notice tone="success">Terverifikasi utuh: {state.ok} dari {state.total} peristiwa sesuai dengan catatan permanen.</Notice> : <Notice tone="danger" title="Ditemukan ketidaksesuaian">{state.bad} dari {state.total} peristiwa tidak sesuai. Hubungi administrator.</Notice>)}
    </div>
  );
}
