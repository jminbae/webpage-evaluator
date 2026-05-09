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
  if (msg.action === 'fetch-extras') {
    handleFetchExtras(msg.url).then(sendResponse);
    return true; // async
  }
  if (msg.action === 'psi') {
    handlePsi(msg.url, msg.key, msg.strategy).then(sendResponse);
    return true;
  }
  if (msg.action === 'google-suggest') {
    handleGoogleSuggest(msg.q).then(sendResponse);
    return true;
  }
  if (msg.action === 'naver-suggest') {
    handleNaverSuggest(msg.q).then(sendResponse);
    return true;
  }
});

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
