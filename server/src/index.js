import { createGameServer } from './createServer.js';

const port = Number(process.env.PORT) || 3000;
const server = createGameServer({
  port,
  corsOrigin: process.env.CORS_ORIGIN || '',
  publicServerUrl: process.env.PUBLIC_SERVER_URL || '',
});

server.start().then((p) => console.log(`[doner-tycoon] sunucu hazir: port ${p}`));

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`[doner-tycoon] ${sig} alindi, kapatiliyor`);
    server.stop().finally(() => process.exit(0));
  });
}
