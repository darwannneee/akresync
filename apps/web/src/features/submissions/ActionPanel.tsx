import type { ActionProps } from './types';
import { UppsActions } from '../upps/UppsActions';
import { AdmActions, KeuActions } from '../sekretariat/SekretariatActions';
import { KeaActions } from '../kea/KeaActions';
import { AsesorActions } from '../asesor/AsesorActions';
import { MajelisActions } from '../majelis/MajelisActions';

export function ActionPanel(p: ActionProps) {
  switch (p.user.role) {
    case 'upps': return <UppsActions {...p} />;
    case 'sek_adm': return <AdmActions {...p} />;
    case 'sek_keu': return <KeuActions {...p} />;
    case 'kea': return <KeaActions {...p} />;
    case 'asesor': return <AsesorActions {...p} />;
    case 'majelis': return <MajelisActions {...p} />;
  }
}
