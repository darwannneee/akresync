import { Route, Routes } from 'react-router-dom';
import { RedirectHome, RequireAuth } from '../auth/guards';
import { Layout } from '../components/Layout';
import { LoginPage, NotFoundPage, RegisterPage } from '../pages/AuthPages';
import { DashboardPage } from '../pages/DashboardPage';
import { NewDraftPage } from '../pages/NewDraftPage';
import { SubmissionDetailPage } from '../pages/SubmissionDetailPage';
import { UppsVerificationDetail, UppsVerificationList } from '../features/sekretariat/UppsVerification';
import { ScoringPage } from '../features/asesor/ScoringPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RedirectHome />} />
      <Route path="/masuk" element={<LoginPage />} />
      <Route path="/daftar" element={<RegisterPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/pengajuan/:id" element={<SubmissionDetailPage />} />
          <Route element={<RequireAuth roles={['upps']} />}>
            <Route path="/upps" element={<DashboardPage />} />
            <Route path="/upps/baru" element={<NewDraftPage />} />
          </Route>
          <Route element={<RequireAuth roles={['sek_adm']} />}>
            <Route path="/sekretariat/administrasi" element={<DashboardPage />} />
            <Route path="/sekretariat/administrasi/akun-upps" element={<UppsVerificationList />} />
            <Route path="/sekretariat/administrasi/akun-upps/:id" element={<UppsVerificationDetail />} />
          </Route>
          <Route element={<RequireAuth roles={['sek_keu']} />}><Route path="/sekretariat/keuangan" element={<DashboardPage />} /></Route>
          <Route element={<RequireAuth roles={['kea']} />}><Route path="/kea" element={<DashboardPage />} /></Route>
          <Route element={<RequireAuth roles={['asesor']} />}>
            <Route path="/asesor" element={<DashboardPage />} />
            <Route path="/asesor/pengajuan/:id/penilaian/:phase" element={<ScoringPage />} />
          </Route>
          <Route element={<RequireAuth roles={['majelis']} />}><Route path="/majelis" element={<DashboardPage />} /></Route>
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
