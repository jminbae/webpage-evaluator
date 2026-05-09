/* ===========================================================
 * Background Service Worker (MV3)
 * - Fetch robots.txt, llms.txt, sitemap.xml, Wayback
 * - Call PageSpeed Insights API
 * - Call Google Suggest, Naver autocomplete
 * - Open side panel on action click
 * Extension has host_permissions: <all_urls>, so no CORS issues
 * =========================================================== */

// ===== Side Panel Setup =====
// Multiple registration points for robustness:
// 1. Top-level (runs when SW starts)
// 2. onInstalled (runs on install/update)
// 3. onClicked fallback (manually opens panel if setPanelBehavior didn't take effect)

if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('sidePanel.setPanelBehavior (top-level) failed:', err));
}

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((err) => console.error('sidePanel.setPanelBehavior (onInstalled) failed:', err));
  }
});

// Fallback: open side panel manually if setPanelBehavior didn't apply yet
chrome.action.onClicked.addListener(async (tab) => {
  try {
    if (chrome.sidePanel?.open) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    }
  } catch (err) {
    console.error('sidePanel.open failed:', err);
  }
});

const AI_BOTS = [
  'GPTBot', 'ClaudeBot', 'anthropic-ai', 'PerplexityBot',
  'Google-Extended', 'CCBot', 'cohere-ai', 'Bytespider',
  'Applebot-Extended', 'Diffbot', 'omgili', 'meta-externalagent'
];

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Safe wrapper: ensures sendResponse is ALWAYS called, even if handler throws.
  // Without this, an unhandled rejection leaves popup waiting forever (sees "unknown").
  const safe = (promise) => {
    Promise.resolve(promise)
      .then(sendResponse)
      .catch((err) => {
        const detail = err?.stack || err?.message || String(err);
        console.error('[bg] handler failed for', msg.action, '\n', detail);
        sendResponse({ ok: false, error: err?.message || String(err) || 'handler threw' });
      });
  };

  if (msg.action === 'fetch-extras') {
    safe(handleFetchExtras(msg.url));
    return true;
  }
  if (msg.action === 'psi') {
    safe(handlePsi(msg.url, msg.key, msg.strategy));
    return true;
  }
  if (msg.action === 'google-suggest') {
    safe(handleGoogleSuggest(msg.q));
    return true;
  }
  if (msg.action === 'naver-suggest') {
    safe(handleNaverSuggest(msg.q));
    return true;
  }
  if (msg.action === 'site-select-urls') {
    safe(handleSiteSelectUrls(msg.origin));
    return true;
  }
  if (msg.action === 'fetch-url') {
    safe(fetchText(msg.url, 10000).then(r => ({
      url: msg.url, ok: r.ok, html: r.text || '', error: r.error
    })));
    return true;
  }
});

// ===== Site URL selection =====
// Strategy:
// 1. Always include homepage
// 2. Always include ALL "about-like" URLs (high-priority, exhaustive scan)
//    — author/team/profile/doctor/staff pages most often hold E-E-A-T signals
// 3. Group remaining URLs by first path segment.
//    Group <= GROUP_FULL_THRESHOLD → take all
//    Group > threshold → random sample
// 4. Cap total at MAX_TOTAL
const GROUP_FULL_THRESHOLD = 10;
const SAMPLE_PER_LARGE_GROUP = 3;
const MAX_TOTAL = 35;

// High-priority keywords — match anywhere in path. Includes Korean terms.
const ABOUT_KEYWORDS = [
  'about', 'about-us', 'aboutus',
  'team', 'staff', 'author', 'authors', 'profile', 'profiles',
  'doctor', 'doctors', 'physician', 'people', 'members', 'leadership',
  'company', 'history', 'mission', 'vision',
  'contact', 'contact-us',
  // Korean
  '소개', '회사', '회사소개', '저자', '의료진', '진료진', '연혁', '문의', '오시는길'
];

function isAboutLike(url) {
  let path = '';
  try { path = new URL(url).pathname.toLowerCase(); } catch { return false; }
  // decode percent-encoded Korean
  let decoded = path;
  try { decoded = decodeURIComponent(path).toLowerCase(); } catch {}
  return ABOUT_KEYWORDS.some(kw => decoded.includes(kw));
}

// Extract internal links from homepage HTML — works for SPAs without sitemap.
// Returns absolute URLs same-origin only, with query string preserved (for ?idx= routing),
// hash dropped.
async function discoverHomepageLinks(origin) {
  try {
    const res = await fetchText(origin + '/', 10000);
    if (!res.ok || !res.text) return [];
    const html = res.text;
    const links = new Set();
    const re = /<a[^>]+href=["']([^"']+)["']/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      let href = m[1];
      if (!href) continue;
      const lower = href.toLowerCase();
      if (lower.startsWith('#') || lower.startsWith('mailto:') ||
          lower.startsWith('javascript:') || lower.startsWith('tel:')) continue;
      try {
        const u = new URL(href, origin);
        if (u.origin !== origin) continue;
        // Drop hash, keep pathname + search (preserves ?idx=xxx for SPAs)
        const cleaned = u.origin + u.pathname + u.search;
        links.add(cleaned);
      } catch {}
    }
    return [...links];
  } catch {
    return [];
  }
}

