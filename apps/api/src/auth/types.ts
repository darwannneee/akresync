import type { AppRole } from '@akreditasi/shared';

export interface AuthUser {
  id: string;
  role: AppRole;
  email: string;
  fullName: string;
  institutionId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
