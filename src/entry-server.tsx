import { renderToString } from 'react-dom/server';
import App from './App.tsx';

/** Server-side render for SEO: crawlers get full HTML for every public page. */
export function render(path: string) {
  return { html: renderToString(<App path={path} />) };
}
