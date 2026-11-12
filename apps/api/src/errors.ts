export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (msg: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', msg, details);
export const unauthorized = (msg = 'Autentikasi diperlukan') => new AppError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'Anda tidak berwenang melakukan aksi ini') => new AppError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'Data tidak ditemukan') => new AppError(404, 'NOT_FOUND', msg);
export const conflict = (msg: string, details?: unknown) => new AppError(409, 'CONFLICT', msg, details);
