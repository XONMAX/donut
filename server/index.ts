import express, { type Request, type Response, type NextFunction } from 'express';
import compression from 'compression';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.ts';
import { matchRoute } from '../shared/site.ts';
import { buildHead, sitemapXml, robotsTxt } from './seo.ts';
import { loadSession } from './session.ts';
import { api } from './routes/api.ts';
import { bridge } from './bridge/index.ts';
import { handleDeposit, handleWhisper } from './accounts.ts';
import { startWithdrawalWorker } from './withdrawals.ts';
import { broadcast, notifyUser } from './events.ts';

type RenderFn = (url: string) => { html: string };

const root = process.cwd();
const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', /^\d+$/.test(config.trustProxy) ? Number(config.trustProxy) : config.trustProxy);

// ---- Security headers ------------------------------------------------------
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (config.isProd) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://mc-heads.net; " +
        "connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
    );
  }
  next();
});

// SSE must not be buffered by compression.
app.use(compression({ filter: (req, res) => !req.path.startsWith('/api/events') && compression.filter(req, res) }));
app.use(loadSession);
app.use('/api', api);

app.get('/healthz', (_req, res) => res.json({ ok: true, bridge: bridge.status().online }));
app.get('/robots.txt', (_req, res) => res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(robotsTxt()));
app.get('/sitemap.xml', (_req, res) => res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(sitemapXml()));

// Canonical URLs have no trailing slash: avoid duplicate-content.
app.use((req, res, next) => {
  if (req.method === 'GET' && req.path.length > 1 && req.path.endsWith('/')) {
    const qs = req.originalUrl.slice(req.path.length);
    return res.redirect(301, req.path.replace(/\/+$/, '') + qs);
  }
  next();
});

// ---- Client + SSR ----------------------------------------------------------
let template: (url: string) => Promise<string>;
let render: (url: string) => Promise<RenderFn>;

if (config.isProd) {
  const clientDir = join(root, 'dist/client');
  const html = readFileSync(join(clientDir, 'index.html'), 'utf8');
  const ssrPath = join(root, 'dist/ssr/entry-server.js');
  if (!existsSync(ssrPath)) throw new Error('Missing dist/ssr — run `npm run build` first');
  const mod = (await import(ssrPath)) as { render: RenderFn };
  template = async () => html;
  render = async () => mod.render;

  app.get('/index.html', (_req, res) => res.redirect(301, '/'));
  app.use(
    '/assets',
    express.static(join(clientDir, 'assets'), { immutable: true, maxAge: '1y', index: false, fallthrough: false }),
  );
  app.use(express.static(clientDir, { index: false, maxAge: '1d' }));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
  app.use(vite.middlewares);
  template = (url) => vite.transformIndexHtml(url, readFileSync(join(root, 'index.html'), 'utf8'));
  render = async () => ((await vite.ssrLoadModule('/src/entry-server.tsx')) as { render: RenderFn }).render;
}

const pageCache = new Map<string, string>();

app.use(async (req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  try {
    const route = matchRoute(req.path);
    const status = route.path === '*' ? 404 : 200;
    const cacheKey = route.path === '*' ? null : route.path;
    let page = config.isProd && cacheKey ? pageCache.get(cacheKey) : undefined;
    if (!page) {
      const [tpl, renderFn] = await Promise.all([template(req.originalUrl), render(req.originalUrl)]);
      const { html } = renderFn(req.path);
      page = tpl.replace('<!--app-head-->', buildHead(route, req.path)).replace('<!--app-html-->', html);
      if (config.isProd && cacheKey) pageCache.set(cacheKey, page);
    }
    res
      .status(status)
      .set('Content-Type', 'text/html; charset=utf-8')
      .set('Cache-Control', status === 200 ? 'public, max-age=0, must-revalidate' : 'no-store')
      .send(page);
  } catch (err) {
    next(err);
  }
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).type('text/plain').send('Internal error');
});

// ---- In-game bridge --------------------------------------------------------
bridge.on('payment', (e) => {
  try {
    const r = handleDeposit(e);
    console.log(`[bridge] payment from ${e.from}: ${e.amount / 100} → ${r.status}`);
  } catch (err) {
    console.error('[bridge] deposit failed', err);
  }
});
bridge.on('whisper', (e) => {
  try {
    const r = handleWhisper(e);
    if (r) {
      console.log(`[bridge] linked ${r.user.username}`);
      notifyUser(r.user.id, 'linked', { username: r.user.username });
    }
  } catch (err) {
    console.error('[bridge] whisper failed', err);
  }
});
bridge.on('status', (s) => {
  console.log(`[bridge] ${s.kind} ${s.online ? 'online' : 'offline'}: ${s.detail ?? ''}`);
  broadcast('bridge', { online: s.online });
});

await bridge.start();
startWithdrawalWorker(bridge);

const server = app.listen(config.port, config.host, () => {
  console.log(`▶ ${config.isProd ? 'production' : 'development'} server on http://localhost:${config.port}  (bridge: ${config.bridge})`);
});

const shutdown = async () => {
  server.close();
  await bridge.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
