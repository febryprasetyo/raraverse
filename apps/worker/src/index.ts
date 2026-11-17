import { loadWorkerEnvConfig } from './config/env.js';

export function bootstrapWorker() {
  const env = loadWorkerEnvConfig(process.env);
  return {
    status: 'ready' as const,
    mode: env.DATA_SOURCE_MODE,
    rawMediaDir: env.RAW_MEDIA_DIR,
  };
}
