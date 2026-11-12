import type { Config } from '../config/index.js';
import { resolvePath } from '../config/index.js';
import { logger } from '../logger.js';
import { GeminiEmbedder, LocalEmbedder, type Embedder } from './embedder.js';
import { GeminiProvider } from './gemini.js';

/** Penyedia generasi (Gemini). Null bila kunci tidak tersedia → modul AI generatif nonaktif. */
export function createProvider(cfg: Config): GeminiProvider | null {
  if (!cfg.GEMINI_API_KEY) {
    logger.warn('GEMINI_API_KEY kosong; verifikasi jenis dokumen dan analisis AI nonaktif');
    return null;
  }
  return new GeminiProvider({
    apiKey: cfg.GEMINI_API_KEY,
    model: cfg.GEMINI_MODEL,
    fallbackModels: cfg.GEMINI_FALLBACK_MODELS,
    embedModel: cfg.GEMINI_EMBED_MODEL,
    embedDim: cfg.AI_EMBED_DIM,
    thinkingLevel: cfg.GEMINI_THINKING_LEVEL,
    generateRpm: cfg.AI_RPM,
    embedRpm: cfg.AI_EMBED_RPM,
  });
}

/** Embedding: lokal (bawaan, bebas kuota) atau Gemini. */
export function createEmbedder(cfg: Config, gemini: GeminiProvider | null): Embedder | null {
  if (cfg.EMBEDDING_PROVIDER === 'gemini') {
    if (!gemini) {
      logger.warn('EMBEDDING_PROVIDER=gemini tetapi GEMINI_API_KEY kosong; retrieval memakai kata kunci');
      return null;
    }
    return new GeminiEmbedder(gemini, cfg.GEMINI_EMBED_MODEL, cfg.AI_EMBED_DIM);
  }
  return new LocalEmbedder(cfg.EMBEDDING_MODEL, resolvePath(cfg.EMBEDDING_CACHE_DIR), cfg.AI_EMBED_BATCH);
}
