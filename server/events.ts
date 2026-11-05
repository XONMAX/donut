import type { Response } from 'express';

/** Minimal Server-Sent Events hub: public broadcast + per-user channels. */
interface Client { res: Response; userId: number | null }
const clients = new Set<Client>();

function write(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function subscribe(res: Response, userId: number | null) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  const client: Client = { res, userId };
  clients.add(client);
  res.on('close', () => clients.delete(client));
}

export function broadcast(event: string, data: unknown) {
  for (const c of clients) write(c.res, event, data);
}

export function notifyUser(userId: number, event: string, data: unknown) {
  for (const c of clients) if (c.userId === userId) write(c.res, event, data);
}

setInterval(() => {
  for (const c of clients) c.res.write(': ping\n\n');
}, 25_000).unref();
