import { createContext, useContext, useEffect, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { matchRoute, type RouteMeta } from '../shared/site.ts';

interface RouterValue { path: string; route: RouteMeta; navigate: (to: string) => void }
const RouterCtx = createContext<RouterValue>({ path: '/', route: matchRoute('/'), navigate: () => {} });

function setMeta(selector: string, attr: string, value: string) {
  document.querySelector(selector)?.setAttribute(attr, value);
}

export function Router({ initialPath, children }: { initialPath: string; children: ReactNode }) {
  const [path, setPath] = useState(initialPath);

  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  const route = matchRoute(path);

  // Keep <head> in sync on client-side navigation (SSR already set it for the first load).
  useEffect(() => {
    document.title = route.title;
    setMeta('meta[name="description"]', 'content', route.description);
    setMeta('meta[property="og:title"]', 'content', route.title);
    setMeta('meta[property="og:description"]', 'content', route.description);
    setMeta('meta[property="og:url"]', 'content', location.origin + path);
    setMeta('link[rel="canonical"]', 'href', location.origin + route.path);
    setMeta('meta[name="robots"]', 'content', route.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large');
  }, [route, path]);

  const navigate = (to: string) => {
    if (to === location.pathname + location.search) return;
    history.pushState(null, '', to);
    setPath(new URL(to, location.origin).pathname);
    scrollTo({ top: 0 });
  };

  return <RouterCtx.Provider value={{ path, route, navigate }}>{children}</RouterCtx.Provider>;
}

export const useRouter = () => useContext(RouterCtx);

export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const { navigate, path } = useRouter();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target) return;
    if (!href.startsWith('/')) return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={href} aria-current={path === href ? 'page' : undefined} onClick={handle} {...rest} />;
}
