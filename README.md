# DropDuel — provably fair DonutSMP gambling

Full-stack app: **Express 5 + SQLite (node:sqlite) + React 19 SSR + Tailwind 4**, one Node process.

- **DonutSMP account linking**: the player types their name and gets a one-time code, then sends `/msg <bot> <code>` in-game. Only the real account can send that whisper. No passwords or API keys are needed.
- **Pay in**: the player runs `/pay <bot> <amount>` in-game and the bot credits their site balance live over SSE. Payments from accounts that haven't linked yet are held, then credited when they link.
- **Pay out**: a withdrawal debits the balance at once, then the bot runs `/pay <player> <amount>`. A failed payout is refunded. A payout the bot can't confirm is flagged for staff and is never paid twice.
- **In-game balance**: the wallet shows the live DonutSMP balance from the official API (`/v1/stats/{user}`).
- **Games**: Dispenser Duel (1–9 vs the house, higher or lower wins, ties refund) and Coinflip.
- **Provably fair**: HMAC-SHA256 with server seed, client seed and nonce. The seed hash is shown before each bet, seed rotation reveals the old seed, and there's an in-browser verifier.
- **Operator console** at `/admin`: liabilities vs. bot balance, review queues, refunds, bans, and an event simulator.
- **SEO**: server-rendered HTML for every public page, per-page title, description, canonical, OpenGraph and Twitter tags, JSON-LD (WebSite, Organization, FAQPage, BreadcrumbList, WebApplication), `sitemap.xml`, `robots.txt`, real 404 status, a 301 to remove trailing slashes, an OG image and a web manifest.
- **Performance**: about 85 KB of gzipped JS on first load, private pages code-split, gzip, immutable caching of hashed assets, no web fonts, SSR page cache.
- **Security**: hashed session tokens, `__Host-` HttpOnly SameSite cookies, Origin check plus JSON-only writes (CSRF), CSP/HSTS headers, rate limits, atomic SQLite transactions, and a ledger invariant (`balance == SUM(transactions)`).

## Run it

```bash
cp .env.example .env      # set ADMIN_TOKEN at least
npm install
npm run dev               # http://localhost:3000  (BRIDGE=mock)
```

With `BRIDGE=mock`, go to `/admin`, unlock it with `ADMIN_TOKEN`, and use **/msg bot** and **/pay bot** to simulate in-game events. That way you can test linking, deposits and payouts without Minecraft.

```bash
npm test                  # ledger / fairness / linking / payout tests
npm run lint              # type check
npm run build && npm start
```

## Hosting

**Don't use Vercel or Netlify.** This is a long-running server: it keeps the bank bot logged into DonutSMP, runs the payout worker and streams live updates, and it stores data in SQLite on disk. Serverless hosts stop the process after each request and wipe the disk, so the site returns 404 there.

Use any host that runs the `Dockerfile` with a persistent disk mounted at `/app/data`:

- **Render (easiest):** Dashboard → **New → Blueprint** → pick this repo. `render.yaml` sets up the service, a 1 GB disk and a generated `ADMIN_TOKEN`. Disks need the paid Starter plan. Copy `ADMIN_TOKEN` from the service's Environment tab to unlock `/admin`.
- **Railway:** New Project → Deploy from GitHub repo. Railway detects the Dockerfile. Add a Volume mounted at `/app/data`, then set `ADMIN_TOKEN` and `TRUST_PROXY=1`.
- **Fly.io:** `fly launch`, then `fly volumes create data` and mount it at `/app/data`.
- **Your own VPS:** the `docker run` command below.

`SITE_URL` defaults to the URL Render, Railway or Fly assigns. Set it once you add a custom domain so canonical URLs and the sitemap use that domain.

## Going live

1. Create a DonutSMP API key in-game with `/api` and set `DONUTSMP_API_KEY`.
2. Get a dedicated Minecraft account for the bank bot. Set `BRIDGE=mineflayer`, `BOT_USERNAME` and `MC_EMAIL`. On first start, `/admin` and the logs show a Microsoft device-login code.
3. Check the chat formats. Run `/pay` and `/msg` against the bot once and compare the system messages with `MC_PAY_REGEX`, `MC_PAID_REGEX` and `MC_WHISPER_REGEX`. Adjust them if DonutSMP's wording differs.
4. Set `SITE_URL` to your real https origin, `TRUST_PROXY=1` behind a proxy, and a strong `ADMIN_TOKEN`.
5. Keep `data/` on a persistent volume. It holds the SQLite DB and the bot's auth cache.

```bash
docker build -t dropduel . && docker run -p 3000:3000 --env-file .env -v $PWD/data:/app/data dropduel
```

### Safety notes
- Deposits are only accepted from **system** chat messages that match an anchored regex, so a player typing "X paid you $1B" in chat does nothing. Deposits at or above `DEPOSIT_REVIEW_AT` are held for staff, and `/admin` compares the bot's real in-game balance against total liabilities.
- A rejected deposit stays in the bot's account. Refund it in-game by hand if appropriate.
- Check DonutSMP's rules on bots and gambling before going live. In-game currency only: never sell balance for real money.

## Layout
```
shared/   money parsing, provably-fair algorithm, routes + SEO metadata (used by client and server)
server/   express app, db, ledger, bets, accounts (link/deposit), withdrawals worker, DonutSMP API, bridge/ (mock | mineflayer)
src/      React app (SSR entry + hydrated client), pages/, components/
tests/    node:test suite
```
Rename the brand in `shared/site.ts`, `public/site.webmanifest`, then run `node scripts/generate-assets.mjs`.
