import { lazy, Suspense, useEffect, useState } from 'react';
import { Router, useRouter } from './router.tsx';
import { AppProvider } from './store.tsx';
import { Layout } from './components/Layout.tsx';
import Home from './pages/Home.tsx';
import Duel from './pages/Duel.tsx';
import Coinflip from './pages/Coinflip.tsx';
import Fair from './pages/Fair.tsx';
import { Faq, Terms, NotFound } from './pages/Static.tsx';

// Private, non-indexed pages are code-split out of the main bundle.
const Wallet = lazy(() => import('./pages/Wallet.tsx'));
const Admin = lazy(() => import('./pages/Admin.tsx'));

const PAGES: Record<string, React.ComponentType> = {
  '/': Home,
  '/duel': Duel,
  '/coinflip': Coinflip,
  '/fair': Fair,
  '/faq': Faq,
  '/terms': Terms,
  '/wallet': Wallet,
  '/admin': Admin,
};

/** Private pages render nothing on the server (no SEO value), so SSR never suspends on them. */
const CLIENT_ONLY = new Set(['/wallet', '/admin']);
const Skeleton = () => <div className="card h-64 animate-pulse" aria-busy="true" />;

function Page() {
  const { route } = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const C = PAGES[route.path] ?? NotFound;
  if (CLIENT_ONLY.has(route.path) && !mounted) return <Skeleton />;
  return (
    <Suspense fallback={<Skeleton />}>
      <C />
    </Suspense>
  );
}

export default function App({ path }: { path: string }) {
  return (
    <Router initialPath={path}>
      <AppProvider>
        <Layout>
          <Page />
        </Layout>
      </AppProvider>
    </Router>
  );
}
