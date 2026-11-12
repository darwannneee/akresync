import pino from 'pino';

const opts = {
  level: process.env.LOG_LEVEL ?? 'info',
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.secret'],
};

/** LOG_FILE (opsional): salin log JSON ke berkas selain stdout. */
export const logger = process.env.LOG_FILE
  ? pino(opts, pino.multistream([{ stream: process.stdout }, { stream: pino.destination({ dest: process.env.LOG_FILE, mkdir: true, sync: false }) }]))
  : pino(opts);
