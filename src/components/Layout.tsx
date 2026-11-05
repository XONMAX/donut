import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useRouter } from '../router.tsx';
import { useApp } from '../store.tsx';
import { SITE } from '../../shared/site.ts';
import { Icon, Money, PlayerHead } from './ui.tsx';
import { LinkModal } from './LinkModal.tsx';

const NAV = [
  { href: '/duel', label: 'Dispenser Duel' },
  { href: '/coinflip', label: 'Coinflip' },
  { href: '/fair', label: 'Provably Fair' },
  { href: '/faq', label: 'FAQ' },
];

function UserMenu() {
  const { user, logout } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    addEventListener('mousedown', close);
    return () => removeEventListener('mousedown', close);
  }, []);
  if (!user) return null;
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="btn-ghost px-2 py-1.5" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <PlayerHead name={user.username} size={24} />
        <span className="hidden max-w-28 truncate sm:inline">{user.username}</span>
      </button>
      {open && (
        <div role="menu" className="card absolute right-0 z-40 mt-2 w-48 p-1.5 animate-in">
          <Link role="menuitem" href="/wallet" className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5" onClick={() => setOpen(false)}>Wallet</Link>
          <Link role="menuitem" href="/fair" className="block rounded-lg px-3 py-2 text-sm hover:bg-white/5" onClick={() => setOpen(false)}>Seeds & fairness</Link>
          <button role="menuitem" type="button" className="block w-full rounded-lg px-3 py-2 text-left text-sm text-loss hover:bg-white/5" onClick={() => { setOpen(false); void logout(); }}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function Header() {
  const { user, ready, openLink } = useApp();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-extrabold tracking-tight" aria-label={`${SITE.name} home`}>
          <Icon.logo className="h-8 w-8" />
          <span className="text-lg">{SITE.name}</span>
        </Link>
        <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-2 hover:bg-white/5 hover:text-ink aria-[current=page]:text-accent-2">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Link href="/wallet" className="btn-ghost px-3 py-1.5" aria-label="Wallet balance">
                <Icon.wallet className="h-4 w-4 text-accent" />
                <Money cents={user.balance} className="font-bold" />
              </Link>
              <UserMenu />
            </>
          ) : (
            <button type="button" className="btn-primary" disabled={!ready} onClick={() => openLink()}>
              <Icon.link className="h-4 w-4" /> Link DonutSMP
            </button>
          )}
        </div>
      </div>
      <nav aria-label="Games" className="flex gap-1 overflow-x-auto border-t border-line px-3 py-1.5 md:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-ink-2 aria-[current=page]:bg-white/5 aria-[current=page]:text-accent-2">
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-ink-3 sm:grid-cols-3">
        <div>
          <div className="mb-2 flex items-center gap-2 font-bold text-ink"><Icon.logo className="h-6 w-6" /> {SITE.name}</div>
          <p>{SITE.tagline}. In-game currency only — no real money.</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-2">
          <Link href="/duel" className="hover:text-ink">Dispenser Duel</Link>
          <Link href="/coinflip" className="hover:text-ink">Coinflip</Link>
          <Link href="/fair" className="hover:text-ink">Provably Fair</Link>
          <Link href="/faq" className="hover:text-ink">FAQ</Link>
          <Link href="/terms" className="hover:text-ink">Terms & Responsible Play</Link>
        </nav>
        <p className="text-xs leading-relaxed">
          Not affiliated with DonutSMP, Mojang AB or Microsoft. Minecraft is a trademark of Mojang AB. 18+ only. Play for fun, never chase losses.
        </p>
      </div>
    </footer>
  );
}

function Toasts() {
  const { toasts } = useApp();
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(92vw,360px)] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`card pointer-events-auto px-4 py-3 text-sm animate-in ${
            t.kind === 'ok' ? 'border-win/40 text-win' : t.kind === 'err' ? 'border-loss/40 text-loss' : 'text-ink'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { path } = useRouter();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink">
        Skip to content
      </a>
      <Header />
      <main id="main" key={path} className="mx-auto max-w-6xl px-4 pt-8">
        {children}
      </main>
      <Footer />
      <LinkModal />
      <Toasts />
    </>
  );
}
