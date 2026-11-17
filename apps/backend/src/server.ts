import { loadEnvConfig } from './config/env.js';
import { buildApp } from './app.js';

async function main() {
  const env = loadEnvConfig(process.env);
  const app = await buildApp({
    env,
    skipQueueConnection: env.SKIP_QUEUE_CONNECTION,
  });

  await app.listen({
    port: env.PORT,
    host: '0.0.0.0',
  });
}

main().catch((err) => {
  console.error('Failed to start backend:', err);
  process.exit(1);
});
