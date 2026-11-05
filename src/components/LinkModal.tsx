import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError, type LinkStart } from '../api.ts';
import { useApp } from '../store.tsx';
import { CopyButton, PlayerHead, Money } from './ui.tsx';

export function LinkModal() {
  const { linkOpen, openLink, refreshMe, toast, config } = useApp();
  const [username, setUsername] = useState('');
  const [pending, setPending] = useState<LinkStart | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resume an in-progress link after a page reload.
  useEffect(() => {
    if (!linkOpen) return;
    api<{ link: { username: string; code: string; expiresAt: number } | null }>('/me').then((me) => {
      if (me.link) setPending({ ...me.link, botUsername: config.botUsername, preview: null });
    }).catch(() => {});
    setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && openLink(false);
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [linkOpen, openLink, config.botUsername]);

  // Poll for the in-game verification.
  useEffect(() => {
    if (!pending) return;
    const tick = async () => {
      setLeft(Math.max(0, Math.round((pending.expiresAt - Date.now()) / 1000)));
      const s = await api<{ status: string }>('/link/status').catch(() => null);
      if (s?.status === 'verified') {
        await refreshMe();
        toast(`Linked ${pending.username} — welcome!`, 'ok');
        setPending(null);
        openLink(false);
      } else if (s?.status === 'expired') {
        setPending(null);
        setError('That code expired. Start again to get a new one.');
      }
    };
    void tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, [pending, refreshMe, toast, openLink]);

  if (!linkOpen) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      setPending(await api<LinkStart>('/link/start', { body: { username: username.trim() } }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start linking');
    } finally {
      setBusy(false);
    }
  };

  const command = pending ? `/msg ${pending.botUsername} ${pending.code}` : '';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && openLink(false)}>
      <div role="dialog" aria-modal="true" aria-labelledby="link-title" className="card w-full max-w-md p-6 animate-in">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="link-title" className="text-lg font-bold">Link your DonutSMP account</h2>
            <p className="mt-1 text-sm text-ink-2">Prove you own the account with a one-time in-game code. No password, no API key.</p>
          </div>
          <button type="button" aria-label="Close" className="btn-ghost h-8 w-8 p-0" onClick={() => openLink(false)}>✕</button>
        </div>

        {!pending ? (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="mc-name" className="label">Minecraft username</label>
              <input
                ref={inputRef}
                id="mc-name"
                className="input"
                autoComplete="username"
                spellCheck={false}
                placeholder="e.g. Notch"
                maxLength={17}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
              <p className="mt-1.5 text-xs text-ink-3">Bedrock players: include the leading dot, e.g. <span className="kbd">.Steve</span></p>
            </div>
            {error && <p role="alert" className="rounded-lg bg-loss/10 px-3 py-2 text-sm text-loss">{error}</p>}
            <button className="btn-primary w-full" disabled={busy || username.trim().length < 3}>
              {busy ? 'Checking…' : 'Get my code'}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-line bg-bg/60 p-3">
              <PlayerHead name={pending.username} size={36} />
              <div className="min-w-0">
                <div className="font-semibold">{pending.username}</div>
                {pending.preview && (
                  <div className="text-xs text-ink-3">In-game balance <Money cents={pending.preview.money} className="text-ink-2" /></div>
                )}
              </div>
            </div>
            <ol className="space-y-3 text-sm text-ink-2">
              <li><b className="text-ink">1.</b> Join <span className="kbd">donutsmp.net</span> on that account.</li>
              <li>
                <b className="text-ink">2.</b> Send this in chat:
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 p-3">
                  <code className="flex-1 truncate font-mono text-base font-semibold text-accent-2">{command}</code>
                  <CopyButton text={command} />
                </div>
              </li>
              <li><b className="text-ink">3.</b> This window updates by itself once the bot sees your message.</li>
            </ol>
            <div className="flex items-center justify-between text-xs text-ink-3">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> Waiting for your message…
              </span>
              <span className="num">Expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>
            </div>
            {config.bridge.kind === 'mock' && (
              <p className="rounded-lg bg-push/10 px-3 py-2 text-xs text-push">
                Dev mode: no real bot is connected. Use <a className="underline" href="/admin">/admin</a> → “Simulate whisper” to complete this.
              </p>
            )}
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => {
                void api('/link/cancel', { body: {} });
                setPending(null);
              }}
            >
              Use a different name
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
