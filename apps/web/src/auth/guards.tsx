import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ROLE_HOME, type AppRole } from '@akreditasi/shared';
import { useAuth } from './AuthContext';
import { Spinner } from '../components/ui';

export function RequireAuth({ roles }: { roles?: AppRole[] }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="grid min-h-screen place-items-center"><Spinner /></div>;
  if (!user) return <Navigate to="/masuk" state={{ from: loc.pathname }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role]} replace />;
  return <Outlet />;
}

export function RedirectHome() {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center"><Spinner /></div>;
  return <Navigate to={user ? ROLE_HOME[user.role] : '/masuk'} replace />;
}
