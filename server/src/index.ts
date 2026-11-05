import http from 'node:http';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Server, matchMaker } from 'colyseus';
import { ROOM_NAME } from '@fancave/shared';
import { CaveRoom } from './rooms/CaveRoom';

const PORT = Number(process.env.PORT ?? 2567);
const started = Date.now();

const httpServer = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    const rooms = await matchMaker.query({ name: ROOM_NAME });
    const fans = rooms.reduce((n, r) => n + r.clients, 0);
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(
      JSON.stringify({
        ok: true,
        uptime: (Date.now() - started) / 1000,
        rooms: rooms.length,
        fans,
      }),
    );
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
    // Detect dead sockets (phone locked, network drop) quickly: ~3s.
    pingInterval: 1500,
    pingMaxRetries: 2,
    maxPayload: 8 * 1024,
  }),
});

gameServer.define(ROOM_NAME, CaveRoom);

gameServer
  .listen(PORT)
  .then(() => console.log(`[fancave] server listening on :${PORT}`))
  .catch((err: unknown) => {
    console.error('[fancave] failed to start', err);
    process.exit(1);
  });
