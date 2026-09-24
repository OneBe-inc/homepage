import { readFile, readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, extname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

// Small-site page inventory: keep these expectations aligned with published URLs.
const CANONICAL = 'https://onebe-inc.github.io/homepage/';
const PAGES = [
  { file: 'index.html', url: CANONICAL, index: true },
  { file: '404.html', url: `${CANONICAL}404.html`, index: false },
];
const EXPECTED_PRICES = [10000, 15000, 20000];
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = resolve(ROOT, 'public');
const checkedAt = new Date().toISOString();
const results = [];
const documents = new Map();
const assets = new Map();
const remoteReferences = new Set();
let targetBase;

function result(rule, url, status, expected, actual, evidence, severity = 'error') {
  results.push({ rule_id: rule, url, status, severity, expected, actual, evidence, checked_at: checkedAt, environment: targetBase ? `static + HTTP ${targetBase}` : 'static' });
}
function check(rule, url, condition, expected, actual, evidence, severity) {
  result(rule, url, condition ? 'PASS' : 'FAIL', expected, actual, evidence, severity);
}
const attribute = (node, name) => node?.attrs?.find((item) => item.name === name)?.value;
const tokens = (value = '') => value.toLowerCase().split(/\s+/).filter(Boolean);
function walk(node, callback) {
  callback(node);
  for (const child of node.childNodes ?? []) walk(child, callback);
}
function all(node, predicate) {
  const found = [];
  walk(node, (item) => { if (predicate(item)) found.push(item); });
  return found;
}
const tags = (node, name) => all(node, (item) => item.tagName === name);
function hidden(node) {
  for (let current = node; current; current = current.parentNode) {
    if (['head', 'script', 'style', 'template'].includes(current.tagName)) return true;
    if (attribute(current, 'hidden') !== undefined || attribute(current, 'aria-hidden') === 'true') return true;
    if (/(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attribute(current, 'style') ?? '')) return true;
  }
  return false;
}
function text(node, visibleOnly = false) {
  if (visibleOnly && hidden(node)) return '';
  if (node.nodeName === '#text') return node.value;
  return (node.childNodes ?? []).map((child) => text(child, visibleOnly)).join(' ');
}
const normalized = (value) => value.normalize('NFKC').replace(/\s+/g, ' ').trim();
function location(node, file) {
  return `${file}:${node.sourceCodeLocation?.startLine ?? '?'}`;
}
function localFile(url) {
  const parsed = new URL(url);
  const base = new URL(CANONICAL);
  if (parsed.origin !== base.origin) return null;
  if (!parsed.pathname.startsWith(base.pathname)) throw new Error(`Project Pages path must begin with ${base.pathname}: ${parsed.pathname}`);
  const pathname = decodeURIComponent(parsed.pathname.slice(base.pathname.length));
  const path = resolve(PUBLIC, pathname || 'index.html');
  if (path !== PUBLIC && !path.startsWith(`${PUBLIC}${sep}`)) throw new Error('Asset path leaves public directory');
  return parsed.pathname.endsWith('/') ? resolve(path, pathname ? 'index.html' : '') : path;
}
async function isFile(path) {
  try { return (await stat(path)).isFile(); } catch { return false; }
}
async function assetReference(value, base, evidence, kind = 'asset') {
  if (!value || /^(?:data:|blob:|mailto:|tel:)/i.test(value)) return;
  let url;
  try { url = new URL(value, base); } catch {
    check('V11.URL_SYNTAX', base, false, 'A valid URL', value, evidence);
    return;
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    check('V11.URL_PROTOCOL', base, false, 'http(s), mailto, tel, or in-page URL', url.protocol, evidence);
    return;
  }
  let path;
  try { path = localFile(url); } catch (error) {
    check('V05.PROJECT_PATH', base, false, 'Local URLs resolve inside /homepage/', error.message, evidence);
    return;
  }
  if (!path) { remoteReferences.add(url.href); return; }
  check('V11.LOCAL_REFERENCE', base, await isFile(path), 'Local target exists', relative(PUBLIC, path), evidence);
  if (url.hash) {
    let document = documents.get(path);
    if (!document && extname(path) === '.html' && await isFile(path)) {
      document = parse(await readFile(path, 'utf8'));
      documents.set(path, document);
    }
    if (document) {
      let id;
      try { id = decodeURIComponent(url.hash.slice(1)); } catch { id = url.hash.slice(1); }
      check('V11.FRAGMENT', base, all(document, (node) => attribute(node, 'id') === id || (node.tagName === 'a' && attribute(node, 'name') === id)).length > 0, 'Fragment has a target ID', id, evidence);
    }
  }
  if (kind === 'asset') {
    url.hash = '';
    assets.set(url.href, { path, evidence });
  }
}
function srcsetUrls(value) {
  // Data URLs are self-contained and need no filesystem or HTTP check.
  if (!value || value.trim().startsWith('data:')) return [];
  return value.split(',').map((candidate) => candidate.trim().split(/\s+/)[0]).filter(Boolean);
}

function validateHeadings(document, page) {
  const headings = all(document, (node) => /^h[1-6]$/.test(node.tagName ?? ''));
  const h1 = headings.filter((node) => node.tagName === 'h1');
  check('V19.H1', page.url, h1.length === 1 && !hidden(h1[0]), 'Exactly one visible h1', h1.length, page.file);
  for (const node of headings) {
    check('V19.HEADING_TEXT', page.url, normalized(text(node)).length > 0, 'Nonempty heading', normalized(text(node)), location(node, page.file));
    let ancestor = node.parentNode;
    let nested = false;
    while (ancestor) { if (/^h[1-6]$/.test(ancestor.tagName ?? '')) nested = true; ancestor = ancestor.parentNode; }
    check('V19.HEADING_NESTING', page.url, !nested, 'Headings are not nested', node.tagName, location(node, page.file));
  }
  const main = tags(document, 'main')[0] ?? tags(document, 'body')[0];
  let previous = 1;
  for (const node of all(main ?? document, (item) => /^h[1-6]$/.test(item.tagName ?? '') && !hidden(item))) {
    let current = node.parentNode;
    let fixedRegion = false;
    while (current && current !== main) {
      if (['nav', 'aside', 'footer'].includes(current.tagName)) fixedRegion = true;
      current = current.parentNode;
    }
    if (fixedRegion) continue;
    const level = Number(node.tagName.slice(1));
    check('V19.HEADING_ORDER', page.url, level <= previous + 1, 'Descend by at most one heading level; returning upwards is allowed', `h${previous} → h${level}`, location(node, page.file));
    previous = level;
  }
}
function validateMetadata(document, page) {
  const head = tags(document, 'head')[0] ?? document;
  const titles = tags(head, 'title');
  const descriptions = tags(head, 'meta').filter((node) => attribute(node, 'name')?.toLowerCase() === 'description');
  const canonical = tags(head, 'link').filter((node) => tokens(attribute(node, 'rel')).includes('canonical'));
  check('V07.TITLE', page.url, titles.length === 1 && normalized(text(titles[0])).length > 0, 'One nonempty title', titles.map((node) => normalized(text(node))), page.file);
  check('V07.DESCRIPTION', page.url, page.index ? descriptions.length === 1 && Boolean(attribute(descriptions[0], 'content')?.trim()) : descriptions.length <= 1, page.index ? 'One nonempty description' : 'At most one description', descriptions.map((node) => attribute(node, 'content')), page.file);
  check('V05.CANONICAL', page.url, page.index ? canonical.length === 1 && attribute(canonical[0], 'href') === page.url : canonical.length === 0, page.index ? `One absolute canonical: ${page.url}` : '404 is excluded from canonical indexing', canonical.map((node) => attribute(node, 'href')), page.file);
  check('V07.LANGUAGE', page.url, /^ja(?:-|$)/i.test(attribute(tags(document, 'html')[0], 'lang') ?? ''), 'Japanese html lang', attribute(tags(document, 'html')[0], 'lang') ?? null, page.file);
  const robots = tags(head, 'meta').filter((node) => /^(?:robots|googlebot|bingbot)$/i.test(attribute(node, 'name') ?? '')).map((node) => attribute(node, 'content')?.toLowerCase() ?? '');
  const restrictive = /(?:^|[\s,])(?:noindex|none|nosnippet)(?:$|[\s,])|max-snippet\s*:\s*0(?:$|[\s,])/;
  const noindex = /(?:^|[\s,])(?:noindex|none)(?:$|[\s,])/;
  check('V03.META_INDEX', page.url, page.index ? !robots.some((value) => restrictive.test(value)) : robots.some((value) => noindex.test(value)), page.index ? 'No noindex/nosnippet directives' : '404 has noindex', robots, page.file);
  return { title: normalized(text(titles[0] ?? {})), description: attribute(descriptions[0], 'content') };
}
function validatePrices(document, page) {
  if (!page.index) return;
  const scripts = tags(document, 'script').filter((node) => attribute(node, 'type')?.toLowerCase() === 'application/ld+json');
  const structured = [];
  check('V08.JSONLD_EXISTS', page.url, scripts.length > 0, 'JSON-LD exists for the service', scripts.length, page.file);
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(text(script));
      check('V08.JSONLD_PARSE', page.url, typeof parsed === 'object' && parsed !== null, 'Valid JSON-LD object/array', 'Parsed', location(script, page.file));
      const visit = (value) => {
        if (!value || typeof value !== 'object') return;
        if (!Array.isArray(value)) structured.push(value);
        for (const child of Object.values(value)) visit(child);
      };
      visit(parsed);
    } catch (error) { check('V08.JSONLD_PARSE', page.url, false, 'Valid JSON-LD', error.message, location(script, page.file)); }
  }
  const priceObjects = structured.filter((node) => node.price !== undefined && node.priceCurrency !== undefined);
  const actual = [...new Set(priceObjects.map((node) => Number(String(node.price).replace(/,/g, ''))))].sort((a, b) => a - b);
  check('V08.PLAN_PRICES', page.url, EXPECTED_PRICES.every((price) => actual.includes(price)), `Offers contain ${EXPECTED_PRICES.join(', ')} JPY`, actual, 'Parsed JSON-LD price / priceCurrency');
  check('V08.CURRENCY', page.url, priceObjects.length > 0 && priceObjects.every((node) => node.priceCurrency === 'JPY'), 'Every declared price uses JPY', [...new Set(priceObjects.map((node) => node.priceCurrency))], 'Parsed JSON-LD');
  const bodyText = normalized(text(tags(document, 'body')[0] ?? document, true));
  for (const price of new Set([...EXPECTED_PRICES, ...actual])) {
    const formatted = price.toLocaleString('en-US');
    const amount = `(?:${price}|${formatted.replaceAll(',', '[,，]')})`;
    const visiblePrice = new RegExp(`(?:[¥￥]\\s*${amount}(?![\\d,])|(?<![\\d,])${amount}\\s*円)`);
    check('V08.VISIBLE_PRICE', page.url, Number.isFinite(price) && price >= 0 && visiblePrice.test(bodyText), `${formatted}円 or ¥${formatted} in readable HTML`, visiblePrice.test(bodyText) ? formatted : 'Missing', 'Body text excluding hidden/script/style/template; browser visibility checked separately');
  }
  for (const node of all(document, (item) => attribute(item, 'data-plan-price') !== undefined)) {
    const value = Number(attribute(node, 'data-plan-price'));
    const visible = normalized(text(node, true)).replace(/[,，\s]/g, '');
    check('V08.PLAN_CARD', page.url, EXPECTED_PRICES.includes(value) && actual.includes(value) && visible.includes(String(value)), 'Card data, visible amount, and JSON-LD agree', { price: value, currency: attribute(node, 'data-plan-currency') ?? 'JPY' }, location(node, page.file));
    if (attribute(node, 'data-plan-currency') !== undefined) check('V08.PLAN_CARD_CURRENCY', page.url, attribute(node, 'data-plan-currency') === 'JPY', 'JPY', attribute(node, 'data-plan-currency'), location(node, page.file));
  }
  const ids = structured.filter((node) => node['@id'] !== undefined).map((node) => node['@id']);
  check('V08.IDENTIFIERS', page.url, ids.length > 0 && ids.every((id) => typeof id === 'string' && /^https:\/\//.test(id)), 'Stable absolute HTTPS JSON-LD identifiers', ids, 'Parsed JSON-LD');
}
async function validatePage(page) {
  const path = resolve(PUBLIC, page.file);
  const exists = await isFile(path);
  check('V02.HTML_EXISTS', page.url, exists, `${page.file} exists`, exists, page.file);
  if (!exists) return;
  const html = await readFile(path, 'utf8');
  const document = parse(html, { sourceCodeLocationInfo: true });
  documents.set(path, document);
  const metadata = validateMetadata(document, page);
  validateHeadings(document, page);
  validatePrices(document, page);
  const ids = all(document, (node) => attribute(node, 'id') !== undefined).map((node) => attribute(node, 'id'));
  check('V11.UNIQUE_IDS', page.url, ids.length === new Set(ids).size, 'Unique element IDs', ids.filter((id, index) => ids.indexOf(id) !== index), page.file);
  for (const node of tags(document, 'img')) {
    const evidence = location(node, page.file);
    check('V13.IMG_ALT', page.url, attribute(node, 'alt') !== undefined, 'Each image has alt (empty is allowed for decoration)', attribute(node, 'alt') ?? null, evidence);
    check('V13.IMG_SIZE', page.url, ['width', 'height'].every((name) => /^\d+$/.test(attribute(node, name) ?? '') && Number(attribute(node, name)) > 0), 'Explicit positive image width and height', { width: attribute(node, 'width'), height: attribute(node, 'height') }, evidence);
  }
  for (const node of all(document, (item) => Boolean(item.tagName))) {
    const evidence = location(node, page.file);
    const names = [];
    if (['img', 'script', 'source', 'video', 'audio', 'iframe'].includes(node.tagName)) names.push('src');
    if (node.tagName === 'video') names.push('poster');
    if (node.tagName === 'object') names.push('data');
    if (node.tagName === 'link' && tokens(attribute(node, 'rel')).some((rel) => ['stylesheet', 'icon', 'apple-touch-icon', 'preload', 'manifest'].includes(rel))) names.push('href');
    for (const name of names) if (attribute(node, name)) await assetReference(attribute(node, name), page.url, evidence);
    if (['img', 'source'].includes(node.tagName)) for (const value of srcsetUrls(attribute(node, 'srcset'))) await assetReference(value, page.url, evidence);
    if (node.tagName === 'a') {
      check('V11.ANCHOR_HREF', page.url, Boolean(attribute(node, 'href')) && attribute(node, 'href') !== '#', 'A navigation link has a meaningful href', attribute(node, 'href') ?? null, evidence);
      if (attribute(node, 'href')) await assetReference(attribute(node, 'href'), page.url, evidence, 'link');
    }
  }
  return metadata;
}
async function validateSitemap() {
  const path = resolve(PUBLIC, 'sitemap.xml');
  const exists = await isFile(path);
  check('V05.SITEMAP_EXISTS', CANONICAL, exists, 'sitemap.xml exists', exists, 'sitemap.xml');
  if (!exists) return;
  const xml = await readFile(path, 'utf8');
  const validation = XMLValidator.validate(xml);
  check('V05.SITEMAP_XML', CANONICAL, validation === true, 'Well-formed XML', validation === true ? 'Valid' : validation, 'sitemap.xml');
  if (validation !== true) return;
  const parsed = new XMLParser({ ignoreAttributes: false, isArray: (name) => name === 'url' }).parse(xml);
  const locations = (parsed.urlset?.url ?? []).map((item) => item.loc);
  const expected = PAGES.filter((page) => page.index).map((page) => page.url);
  check('V05.SITEMAP_NAMESPACE', CANONICAL, parsed.urlset?.['@_xmlns'] === 'http://www.sitemaps.org/schemas/sitemap/0.9', 'Standard sitemap XML namespace', parsed.urlset?.['@_xmlns'] ?? null, 'sitemap.xml');
  check('V05.SITEMAP_URLS', CANONICAL, locations.length === expected.length && new Set(locations).size === locations.length && expected.every((url) => locations.includes(url)), 'Only indexable canonical inventory URLs', locations, 'sitemap.xml');
  assets.set(`${CANONICAL}sitemap.xml`, { path, evidence: 'sitemap.xml' });
}
async function filesUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}
async function validateOutput() {
  const patterns = [
    { name: 'development URLs', regex: /(?:https?:\/\/)?(?:localhost|127\.0\.0\.1)(?=[:/\s"'<]|$)|https?:\/\/[^\s"'<>]+\.(?:vercel\.app|netlify\.app)(?=[:/\s"'<]|$)/i },
    { name: 'placeholder values', regex: /\b(?:example\.(?:com|org|net)|your[-_]?(?:domain|api[-_]?key|company)|lorem ipsum|TODO|TBD)\b|(?:ここに(?:会社名|URL|テキスト)|ダミーテキスト)/i },
    { name: 'private local paths', regex: /(?:[A-Z]:[\\/](?:Users|home)[\\/]|file:\/\/|\/(?:Users|home)\/[^/\s]+\/)/i },
    { name: 'credentials', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b|\bAKIA[A-Z0-9]{16}\b/ },
  ];
  for (const path of await filesUnder(PUBLIC)) {
    if (!/\.(?:html|css|js|mjs|json|xml|txt|svg|webmanifest)$/i.test(path)) continue;
    const source = await readFile(path, 'utf8');
    const name = relative(PUBLIC, path).split(sep).join('/');
    for (const pattern of patterns) check('V12.V16.OUTPUT_HYGIENE', `${CANONICAL}${name}`, !pattern.regex.test(source), `No ${pattern.name}`, pattern.regex.test(source) ? `Detected ${pattern.name} (value redacted)` : 'None detected', name);
    if (extname(path) === '.css') {
      for (const match of source.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)) await assetReference(match[2], `${CANONICAL}${name}`, name);
    }
  }
}
function allowedUrl(input) {
  const url = new URL(input);
  if (url.username || url.password) throw new Error('Credentials in HTTP check URLs are prohibited');
  const production = url.protocol === 'https:' && url.hostname === 'onebe-inc.github.io' && (!url.port || url.port === '443') && url.pathname.startsWith('/homepage/');
  const loopback = ['http:', 'https:'].includes(url.protocol) && url.hostname === '127.0.0.1';
  if (!production && !loopback) throw new Error('HTTP checks allow only https://onebe-inc.github.io/homepage/ and 127.0.0.1');
  return url;
}
async function get(input) {
  let url = allowedUrl(input);
  const chain = [];
  const seen = new Set();
  for (let hop = 0; hop < 6; hop += 1) {
    if (seen.has(url.href)) throw new Error('Redirect loop');
    seen.add(url.href);
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'OneBeSiteValidation/1.0', Accept: '*/*' } });
    chain.push({ url: url.href, status: response.status });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get('location');
      await response.arrayBuffer();
      if (!next) throw new Error('Redirect response has no Location');
      url = allowedUrl(new URL(next, url));
      continue;
    }
    return { response, chain, url: url.href };
  }
  throw new Error('Too many redirects');
}
async function validateHttp() {
  if (!targetBase) {
    result('V01.V03.V06.HTTP', CANONICAL, 'NOT_TESTED', 'GET checks after publication', 'Run node scripts/check.mjs --url <base>', 'No HTTP target supplied');
    return;
  }
  const requested = new URL(targetBase);
  for (const page of PAGES) {
    const url = page.index ? requested.href : new URL(`__onebe_missing_${Date.now()}__.html`, requested).href;
    try {
      const { response, chain, url: final } = await get(url);
      check(page.index ? 'V01.HTTP_STATUS' : 'V06.HTTP_404', url, page.index ? response.status === 200 : response.status === 404 || response.status === 410, page.index ? '200' : '404 or 410', response.status, chain);
      check('V03.HTTP_HEADER_INDEX', url, page.index ? !/(?:noindex|none|nosnippet)|max-snippet\s*:\s*0\b/i.test(response.headers.get('x-robots-tag') ?? '') : true, page.index ? 'No restrictive X-Robots-Tag' : '404 status verified; meta checked below', response.headers.get('x-robots-tag'), chain);
      check('V02.HTTP_CONTENT_TYPE', url, /text\/html/i.test(response.headers.get('content-type') ?? ''), 'text/html', response.headers.get('content-type'), chain);
      const source = await response.text();
      const document = parse(source);
      validateMetadata(document, { ...page, file: `HTTP GET ${final}` });
      if (page.index) {
        validatePrices(document, page);
        const localDocument = documents.get(resolve(PUBLIC, 'index.html'));
        if (localDocument) {
          const expected = normalized(text(tags(localDocument, 'main')[0] ?? tags(localDocument, 'body')[0], true));
          const actual = normalized(text(tags(document, 'main')[0] ?? tags(document, 'body')[0] ?? document, true));
          check('V02.HTTP_MAIN_CONTENT', url, actual === expected && actual.length > 0, 'Published main text equals the validated local HTML', actual === expected ? 'Equal' : 'Different', chain);
        }
      }
    } catch (error) { check('V01.HTTP_FETCH', url, false, 'Successful permitted GET', error.message, 'GET including validated redirects'); }
  }
  // Sequential requests deliberately limit load on the published site.
  for (const [canonical, asset] of assets) {
    const relativePath = new URL(canonical).pathname.slice(new URL(CANONICAL).pathname.length);
    const url = new URL(relativePath, requested).href;
    try {
      const { response, chain } = await get(url);
      check('V11.HTTP_ASSET', url, response.status === 200, 'Asset responds 200', response.status, chain);
      const contentType = response.headers.get('content-type') ?? '';
      check('V11.HTTP_ASSET_TYPE', url, extname(asset.path) === '.html' || !/text\/html/i.test(contentType), 'Non-HTML asset is not an HTML fallback', contentType, chain);
      const bytes = await response.arrayBuffer();
      check('V11.HTTP_ASSET_BODY', url, bytes.byteLength > 0, 'Nonempty asset', bytes.byteLength, chain);
    } catch (error) { check('V11.HTTP_ASSET', url, false, 'Successful permitted GET', error.message, asset.evidence); }
  }
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--url')) throw new Error('Usage: node scripts/check.mjs [--url https://onebe-inc.github.io/homepage/]');
  if (args.length) {
    const url = allowedUrl(args[1]);
    if (url.search || url.hash) throw new Error('--url must not contain a query or fragment');
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    targetBase = url.href;
  }
  const metadata = [];
  for (const page of PAGES) metadata.push(await validatePage(page));
  const titles = metadata.filter(Boolean).map((page) => page.title);
  check('V07.UNIQUE_PAGE_TITLES', CANONICAL, new Set(titles).size === titles.length, 'Page titles are unique', titles, 'Page inventory');
  await validateSitemap();
  await validateOutput();
  await validateHttp();
  result('V04.PROJECT_ROBOTS', CANONICAL, 'NOT_TESTED', 'Verify origin-root robots.txt and effective bot policy', 'A Project Pages /homepage/robots.txt cannot control origin-root crawler policy', 'Hosting limitation; origin owner review required', 'warning');
  result('V17.V20.EXTERNAL_CONTROLS', CANONICAL, 'NOT_TESTED', 'Search Console/Bing ownership, effective service settings and real bot access', 'Requires external account settings and crawler logs; ordinary GET is insufficient', 'Manual evidence required', 'warning');
  result('V20.TRAINING_POLICY', CANONICAL, 'NOT_TESTED', 'Explicit owner decision on model-training crawler use', 'Search exposure and training policy must be decided separately', 'Existing policy must not be changed by this validator', 'warning');
  result('V10.V22.V23.FACTS', CANONICAL, 'NOT_TESTED', 'Owner review of prices, scope, claims, external profiles and sample-image disclosure', 'HTML equality does not prove business facts or permissions', 'Manual source review required', 'warning');
  result('V02.V11.V13.V14.BROWSER', CANONICAL, 'NOT_TESTED', 'Visual/mobile/keyboard/motion/CTA/performance checks', 'This command checks parsed files and optional GET responses only', 'Record browser checks separately', 'warning');
  result('V09.RICH_RESULT', CANONICAL, 'N/A', 'Do not promise rich-result or AI-citation eligibility from syntax alone', 'Service/Organization JSON-LD is descriptive; no special-result promise', 'No special search display is claimed', 'warning');
  result('V15.MIGRATION', CANONICAL, 'N/A', 'Redirect inventory if replacing existing public routes', 'New single-page site; no migration redirects in this page inventory', 'Revisit if an existing URL is replaced', 'warning');
  if (remoteReferences.size) result('V11.EXTERNAL_LINKS', CANONICAL, 'NOT_TESTED', 'Check external destinations within authorized test scope', [...remoteReferences], 'HTTP validator only requests approved local/production host', 'warning');
}

try { await main(); }
catch (error) { result('V24.RUNNER', CANONICAL, 'FAIL', 'Validator completes successfully', error.message, 'check.mjs'); }
const summary = Object.fromEntries(['PASS', 'FAIL', 'NOT_TESTED', 'N/A'].map((status) => [status, results.filter((item) => item.status === status).length]));
if (process.env.REPORT_PATH) {
  const path = resolve(process.env.REPORT_PATH);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ checked_at: checkedAt, canonical: CANONICAL, target: targetBase ?? null, inventory: PAGES, summary, results }, null, 2)}\n`, 'utf8');
}
console.log(`OneBe site checks: ${Object.entries(summary).map(([status, count]) => `${status} ${count}`).join(' | ')}`);
for (const failure of results.filter((item) => item.status === 'FAIL')) console.error(`${failure.rule_id}: ${failure.url}\n  Expected: ${failure.expected}\n  Actual: ${JSON.stringify(failure.actual)}\n  Evidence: ${typeof failure.evidence === 'string' ? failure.evidence : JSON.stringify(failure.evidence)}`);
if (process.env.REPORT_PATH) console.log(`Report saved: ${resolve(process.env.REPORT_PATH)}`);
process.exitCode = summary.FAIL > 0 ? 1 : 0;