async function handleSiteSelectUrls(origin) {
  if (!origin) return { ok: false, error: 'no origin' };

  // 1. Fetch sitemap.xml (may be a sitemap index)
  const sitemapRes = await fetchText(origin + '/sitemap.xml', 8000);
  let allUrls = [];
  if (sitemapRes.ok && sitemapRes.text) {
    const txt = sitemapRes.text;
    const isIndex = txt.includes('<sitemapindex');
    if (isIndex) {
      const childUrls = [...txt.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).slice(0, 5);
      const childResults = await Promise.all(childUrls.map(u => fetchText(u, 8000)));
      childResults.forEach(r => {
        if (r.ok && r.text) {
          [...r.text.matchAll(/<loc>([^<]+)<\/loc>/g)].forEach(m => allUrls.push(m[1]));
        }
      });
    } else {
      allUrls = [...txt.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    }
  }

  const selected = [];
  const seen = new Set();
  const add = (url) => {
    try {
      const u = new URL(url, origin).href;
      if (!seen.has(u)) { seen.add(u); selected.push(u); }
    } catch {}
  };

  // 1. Homepage always
  add(origin + '/');

  // 2. ALL about-like URLs from sitemap (exhaustive)
  const aboutUrls = allUrls.filter(isAboutLike);
  aboutUrls.forEach(add);
  const aboutCount = aboutUrls.length;

  // 3. Discover homepage links — works for SPAs and sites without sitemap.
  // Crawls homepage HTML, extracts <a href> tags, filters same-origin.
  const homepageLinks = await discoverHomepageLinks(origin);
  const homepageAboutLinks = homepageLinks.filter(u => isAboutLike(u) && !seen.has(u));
  const homepageOtherLinks = homepageLinks.filter(u => !isAboutLike(u) && !seen.has(u));

  // Always include all about-like homepage links
  homepageAboutLinks.forEach(add);

  // Cap other homepage links — more aggressive when sitemap is sparse
  const sitemapWasUseful = allUrls.length >= 3;
  const homepageOtherCap = sitemapWasUseful ? 8 : 20;
  homepageOtherLinks.slice(0, homepageOtherCap).forEach(add);
  const homepageLinkCount = homepageLinks.length;

  // 4. Common about-like guess paths — last-resort fallback
  // (Most SPAs already have these as homepage links, so this rarely adds new entries.)
  const guessPaths = [
    '/about', '/about-us', '/aboutus',
    '/team', '/staff', '/doctors', '/doctor', '/profile',
    '/company', '/contact', '/contact-us',
    '/소개', '/회사소개', '/의료진', '/진료진', '/오시는길'
  ];
  let guessAdded = 0;
  if (!sitemapWasUseful && homepageLinks.length < 5) {
    guessPaths.forEach(p => {
      const before = selected.length;
      add(origin + p);
      if (selected.length > before) guessAdded++;
    });
  }

  // 4. Group remaining (non-about) URLs by first path segment
  const remaining = allUrls.filter(u => !seen.has(u));
  const groups = {};
  remaining.forEach(u => {
    try {
      const path = new URL(u).pathname;
      const segments = path.split('/').filter(Boolean);
      const key = segments[0] || '__root__';
      if (!groups[key]) groups[key] = [];
      groups[key].push(u);
    } catch {}
  });

  // 5. For each group: full or sample
  const groupReport = [];
  if (aboutCount > 0) {
    groupReport.push({ prefix: 'about계열', total: aboutCount, mode: 'all' });
  }
  for (const [prefix, urls] of Object.entries(groups)) {
    if (urls.length <= GROUP_FULL_THRESHOLD) {
      urls.forEach(add);
      groupReport.push({ prefix, total: urls.length, mode: 'all' });
    } else {
      const shuffled = [...urls];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      shuffled.slice(0, SAMPLE_PER_LARGE_GROUP).forEach(add);
      groupReport.push({ prefix, total: urls.length, mode: 'sample', sampled: SAMPLE_PER_LARGE_GROUP });
    }
  }

  // 6. Cap at MAX_TOTAL — about-like URLs are added first so they survive the cap
  const finalList = selected.slice(0, MAX_TOTAL);

  return {
    ok: true,
    sitemapFound: sitemapRes.ok && allUrls.length > 0,
    sitemapUrlCount: allUrls.length,
    aboutCount,
    guessAdded,
    sitemapWasUseful,
    urls: finalList,
    groupReport
  };
}

async function handleFetchExtras(targetUrl) {
  let origin = '';
  try { origin = new URL(targetUrl).origin; } catch { return {}; }

  const [robotsRes, llmsRes, sitemapRes, waybackRes] = await Promise.allSettled([
    fetchText(origin + '/robots.txt'),
    fetchText(origin + '/llms.txt'),
    fetchText(origin + '/sitemap.xml'),
    fetchJson(`https://archive.org/wayback/available?url=${encodeURIComponent(targetUrl)}`),
  ]);

  // robots
  let robots = { ok: false };
  if (robotsRes.status === 'fulfilled' && robotsRes.value.ok && robotsRes.value.text.length > 5 && !robotsRes.value.text.includes('<html')) {
    const txt = robotsRes.value.text;
    const blocked = [];
    AI_BOTS.forEach(bot => {
      // Match block: User-agent: BotName ... Disallow: /
      const re = new RegExp(`User-agent:\\s*${escapeRegex(bot)}[\\s\\S]*?(?=User-agent:|$)`, 'i');
      const match = txt.match(re);
      if (match && /Disallow:\s*\/\s*$/im.test(match[0])) blocked.push(bot);
    });
    const allBlocked = /User-agent:\s*\*[\s\S]*?Disallow:\s*\/\s*(\n|$)/im.test(txt) &&
                      !blocked.some(b => /User-agent:\s*\*/i.test(b));
    robots = {
      ok: true,
      text: txt.slice(0, 4000),
      blocked,
      allBlocked,
      totalChecked: AI_BOTS.length
    };
  }

  // llms.txt
  let llms = { ok: false };
  if (llmsRes.status === 'fulfilled' && llmsRes.value.ok && llmsRes.value.text.length > 20 && !llmsRes.value.text.includes('<html')) {
    const t = llmsRes.value.text;
    llms = {
      ok: true,
      size: t.length,
      lines: t.split('\n').filter(l => l.trim()).length,
      hasH1: /^#\s+/m.test(t)
    };
  }

  // sitemap
  let sitemap = { ok: false };
  if (sitemapRes.status === 'fulfilled' && sitemapRes.value.ok &&
      (sitemapRes.value.text.includes('<urlset') || sitemapRes.value.text.includes('<sitemapindex'))) {
    const urlCount = (sitemapRes.value.text.match(/<loc>/g) || []).length;
    sitemap = { ok: true, urls: urlCount };
  }

  // wayback
  let wayback = null;
  if (waybackRes.status === 'fulfilled' && waybackRes.value.ok && waybackRes.value.json) {
    const j = waybackRes.value.json;
    if (j?.archived_snapshots?.closest) {
      wayback = {
        first: j.archived_snapshots.closest.timestamp?.slice(0,4) + '-' +
               j.archived_snapshots.closest.timestamp?.slice(4,6) + '-' +
               j.archived_snapshots.closest.timestamp?.slice(6,8),
        url: j.archived_snapshots.closest.url
      };
    }
  }

  // Snapshot count via sparkline
  try {
    const sp = await fetchJson(`https://web.archive.org/__wb/sparkline?output=json&url=${encodeURIComponent(targetUrl)}&collection=web`);
    if (sp.ok && sp.json) {
      const yearsArr = Object.values(sp.json.years || {}).flat();
      const count = yearsArr.reduce((a, b) => a + b, 0);
      if (wayback) wayback.count = count;
      else wayback = { count, first: '—' };
      // first year if no closest
      if (sp.json.first_ts) {
        const fts = sp.json.first_ts;
        if (!wayback.first || wayback.first === '—') {
          wayback.first = `${fts.slice(0,4)}-${fts.slice(4,6)}-${fts.slice(6,8)}`;
        }
      }
    }
  } catch{}

  return { robots, llms, sitemap, wayback };
}

async function handlePsi(url, key, strategy) {
  try {
    const u = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${key}&strategy=${strategy}&category=performance`;
    const r = await fetch(u);
    if (!r.ok) return { ok: false, error: 'HTTP ' + r.status };
    const d = await r.json();
    if (d.error) return { ok: false, error: d.error.message };
    const lh = d.lighthouseResult;
    return {
      ok: true,
      score: Math.round((lh?.categories?.performance?.score || 0) * 100),
      lcp: lh?.audits?.['largest-contentful-paint']?.displayValue || '?',
      cls: lh?.audits?.['cumulative-layout-shift']?.displayValue || '?',
      inp: lh?.audits?.['interaction-to-next-paint']?.displayValue
        || lh?.audits?.['interactive']?.displayValue || '?',
      fcp: lh?.audits?.['first-contentful-paint']?.displayValue || '?'
    };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

async function handleGoogleSuggest(q) {
  if (!q) return { ok: false };
  try {
    const u = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}`;
    const r = await fetch(u);
    if (!r.ok) return { ok: false };
    const arr = await r.json();
    return { ok: true, suggestions: (arr[1] || []).slice(0, 12) };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

async function handleNaverSuggest(q) {
  if (!q) return { ok: false };
  try {
    const u = `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(q)}&st=100&r_lt=100&r_format=json&q_enc=UTF-8&t_koreng=1`;
    const r = await fetch(u);
    if (!r.ok) return { ok: false };
    const d = await r.json();
    const items = (d.items?.[0] || []).map(i => i[0]).filter(Boolean).slice(0, 12);
    return { ok: true, suggestions: items };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

// ========== Helpers ==========
async function fetchText(url, timeout = 8000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, text: await r.text(), status: r.status };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

async function fetchJson(url, timeout = 8000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, json: await r.json() };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
