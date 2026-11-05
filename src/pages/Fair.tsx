import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api.ts';
import { useApp } from '../store.tsx';
import { CopyButton } from '../components/ui.tsx';
import { fairFloats, resolveOutcome, FLOATS_NEEDED, type GameId, type Outcome } from '../../shared/fair.ts';

const enc = new TextEncoder();
async function hmacSha256(key: string, msg: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)));
}
async function sha256Hex(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

function SeedPanel() {
  const { user, openLink, toast } = useApp();
  const [seed, setSeed] = useState<{ serverSeedHash: string; clientSeed: string; nonce: number } | null>(null);
  const [client, setClient] = useState('');
  const [revealed, setRevealed] = useState<{ seed: string; hash: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    api<{ serverSeedHash: string; clientSeed: string; nonce: number }>('/fair').then((s) => {
      setSeed(s);
      setClient(s.clientSeed);
    }).catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) {
    return (
      <div className="card p-6">
        <h2 className="text-lg font-bold">Your seeds</h2>
        <p className="mt-1 text-sm text-ink-2">Link your account to see and rotate your seeds.</p>
        <button className="btn-primary mt-4" onClick={() => openLink()}>Link DonutSMP</button>
      </div>
    );
  }

  const rotate = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await api<{ revealed: { seed: string; hash: string }; nextHash: string }>('/fair/rotate', { body: { clientSeed: client } });
      setRevealed(r.revealed);
      setSeed({ serverSeedHash: r.nextHash, clientSeed: client || seed!.clientSeed, nonce: 0 });
      toast('Seed rotated — previous server seed revealed', 'ok');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Rotation failed', 'err');
    }
  };

  return (
    <form className="card space-y-4 p-6" onSubmit={rotate}>
      <h2 className="text-lg font-bold">Your seeds</h2>
      <div>
        <div className="label">Active server seed (SHA-256 hash)</div>
        <div className="flex items-center gap-2"><code className="flex-1 truncate rounded-lg bg-bg/70 px-3 py-2 font-mono text-xs">{seed?.serverSeedHash ?? '…'}</code>{seed && <CopyButton text={seed.serverSeedHash} />}</div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <div>
          <label htmlFor="client-seed" className="label">Client seed</label>
          <input id="client-seed" className="input font-mono text-sm" value={client} maxLength={64} onChange={(e) => setClient(e.target.value)} />
        </div>
        <div>
          <div className="label">Next nonce</div>
          <div className="rounded-xl border border-line bg-bg/70 px-3.5 py-2.5 font-mono num">{seed?.nonce ?? '…'}</div>
        </div>
      </div>
      <button className="btn-primary">Rotate seed & reveal current</button>
      {revealed && (
        <div className="rounded-xl border border-win/30 bg-win/5 p-3 text-xs animate-in">
          <div className="font-semibold text-win">Revealed server seed</div>
          <div className="mt-1 flex items-center gap-2"><code className="flex-1 break-all font-mono">{revealed.seed}</code><CopyButton text={revealed.seed} /></div>
          <p className="mt-1 text-ink-3">Hash: <span className="font-mono">{revealed.hash}</span></p>
        </div>
      )}
    </form>
  );
}

function Verifier() {
  const [serverSeed, setServerSeed] = useState('');
  const [clientSeed, setClientSeed] = useState('');
  const [nonce, setNonce] = useState('0');
  const [game, setGame] = useState<GameId>('duel');
  const [out, setOut] = useState<{ outcome: Outcome; hash: string } | null>(null);

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    const floats = await fairFloats(hmacSha256, serverSeed.trim(), clientSeed.trim(), Number(nonce) || 0, FLOATS_NEEDED[game]);
    const outcome = resolveOutcome(game, game === 'duel' ? { mode: 'higher' } : { side: 'heads' }, floats);
    setOut({ outcome, hash: await sha256Hex(serverSeed.trim()) });
  };

  return (
    <form className="card space-y-4 p-6" onSubmit={verify}>
      <h2 className="text-lg font-bold">Verify a bet</h2>
      <p className="text-sm text-ink-2">Runs entirely in your browser with WebCrypto — nothing is sent to us.</p>
      <div>
        <label htmlFor="v-server" className="label">Server seed (revealed)</label>
        <input id="v-server" className="input font-mono text-sm" value={serverSeed} onChange={(e) => setServerSeed(e.target.value)} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_110px_140px]">
        <div>
          <label htmlFor="v-client" className="label">Client seed</label>
          <input id="v-client" className="input font-mono text-sm" value={clientSeed} onChange={(e) => setClientSeed(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="v-nonce" className="label">Nonce</label>
          <input id="v-nonce" className="input font-mono text-sm" inputMode="numeric" value={nonce} onChange={(e) => setNonce(e.target.value.replace(/\D/g, ''))} />
        </div>
        <div>
          <label htmlFor="v-game" className="label">Game</label>
          <select id="v-game" className="input text-sm" value={game} onChange={(e) => setGame(e.target.value as GameId)}>
            <option value="duel">Dispenser Duel</option>
            <option value="coinflip">Coinflip</option>
          </select>
        </div>
      </div>
      <button className="btn-primary">Verify</button>
      {out && (
        <div className="rounded-xl border border-line bg-bg/60 p-4 text-sm animate-in" aria-live="polite">
          {out.outcome.game === 'duel' ? (
            <p>You rolled <b className="text-accent-2">{out.outcome.player}</b>, house rolled <b className="text-accent-2">{out.outcome.house}</b>.</p>
          ) : (
            <p>The coin landed <b className="text-accent-2 capitalize">{out.outcome.flip}</b>.</p>
          )}
          <p className="mt-2 text-xs text-ink-3">SHA-256(server seed) = <span className="break-all font-mono">{out.hash}</span> — this must match the hash shown before you bet.</p>
        </div>
      )}
    </form>
  );
}

export default function Fair() {
  return (
    <div className="space-y-8">
      <header>
        <p className="pill mb-3">HMAC-SHA256 · open algorithm</p>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Provably fair</h1>
        <p className="mt-2 max-w-2xl text-ink-2">
          Every result is fixed before you bet and can be checked after. We can’t change an outcome without you noticing.
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        <SeedPanel />
        <Verifier />
      </div>
      <section className="prose-lite max-w-3xl">
        <h2>How it works</h2>
        <ul>
          <li><b>Server seed</b> — 32 random bytes we generate. You see its SHA-256 hash before betting, which commits us to it.</li>
          <li><b>Client seed</b> — a value you control. Change it any time so we can’t pre-pick results for you.</li>
          <li><b>Nonce</b> — counts your bets on the current seed pair, starting at 0.</li>
        </ul>
        <p>
          For each bet we compute <code>HMAC_SHA256(serverSeed, clientSeed:nonce:0)</code> and read it 4 bytes at a time as
          numbers between 0 and 1. Dispenser Duel uses the first two: <code>floor(n × 9) + 1</code> for you, then for the house.
          Coinflip uses the first: below 0.5 is heads.
        </p>
        <p>
          When you rotate your seed, the old server seed is revealed. Hash it — it must match what you were shown — then
          replay any bet with the verifier above.
        </p>
      </section>
    </div>
  );
}
