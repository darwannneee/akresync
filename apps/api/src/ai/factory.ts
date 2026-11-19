import type { Config } from '../config/index.js';
import { resolvePath } from '../config/index.js';
import { logger } from '../logger.js';
import { GeminiEmbedder, LocalEmbedder, OpenAiEmbedder, type Embedder } from './embedder.js';
import { GeminiProvider } from './gemini.js';
import { OpenAiProvider } from './openai.js';
import type { AiProvider } from './provider.js';

/** Penyedia generasi (OpenAI bawaan, Gemini bila AI_PROVIDER=gemini). Null bila kunci kosong → modul AI generatif nonaktif. */
export function createProvider(cfg: Config): AiProvider | null {
  if (cfg.AI_PROVIDER === 'gemini') return createGemini(cfg);
  if (!cfg.OPENAI_API_KEY) {
    logger.warn('OPENAI_API_KEY kosong; verifikasi jenis dokumen dan analisis AI nonaktif');
    return null;
  }
  return new OpenAiProvider({
    apiKey: cfg.OPENAI_API_KEY,
    model: cfg.OPENAI_MODEL,
    reasoningEffort: cfg.OPENAI_REASONING_EFFORT,
    generateRpm: cfg.AI_RPM,
  });
}

function createGemini(cfg: Config): GeminiProvider | null {
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

/** Embedding: OpenAI (bawaan; jatuh ke lokal bila kunci kosong), lokal (CPU, bebas kuota), atau Gemini. */
export function createEmbedder(cfg: Config, generation: AiProvider | null): Embedder | null {
  if (cfg.EMBEDDING_PROVIDER === 'openai') {
    if (cfg.OPENAI_API_KEY) return new OpenAiEmbedder({ apiKey: cfg.OPENAI_API_KEY, model: cfg.OPENAI_EMBED_MODEL, dim: cfg.AI_EMBED_DIM, rpm: cfg.AI_EMBED_RPM });
    logger.warn('EMBEDDING_PROVIDER=openai tetapi OPENAI_API_KEY kosong; memakai embedding lokal');
  }
  if (cfg.EMBEDDING_PROVIDER === 'gemini') {
    const gemini = generation instanceof GeminiProvider ? generation : createGemini(cfg);
    if (!gemini) {
      logger.warn('EMBEDDING_PROVIDER=gemini tetapi GEMINI_API_KEY kosong; retrieval memakai kata kunci');
      return null;
    }
    return new GeminiEmbedder(gemini, cfg.GEMINI_EMBED_MODEL, cfg.AI_EMBED_DIM);
  }
  return new LocalEmbedder(cfg.EMBEDDING_MODEL, resolvePath(cfg.EMBEDDING_CACHE_DIR), cfg.AI_EMBED_BATCH);
}
