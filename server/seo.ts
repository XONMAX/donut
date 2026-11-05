import { SITE, ROUTES, FAQ, type RouteMeta } from '../shared/site.ts';
import { config } from './config.ts';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** JSON for a <script> tag: escape "<" so content can never close the tag. */
const jsonLd = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

export function buildHead(route: RouteMeta, pathname: string): string {
  const base = config.siteUrl;
  const url = `${base}${route.path === '*' ? pathname : route.path}`;
  const image = `${base}/og.png`;
  const tags = [
    `<title>${esc(route.title)}</title>`,
    `<meta name="description" content="${esc(route.description)}">`,
    route.noindex
      ? '<meta name="robots" content="noindex, nofollow">'
      : '<meta name="robots" content="index, follow, max-image-preview:large">',
    route.path !== '*' ? `<link rel="canonical" href="${esc(url)}">` : '',
    `<meta property="og:site_name" content="${esc(SITE.name)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="${SITE.locale}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:title" content="${esc(route.title)}">`,
    `<meta property="og:description" content="${esc(route.description)}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${esc(`${SITE.name} — ${SITE.tagline}`)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(route.title)}">`,
    `<meta name="twitter:description" content="${esc(route.description)}">`,
    `<meta name="twitter:image" content="${image}">`,
  ];

  if (route.path === '/') {
    tags.push(
      jsonLd({
        '@context': 'https://schema.org',
        '@graph': [
          { '@type': 'WebSite', '@id': `${base}/#website`, url: `${base}/`, name: SITE.name, description: SITE.description, inLanguage: 'en' },
          { '@type': 'Organization', '@id': `${base}/#org`, name: SITE.name, url: `${base}/`, logo: `${base}/icon-512.png` },
        ],
      }),
    );
  }
  if (route.path === '/faq') {
    tags.push(
      jsonLd({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      }),
    );
  }
  if (route.path === '/duel' || route.path === '/coinflip') {
    tags.push(
      jsonLd({
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: route.breadcrumb,
        url,
        applicationCategory: 'GameApplication',
        operatingSystem: 'Any',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        isPartOf: { '@id': `${base}/#website` },
      }),
    );
  }
  if (route.breadcrumb && !route.noindex) {
    tags.push(
      jsonLd({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${base}/` },
          { '@type': 'ListItem', position: 2, name: route.breadcrumb, item: url },
        ],
      }),
    );
  }
  return tags.filter(Boolean).join('\n    ');
}

export function sitemapXml(): string {
  const today = new Date().toISOString().slice(0, 10);
  const urls = ROUTES.filter((r) => !r.noindex)
    .map(
      (r) =>
        `  <url><loc>${config.siteUrl}${r.path}</loc><lastmod>${today}</lastmod>` +
        `<changefreq>${r.changefreq ?? 'weekly'}</changefreq><priority>${(r.priority ?? 0.5).toFixed(1)}</priority></url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function robotsTxt(): string {
  return ['User-agent: *', 'Allow: /', 'Disallow: /api/', 'Disallow: /admin', 'Disallow: /wallet', '', `Sitemap: ${config.siteUrl}/sitemap.xml`, ''].join('\n');
}
