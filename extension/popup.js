/* ===========================================================
 * 웹페이지 분석 도구 - Popup Script
 * Chrome MV3 Extension
 * LLM 없이 결정적 metric만 출력
 * =========================================================== */

let currentTab = null;
let currentUrl = null;
let lastAnalysis = null;

// ========== Init ==========
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupActions();
  setupTabChangeListeners();
  await refreshCurrentTab({ autoAnalyze: true });
});

function isAnalyzableUrl(url) {
  if (!url) return false;
  if (url.startsWith('chrome://')) return false;
  if (url.startsWith('chrome-extension://')) return false;
  if (url.startsWith('edge://')) return false;
  if (url.startsWith('about:')) return false;
  if (url.startsWith('view-source:')) return false;
  if (url === 'chrome://newtab/' || url === 'about:blank') return false;
  return /^https?:\/\//i.test(url);
}

// Re-query the active tab and update UI. Returns true if URL is analyzable.
async function refreshCurrentTab({ autoAnalyze = false } = {}) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    currentTab = tab;
    currentUrl = tab?.url;
  } catch (e) {
    currentTab = null;
    currentUrl = null;
  }

  const urlEl = document.getElementById('current-url');
  if (!isAnalyzableUrl(currentUrl)) {
    urlEl.textContent = currentUrl
      ? '분석 불가 페이지: ' + currentUrl
      : '활성 탭을 찾을 수 없음';
    urlEl.title = currentUrl || '';
    document.body.classList.add('loading');
    return false;
  }

  urlEl.textContent = currentUrl;
  urlEl.title = currentUrl;
  document.body.classList.remove('loading');
  updateToolLinks();
  if (autoAnalyze) runAll();
  return true;
}

function setupTabChangeListeners() {
  // When user switches active tab in browser, refresh side panel URL display
  if (chrome.tabs?.onActivated) {
    chrome.tabs.onActivated.addListener(async () => {
      await refreshCurrentTab({ autoAnalyze: false });
    });
  }
  // When the active tab navigates to a new URL, refresh display
  if (chrome.tabs?.onUpdated) {
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (tab.active && changeInfo.url) {
        await refreshCurrentTab({ autoAnalyze: false });
      }
    });
  }
}

// ========== Tab switching ==========
function setupTabs() {
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.querySelector(`[data-panel="${t.dataset.tab}"]`).classList.add('active');
    });
  });
}

function setupActions() {
  document.getElementById('btn-rerun').addEventListener('click', async () => {
    const ok = await refreshCurrentTab({ autoAnalyze: false });
    if (ok) runAll();
  });
}

// Run page + site analyses sequentially. Page is fast; site streams progress.
async function runAll() {
  await runAnalysis();
  await runSiteAnalysis();
}

// ========== Tool links auto-fill ==========
function updateToolLinks() {
  if (!currentUrl) return;
  let origin = '', host = '';
  try {
    const u = new URL(currentUrl);
    origin = u.origin;
    host = u.host;
  } catch { return; }
  const URL_E = encodeURIComponent(currentUrl);
  const URL_R = currentUrl;
  const ORIGIN = origin;
  const HOST = host;
  document.querySelectorAll('a.tool-link').forEach(a => {
    let pat = a.getAttribute('data-pat') || '';
    let href = pat
      .replace(/\{URL_E\}/g, URL_E)
      .replace(/\{URL_R\}/g, URL_R)
      .replace(/\{ORIGIN\}/g, ORIGIN)
      .replace(/\{HOST\}/g, HOST)
      .replace(/\{KEYWORD\}/g, '');
    a.href = href;
  });
}

// ========== Status bar ==========
function setStatus(text, level = 'progress') {
  const bar = document.getElementById('status-bar');
  const txt = document.getElementById('status-text');
  if (!bar || !txt) return;
  bar.style.display = '';
  bar.classList.remove('done', 'error');
  if (level === 'done') bar.classList.add('done');
  if (level === 'error') bar.classList.add('error');
  txt.textContent = text;
}
function hideStatus() {
  const bar = document.getElementById('status-bar');
  if (bar) bar.style.display = 'none';
}

// ========== Cards ==========
function setCard(id, status, detail, level='good', raw='') {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('good','warn','bad','pending');
  el.classList.add(level);
  const statusEl = el.querySelector('.status');
  const detailEl = el.querySelector('.detail');
  if (statusEl) statusEl.textContent = status;
  if (detailEl) detailEl.innerHTML = detail;
  if (raw) {
    let rawEl = el.querySelector('.raw');
    if (!rawEl) {
      rawEl = document.createElement('div');
      rawEl.className = 'raw';
      el.appendChild(rawEl);
    }
    rawEl.textContent = raw;
  }
}

// ========== Domain panel updaters ==========
function setDom(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ========== Score ==========
function setScore(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = val === '—' ? '—' : val;
  el.classList.remove('good','warn','bad');
  // Also apply level class to parent .score-card for border/background highlighting
  const parent = el.closest('.score-card');
  if (parent) parent.classList.remove('good','warn','bad');
  if (val !== '—') {
    const n = typeof val === 'string' ? parseInt(val) : val;
    const lvl = n >= 80 ? 'good' : (n >= 50 ? 'warn' : 'bad');
    el.classList.add(lvl);
    if (parent) parent.classList.add(lvl);
  }
}

// ========== Reset cards ==========
function resetCards() {
  ['d-html','d-schema','d-meta','d-canonical','d-mobile','d-headings','d-images','d-links','d-robots','d-llms','d-sitemap','d-faq','d-https','d-eeat','d-naver','d-psi-mobile','d-psi-desktop'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('good','warn','bad');
    el.classList.add('pending');
    const s = el.querySelector('.status'); if (s) s.textContent = '⏳';
    const d = el.querySelector('.detail'); if (d) d.textContent = '분석중...';
  });
  ['s-total','s-schema','s-meta','s-aeo','s-perf','s-a11y'].forEach(id => {
    const el = document.getElementById(id);
    el.textContent = '—';
    el.classList.remove('good','warn','bad');
  });
}

// ========== Main analysis ==========
async function runAnalysis() {
  if (!currentUrl) return;
  resetCards();
  document.body.classList.add('loading');
  document.body.classList.add('analyzing');
  setStatus('페이지 분석 중...', 'progress');

  const origin = new URL(currentUrl).origin;
  const host = new URL(currentUrl).host;
  setDom('dom-host', host);
  setDom('dom-protocol', new URL(currentUrl).protocol);

  let scores = { schema:0, meta:0, aeo:0, perf:0, a11y:0 };
  let weights = { schema:0, meta:0, aeo:0, perf:0, a11y:0 };

  // HTTPS
  if (currentUrl.startsWith('https://')) {
    setCard('d-https', '✓', 'HTTPS 사용', 'good');
    scores.meta += 1;
  } else {
    setCard('d-https', '✗', 'HTTP만 사용 — HTTPS로 마이그레이션 필요', 'bad');
  }
  weights.meta += 1;

  // ===== Step 1: Extract DOM data via content script =====
  let domData;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      func: extractDomData
    });
    domData = results[0]?.result;
  } catch (e) {
    setCard('d-html', '✗', 'DOM 분석 실패: ' + e.message, 'bad');
    domData = null;
  }

  if (domData) {
    setCard('d-html', '✓', `${domData.htmlLength} chars · 렌더링된 DOM 분석`, 'good');

    // Schema
    if (!domData.schema || domData.schema.types.length === 0) {
      setCard('d-schema', '✗', 'JSON-LD 스키마 없음', 'bad');
      weights.schema += 3;
    } else {
      const errors = domData.schema.errors;
      const lvl = errors > 0 ? 'warn' : 'good';
      setCard('d-schema', errors>0?'△':'✓',
        `${domData.schema.blocks}개 블록, 타입: ${domData.schema.types.slice(0,3).join(', ')}${domData.schema.types.length>3?'...':''}`,
        lvl,
        errors > 0 ? `${errors}개 parse error` : '');
      scores.schema += errors === 0 ? 3 : 1.5;
      weights.schema += 3;
    }
    setDom('dom-schema-count', domData.schema?.blocks || 0);
    setDom('dom-schema-types', domData.schema?.types?.join(', ') || '없음');

    // Meta
    const m = domData.meta;
    let metaIssues = [];
    if (!m.title) metaIssues.push('title 없음');
    else if (m.title.length > 60) metaIssues.push(`title ${m.title.length}자`);
    else if (m.title.length < 20) metaIssues.push(`title 짧음(${m.title.length})`);
    if (!m.description) metaIssues.push('description 없음');
    else if (m.description.length > 160) metaIssues.push(`description ${m.description.length}자`);
    if (m.ogCount < 4) metaIssues.push(`OG ${m.ogCount}/5`);
    if (m.twitterCount < 2) metaIssues.push(`TW ${m.twitterCount}/4`);
    const metaLvl = metaIssues.length === 0 ? 'good' : (metaIssues.length <= 2 ? 'warn' : 'bad');
    setCard('d-meta', metaIssues.length===0?'✓':'△',
      metaIssues.length===0
        ? `Title ${m.title.length}, Desc ${m.description.length}, OG ${m.ogCount}/5, TW ${m.twitterCount}/4`
        : metaIssues.join(' · '),
      metaLvl,
      `T: ${m.title}\nD: ${m.description}`);
    scores.meta += Math.max(0, 4 - metaIssues.length);
    weights.meta += 4;

    // Canonical / Hreflang
    if (!m.canonical) {
      setCard('d-canonical', '△', 'canonical 없음', 'warn');
    } else {
      setCard('d-canonical', '✓', `canonical 있음 · hreflang ${m.hreflangCount}개`, 'good');
      scores.meta += 1;
    }
    setDom('dom-canonical', m.canonical || '없음');
    setDom('dom-hreflang', m.hreflangCount);
    weights.meta += 1;

    // Mobile viewport
    if (m.viewport && m.viewport.includes('width=device-width')) {
      setCard('d-mobile', '✓', m.viewport, 'good');
      scores.meta += 1;
    } else {
      setCard('d-mobile', '✗', 'viewport 미설정 또는 부적절', 'bad');
    }
    weights.meta += 1;

    // Headings
    const h = domData.headings;
    let hlvl = 'good', hmsg = `H1: ${h.h1}, H2: ${h.h2}, H3: ${h.h3}`;
    if (h.h1 === 0) { hlvl = 'bad'; hmsg = 'H1 없음 — ' + hmsg; }
    else if (h.h1 > 1) { hlvl = 'warn'; hmsg = `H1 ${h.h1}개 — ` + hmsg; }
    setCard('d-headings', h.h1===1?'✓':'△', hmsg, hlvl,
      h.h1Texts.length > 0 ? 'H1: ' + h.h1Texts.join(' / ') : '');
    if (h.h1 === 1) scores.meta += 1;
    weights.meta += 1;

    // Images
    const img = domData.images;
    let imgLvl = 'good';
    if (img.total > 0 && img.noAlt / img.total > 0.2) imgLvl = 'warn';
    if (img.total > 0 && img.noAlt / img.total > 0.5) imgLvl = 'bad';
    setCard('d-images', img.total===0?'—':(img.noAlt===0?'✓':'△'),
      img.total === 0 ? '이미지 없음' : `총 ${img.total}, alt 누락 ${img.noAlt}, lazy ${img.lazy}`,
      imgLvl);
    setDom('dom-images', `${img.total} / ${img.noAlt} 누락`);
    if (img.total === 0 || img.noAlt === 0) scores.a11y += 2;
    else if (img.noAlt / img.total < 0.2) scores.a11y += 1;
    weights.a11y += 2;

    // Links
    setCard('d-links', '✓',
      `링크 ${domData.links.total}개 (내부 ${domData.links.internal}, 외부 ${domData.links.external})`,
      'good');
    setDom('dom-links', `${domData.links.total} (in:${domData.links.internal} ext:${domData.links.external})`);

    // FAQ schema or Q patterns
    const hasFaqSchema = domData.schema?.types?.some(t => /FAQPage|QAPage|Question/i.test(t));
    if (hasFaqSchema) {
      setCard('d-faq', '✓', 'FAQ/Q&A 스키마 감지됨', 'good');
      scores.aeo += 2;
    } else if (domData.qPatternCount > 5) {
      setCard('d-faq', '△', `질문 패턴 ${domData.qPatternCount}개 — FAQ 스키마 추가 권장`, 'warn');
      scores.aeo += 1;
    } else {
      setCard('d-faq', '—', 'Q&A 구조 없음', 'warn');
    }
    weights.aeo += 2;

    // E-E-A-T heuristics
    const eeat = domData.eeat;
    let eeatLvl = 'good', eeatMsg = [];
    if (eeat.author) eeatMsg.push('저자✓'); else eeatMsg.push('저자✗');
    if (eeat.publishedTime) eeatMsg.push('날짜✓'); else eeatMsg.push('날짜✗');
    if (eeat.organizationName) eeatMsg.push('조직✓'); else eeatMsg.push('조직✗');
    if (eeat.sameAsCount > 0) eeatMsg.push(`sameAs ${eeat.sameAsCount}`);
    const eeatPass = [eeat.author, eeat.publishedTime, eeat.organizationName].filter(Boolean).length;
    if (eeatPass < 2) eeatLvl = 'warn';
    if (eeatPass === 0) eeatLvl = 'bad';
    setCard('d-eeat', eeatPass>=2?'✓':'△', eeatMsg.join(' · '), eeatLvl);
    scores.aeo += eeatPass;
    weights.aeo += 3;

    // Naver SEO
    const naverIssues = [];
    if (!domData.rss) naverIssues.push('RSS 없음');
    if (!m.lang) naverIssues.push('html lang 없음');
    if (m.ogCount < 4) naverIssues.push('OG 부족');
    setCard('d-naver', naverIssues.length===0?'✓':'△',
      naverIssues.length===0 ? `lang=${m.lang}, RSS·OG 모두 OK` : naverIssues.join(', '),
      naverIssues.length === 0 ? 'good' : (naverIssues.length <= 1 ? 'warn' : 'bad'));
    if (naverIssues.length === 0) scores.meta += 1;
    setDom('dom-lang', m.lang || '없음');
    setDom('dom-rss', domData.rss || '없음');
    weights.meta += 1;

    // Save raw
    document.getElementById('raw-data').textContent = JSON.stringify(domData, null, 2);

    // Keywords from page
    populateKeywords(domData);
  } else {
    weights.schema += 3; weights.meta += 8; weights.a11y += 2; weights.aeo += 5;
  }

  // ===== Step 2: Background fetches (robots, llms, sitemap, wayback) =====
  const bgResults = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'fetch-extras', url: currentUrl }, resolve);
  });

  // robots.txt
  if (bgResults?.robots?.ok) {
    const r = bgResults.robots;
    setDom('dom-robots-size', `${r.text.length} bytes`);
    if (r.blocked.length === 0 && !r.allBlocked) {
      setCard('d-robots', '✓', `${r.totalChecked}개 AI 봇 모두 허용`, 'good');
      scores.aeo += 3;
    } else {
      setCard('d-robots', '✗', `차단됨: ${r.blocked.join(', ') || 'all (User-agent: *)'}`, 'bad');
    }
    setDom('dom-blocked-bots', r.blocked.length === 0 ? '없음' : r.blocked.join(', '));
  } else {
    setCard('d-robots', '—', 'robots.txt 없음 (기본 허용)', 'good');
    setDom('dom-robots-size', '없음');
    setDom('dom-blocked-bots', '없음 (robots.txt 자체 없음)');
    scores.aeo += 3;
  }
  weights.aeo += 3;

  // llms.txt
  if (bgResults?.llms?.ok) {
    setCard('d-llms', '✓',
      `${bgResults.llms.size} bytes, ${bgResults.llms.lines}줄, H1 ${bgResults.llms.hasH1?'있음':'없음'}`,
      bgResults.llms.hasH1 ? 'good' : 'warn');
    setDom('dom-llms', `있음 (${bgResults.llms.size}b)`);
    scores.aeo += bgResults.llms.hasH1 ? 2 : 1;
  } else {
    setCard('d-llms', '—', 'llms.txt 없음 — 작성 권장', 'warn');
    setDom('dom-llms', '없음');
  }
  weights.aeo += 2;

  // sitemap.xml
  if (bgResults?.sitemap?.ok) {
    setCard('d-sitemap', '✓', `${bgResults.sitemap.urls}개 URL 등록`, 'good');
    setDom('dom-sitemap-count', bgResults.sitemap.urls);
    scores.meta += 1;
  } else {
    setCard('d-sitemap', '✗', 'sitemap.xml 없음', 'bad');
    setDom('dom-sitemap-count', '없음');
  }
  weights.meta += 1;

  // Wayback
  if (bgResults?.wayback) {
    setDom('dom-wayback-first', bgResults.wayback.first || '—');
    setDom('dom-wayback-count', bgResults.wayback.count || '—');
  }

  // ===== Step 3: PSI API =====
  const settings = await chrome.storage.sync.get(['psiKey']);
  if (settings.psiKey) {
    chrome.runtime.sendMessage({ action: 'psi', url: currentUrl, key: settings.psiKey, strategy: 'mobile' }, (r) => {
      if (r?.ok) {
        const lvl = r.score >= 90 ? 'good' : (r.score >= 50 ? 'warn' : 'bad');
        setCard('d-psi-mobile', r.score+'점', `LCP ${r.lcp} · CLS ${r.cls} · INP ${r.inp}`, lvl);
        scores.perf += r.score/100*4;
        weights.perf += 4;
        recalcTotal(scores, weights);
      } else {
        setCard('d-psi-mobile', '✗', 'PSI Mobile 실패: ' + (r?.error||'unknown'), 'bad');
      }
    });
    chrome.runtime.sendMessage({ action: 'psi', url: currentUrl, key: settings.psiKey, strategy: 'desktop' }, (r) => {
      if (r?.ok) {
        const lvl = r.score >= 90 ? 'good' : (r.score >= 50 ? 'warn' : 'bad');
        setCard('d-psi-desktop', r.score+'점', `LCP ${r.lcp} · CLS ${r.cls} · INP ${r.inp}`, lvl);
        scores.perf += r.score/100*2;
        weights.perf += 2;
        recalcTotal(scores, weights);
      } else {
        setCard('d-psi-desktop', '✗', 'PSI Desktop 실패: ' + (r?.error||'unknown'), 'bad');
      }
    });
  } else {
    setCard('d-psi-mobile', '—', '설정에서 PSI API 키 입력 시 자동', 'warn');
    setCard('d-psi-desktop', '—', '설정에서 PSI API 키 입력 시 자동', 'warn');
  }

  recalcTotal(scores, weights);

  // ===== Step 4: Keyword suggestions (in background) =====
  fetchSuggestions(domData);

  document.body.classList.remove('loading');
  document.body.classList.remove('analyzing');
  setStatus('페이지 분석 완료', 'done');
  lastAnalysis = { domData, bgResults, scores, weights };
}

function recalcTotal(scores, weights) {
  const pct = (s, w) => w === 0 ? null : Math.round((s/w)*100);
  const sSchema = pct(scores.schema, weights.schema);
  const sMeta = pct(scores.meta, weights.meta);
  const sAeo = pct(scores.aeo, weights.aeo);
  const sPerf = pct(scores.perf, weights.perf);
  const sA11y = pct(scores.a11y, weights.a11y);
  setScore('s-schema', sSchema ?? '—');
  setScore('s-meta', sMeta ?? '—');
  setScore('s-aeo', sAeo ?? '—');
  setScore('s-perf', sPerf ?? '—');
  setScore('s-a11y', sA11y ?? '—');
  const arr = [sSchema, sMeta, sAeo, sPerf, sA11y].filter(s => s !== null);
  const total = arr.length === 0 ? '—' : Math.round(arr.reduce((a,b)=>a+b,0)/arr.length);
  setScore('s-total', total);
}

// ========== Keywords ==========
function populateKeywords(domData) {
  if (!domData) return;
  const keywords = new Set();
  // From title and h1
  if (domData.meta.title) keywords.add(domData.meta.title);
  if (domData.headings.h1Texts) {
    domData.headings.h1Texts.forEach(t => keywords.add(t));
  }
  const list = document.getElementById('kw-extracted');
  list.innerHTML = '';
  if (keywords.size === 0) {
    list.innerHTML = '<span class="kw-empty">추출 실패</span>';
    return;
  }
  [...keywords].slice(0, 10).forEach(kw => {
    const el = document.createElement('span');
    el.className = 'kw';
    el.textContent = kw;
    el.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://trends.google.com/trends/explore?q=' + encodeURIComponent(kw) });
    });
    list.appendChild(el);
  });

  // Question keywords
  if (domData.questions && domData.questions.length > 0) {
    const ql = document.getElementById('kw-questions');
    ql.innerHTML = '';
    domData.questions.slice(0, 8).forEach(q => {
      const el = document.createElement('span');
      el.className = 'kw';
      el.textContent = q;
      ql.appendChild(el);
    });
  } else {
    document.getElementById('kw-questions').innerHTML = '<span class="kw-empty">질문 패턴 없음</span>';
  }
}

async function fetchSuggestions(domData) {
  if (!domData?.headings?.h1Texts?.[0] && !domData?.meta?.title) return;
  const seedKw = domData.headings.h1Texts[0] || domData.meta.title;
  if (!seedKw) return;
  const cleanSeed = seedKw.split(/[|·\-—–]/)[0].trim().slice(0, 30);

  // Google Suggest
  chrome.runtime.sendMessage({ action: 'google-suggest', q: cleanSeed }, (r) => {
    const list = document.getElementById('kw-google');
    list.innerHTML = '';
    if (!r?.ok || !r.suggestions || r.suggestions.length === 0) {
      list.innerHTML = '<span class="kw-empty">제안 없음</span>';
      return;
    }
    r.suggestions.forEach(s => {
      const el = document.createElement('span');
      el.className = 'kw';
      el.textContent = s;
      el.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://trends.google.com/trends/explore?q=' + encodeURIComponent(s) });
      });
      list.appendChild(el);
    });
  });

  // Naver autocomplete
  chrome.runtime.sendMessage({ action: 'naver-suggest', q: cleanSeed }, (r) => {
    const list = document.getElementById('kw-naver');
    list.innerHTML = '';
    if (!r?.ok || !r.suggestions || r.suggestions.length === 0) {
      list.innerHTML = '<span class="kw-empty">제안 없음</span>';
      return;
    }
    r.suggestions.forEach(s => {
      const el = document.createElement('span');
      el.className = 'kw';
      el.textContent = s;
      el.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://datalab.naver.com/keyword/trendSearch.naver?keyword=' + encodeURIComponent(s) });
      });
      list.appendChild(el);
    });
  });
}

// ========== Content script function (runs in page context) ==========
function extractDomData() {
  const html = document.documentElement.outerHTML;
  const doc = document;

  // Schema
  const ldScripts = doc.querySelectorAll('script[type="application/ld+json"]');
  const types = [];
  let valid = 0, errors = 0;
  ldScripts.forEach(s => {
    try {
      const json = JSON.parse(s.textContent);
      const arr = Array.isArray(json) ? json : (json['@graph'] ? json['@graph'] : [json]);
      arr.forEach(item => {
        if (item['@type']) {
          const t = Array.isArray(item['@type']) ? item['@type'].join(',') : item['@type'];
          types.push(t);
        }
      });
      valid++;
    } catch(e) { errors++; }
  });

  // Meta
  const title = doc.querySelector('title')?.textContent?.trim() || '';
  const description = doc.querySelector('meta[name="description"]')?.getAttribute('content') || '';
  const ogProps = ['og:title','og:description','og:image','og:type','og:url'];
  const ogCount = ogProps.filter(p => doc.querySelector(`meta[property="${p}"]`)).length;
  const twProps = ['twitter:card','twitter:title','twitter:description','twitter:image'];
  const twitterCount = twProps.filter(p => doc.querySelector(`meta[name="${p}"]`)).length;
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
  const hreflangCount = doc.querySelectorAll('link[rel="alternate"][hreflang]').length;
  const viewport = doc.querySelector('meta[name="viewport"]')?.getAttribute('content') || '';
  const lang = doc.documentElement.getAttribute('lang') || '';

  // Headings
  const h1s = [...doc.querySelectorAll('h1')];
  const h1Texts = h1s.map(h => h.textContent.trim().slice(0, 80)).filter(Boolean);
  const headings = {
    h1: h1s.length,
    h2: doc.querySelectorAll('h2').length,
    h3: doc.querySelectorAll('h3').length,
    h1Texts: h1Texts.slice(0, 3)
  };

  // Images
  const allImgs = [...doc.querySelectorAll('img')];
  const noAlt = allImgs.filter(i => !i.getAttribute('alt')).length;
  const lazy = allImgs.filter(i => i.getAttribute('loading') === 'lazy').length;

  // Links
  const allLinks = [...doc.querySelectorAll('a[href]')];
  let internal = 0, external = 0;
  const origin = location.origin;
  allLinks.forEach(a => {
    const h = a.getAttribute('href') || '';
    if (h.startsWith('#') || h.startsWith('/') || h.includes(origin) || (!h.startsWith('http') && !h.startsWith('//'))) internal++;
    else external++;
  });

  // Questions (Q&A patterns)
  const headingsAll = [...doc.querySelectorAll('h1,h2,h3,h4,h5')];
  const questions = headingsAll
    .map(h => h.textContent.trim())
    .filter(t => t && (/[\?？]$/.test(t) || /^(어떻게|왜|언제|어디|무엇|어느|얼마|how|why|when|where|what|which)/i.test(t)))
    .slice(0, 12);

  const qPatternCount = questions.length + (html.match(/[\?？]/g) || []).length;

  // E-E-A-T heuristics
  const author = !!doc.querySelector('meta[name="author"], meta[property="article:author"], [rel="author"]')
    || /<[^>]+(class|id)="[^"]*author[^"]*"/i.test(html);
  const publishedTime = doc.querySelector('meta[property="article:published_time"]')?.getAttribute('content') || '';
  let organizationName = '';
  ldScripts.forEach(s => {
    try {
      const json = JSON.parse(s.textContent);
      const arr = Array.isArray(json) ? json : (json['@graph'] ? json['@graph'] : [json]);
      arr.forEach(item => {
        if (item['@type'] === 'Organization' || (Array.isArray(item['@type']) && item['@type'].includes('Organization'))) {
          if (item.name) organizationName = item.name;
        }
      });
    } catch{}
  });
  const sameAsCount = (html.match(/"sameAs"\s*:\s*\[([^\]]*)\]/g) || []).reduce((acc, m) => {
    return acc + (m.match(/"https?:[^"]+/g) || []).length;
  }, 0);

  // RSS
  const rss = doc.querySelector('link[rel="alternate"][type="application/rss+xml"]')?.getAttribute('href') || '';

  return {
    htmlLength: html.length,
    schema: {
      blocks: ldScripts.length,
      types: [...new Set(types)],
      errors,
      valid
    },
    meta: {
      title,
      description,
      ogCount,
      twitterCount,
      canonical,
      hreflangCount,
      viewport,
      lang
    },
    headings,
    images: { total: allImgs.length, noAlt, lazy },
    links: { total: allLinks.length, internal, external },
    questions,
    qPatternCount,
    eeat: { author, publishedTime, organizationName, sameAsCount },
    rss
  };
}

// ========== Site-wide analysis (progressive) ==========
async function runSiteAnalysis() {
  if (!currentUrl) return;
  const origin = new URL(currentUrl).origin;

  document.getElementById('site-empty').style.display = 'none';
  document.getElementById('site-results').style.display = '';
  document.body.classList.add('analyzing');
  setStatus('사이트맵 수집 중...', 'progress');

  // Reset cards
  ['ds-pages','ds-author','ds-org','ds-schema-diversity','ds-faq-coverage','ds-freshness','ds-knowledge-graph'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('good','warn','bad');
    el.classList.add('pending');
    el.querySelector('.status').textContent = '⏳';
    el.querySelector('.detail').textContent = '대기...';
  });
  document.getElementById('site-pages-list').innerHTML = '';

  // Step 1: get URL list
  const sel = await new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'site-select-urls', origin }, resolve);
  });

  if (!sel?.ok) {
    setStatus('사이트 분석 실패: ' + (sel?.error || '응답 없음'), 'error');
    document.body.classList.remove('analyzing');
    return;
  }

  const urls = sel.urls;
  const total = urls.length;

  // Show selection summary
  const reportTxt = (sel.groupReport || []).slice(0, 5).map(g =>
    g.mode === 'all'
      ? `/${g.prefix === '__root__' ? '' : g.prefix} (전수 ${g.total})`
      : `/${g.prefix} (샘플 ${g.sampled}/${g.total})`
  ).join(', ');
  setStatus(`${total}개 페이지 선정 · ${reportTxt}${(sel.groupReport||[]).length > 5 ? '…' : ''}`, 'progress');

  // Render placeholder list
  const listEl = document.getElementById('site-pages-list');
  listEl.innerHTML = '';
  const itemMap = {};
  urls.forEach(url => {
    const item = document.createElement('div');
    item.className = 'site-page-item fetching';
    item.innerHTML = `
      <span class="icon">⏳</span>
      <div class="body">
        <div class="url">${url.replace(/^https?:\/\//,'')}</div>
        <div style="font-size:11px;color:var(--text-muted);">대기중...</div>
      </div>
    `;
    listEl.appendChild(item);
    itemMap[url] = item;
  });

  // Step 2: parallel fetch with concurrency limit
  const CONCURRENCY = 5;
  const parsed = [];
  let done = 0;

  await runWithConcurrency(urls, CONCURRENCY, async (url) => {
    const r = await new Promise(resolve => {
      chrome.runtime.sendMessage({ action: 'fetch-url', url }, resolve);
    });
    const data = r?.ok ? parseHtmlString(r.html, url) : null;
    const entry = { url, ok: !!r?.ok, error: r?.error, data };
    parsed.push(entry);
    updateSitePageItem(itemMap[url], entry);
    done++;
    setStatus(`사이트 분석 중 ${done}/${total} 페이지 완료`, 'progress');
  });

  // Step 3: aggregate
  renderSiteAggregate(parsed, { ...sel, total: parsed.length });
  setStatus(`사이트 분석 완료 — ${parsed.filter(p => p.ok).length}/${total} 페이지 성공`, 'done');
  document.body.classList.remove('analyzing');
}

async function runWithConcurrency(items, limit, worker) {
  const queue = [...items];
  const running = [];
  while (queue.length > 0 || running.length > 0) {
    while (running.length < limit && queue.length > 0) {
      const item = queue.shift();
      const p = worker(item).then(() => {
        running.splice(running.indexOf(p), 1);
      });
      running.push(p);
    }
    if (running.length > 0) await Promise.race(running);
  }
}

function updateSitePageItem(item, entry) {
  if (!item) return;
  item.classList.remove('fetching');
  if (!entry.ok) {
    item.classList.add('failed');
    item.innerHTML = `
      <span class="icon">✗</span>
      <div class="body">
        <div class="url">${entry.url.replace(/^https?:\/\//,'')}</div>
        <div style="font-size:11px;color:var(--text-muted);">${entry.error || 'fetch 실패'}</div>
      </div>
    `;
    return;
  }
  const s = entry.data || {};
  const sig = (label, ok) => `<span class="signal ${ok?'ok':'no'}">${ok?'✓':'·'} ${label}</span>`;
  const signals = `
    <div class="signals">
      ${sig('Schema', (s.schema?.blocks||0) > 0)}
      ${sig('저자', !!s.eeat?.author)}
      ${sig('Org', !!s.eeat?.organizationName)}
      ${sig('날짜', !!s.eeat?.publishedTime)}
      ${sig('FAQ', (s.schema?.types||[]).some(t => /FAQ|Question/i.test(t)))}
      ${sig('sameAs', (s.eeat?.sameAsCount||0) > 0)}
    </div>
  `;
  item.innerHTML = `
    <span class="icon">✓</span>
    <div class="body">
      <div class="url">${entry.url.replace(/^https?:\/\//,'')}</div>
      <div style="font-size:11px;color:var(--text);margin-bottom:3px;">${(s.title || '').slice(0, 60) || '<em>제목 없음</em>'}</div>
      ${signals}
    </div>
  `;
}

function parseHtmlString(html, baseUrl) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // JSON-LD
    const ldScripts = doc.querySelectorAll('script[type="application/ld+json"]');
    const types = [];
    let valid = 0, errors = 0;
    let organizationName = '';
    let sameAsCount = 0;
    ldScripts.forEach(s => {
      try {
        const json = JSON.parse(s.textContent);
        const arr = Array.isArray(json) ? json : (json['@graph'] ? json['@graph'] : [json]);
        arr.forEach(item => {
          if (item['@type']) {
            const t = Array.isArray(item['@type']) ? item['@type'].join(',') : item['@type'];
            types.push(t);
            if (/Organization/i.test(t) && item.name) organizationName = item.name;
          }
          if (item.sameAs) {
            const links = Array.isArray(item.sameAs) ? item.sameAs : [item.sameAs];
            sameAsCount += links.filter(l => typeof l === 'string').length;
          }
        });
        valid++;
      } catch (e) { errors++; }
    });

    const title = doc.querySelector('title')?.textContent?.trim() || '';
    const description = doc.querySelector('meta[name="description"]')?.getAttribute('content') || '';
    const author = !!doc.querySelector('meta[name="author"], meta[property="article:author"], [rel="author"]')
      || /<[^>]+(class|id)="[^"]*author[^"]*"/i.test(html);
    const publishedTime = doc.querySelector('meta[property="article:published_time"]')?.getAttribute('content')
      || doc.querySelector('meta[name="date"]')?.getAttribute('content') || '';

    const lang = doc.documentElement.getAttribute('lang') || '';

    return {
      title,
      description,
      schema: { blocks: ldScripts.length, types: [...new Set(types)], valid, errors },
      eeat: { author, publishedTime, organizationName, sameAsCount },
      lang
    };
  } catch (e) {
    return { error: e.message };
  }
}

function renderSitePagesList(parsed) {
  const list = document.getElementById('site-pages-list');
  list.innerHTML = '';
  parsed.forEach(p => {
    const item = document.createElement('div');
    item.className = 'site-page-item' + (p.ok ? '' : ' failed');
    let signals = '';
    if (p.data) {
      const s = p.data;
      const sig = (label, ok) => `<span class="signal ${ok?'ok':'no'}">${ok?'✓':'·'} ${label}</span>`;
      signals = `
        <div class="signals">
          ${sig('Schema', s.schema.blocks > 0)}
          ${sig('저자', s.eeat.author)}
          ${sig('Org', !!s.eeat.organizationName)}
          ${sig('날짜', !!s.eeat.publishedTime)}
          ${sig('FAQ', s.schema.types.some(t => /FAQ|Question/i.test(t)))}
          ${sig('sameAs', s.eeat.sameAsCount > 0)}
        </div>
      `;
    }
    item.innerHTML = `
      <span class="icon">${p.ok ? '✓' : '✗'}</span>
      <div class="body">
        <div class="url">${p.url.replace(/^https?:\/\//,'')}</div>
        ${p.data ? `<div style="font-size:11px;color:var(--text);margin-bottom:3px;">${(p.data.title || '').slice(0, 60) || '<em>제목 없음</em>'}</div>` : ''}
        ${signals || `<div style="font-size:11px;color:var(--text-muted);">${p.error || 'fetch 실패'}</div>`}
      </div>
    `;
    list.appendChild(item);
  });
}

function renderSiteAggregate(parsed, result) {
  const okPages = parsed.filter(p => p.data);
  const total = okPages.length;
  const sitemapTotal = result.sitemapUrlCount || 0;
  const aboutCount = result.aboutCount || 0;
  const groupReport = result.groupReport || [];

  // Top summary card
  const summaryEl = document.getElementById('site-summary');
  if (summaryEl) {
    const allGroups = groupReport.filter(g => g.mode === 'all').length;
    const sampleGroups = groupReport.filter(g => g.mode === 'sample').length;
    const isSpaLike = sitemapTotal <= 2 && total <= 2;
    const guessAdded = result.guessAdded || 0;

    let warningHtml = '';
    if (isSpaLike) {
      warningHtml = `
        <div style="margin-top:8px;padding:8px 10px;background:rgba(245,158,11,0.1);border-left:3px solid var(--warn);border-radius:4px;font-size:11px;color:var(--text-dim);line-height:1.5;">
          이 사이트는 <strong style="color:var(--warn);">SPA</strong>이거나 sitemap이 없는 듯합니다.
          모든 콘텐츠가 한 URL에서 JS 라우팅으로 처리되면 (예: <code>/?idx=xxx</code>) 개별 페이지를 외부에서 크롤링할 수 없어요.
          → sitemap.xml 작성 또는 SSR(서버사이드 렌더링) 도입 권장.
        </div>
      `;
    }

    summaryEl.innerHTML = `
      <div style="font-size:15px;font-weight:700;margin-bottom:6px;">
        총 <span style="color:var(--accent);">${total}</span>개 페이지 분석 완료
        <span style="color:var(--text-muted);font-size:12px;font-weight:400;">(${parsed.length}개 시도 중 성공)</span>
      </div>
      <div style="font-size:12px;color:var(--text-dim);line-height:1.6;">
        사이트맵: ${sitemapTotal > 0 ? `${sitemapTotal}개 URL 발견` : '없음'}${guessAdded > 0 ? ` · 추정 경로 ${guessAdded}개 추가 시도` : ''}<br>
        About 계열 전수 분석: <strong style="color:var(--text);">${aboutCount}</strong>개<br>
        URL 그룹: 전수 ${allGroups}개 · 샘플링 ${sampleGroups}개
      </div>
      ${warningHtml}
    `;
  }

  // Pages count card
  const pageCard = document.getElementById('ds-pages');
  pageCard.querySelector('.status').textContent = total > 0 ? '✓' : '✗';
  pageCard.querySelector('.detail').innerHTML =
    `<strong style="color:var(--text);font-size:14px;">${total}</strong>개 페이지 성공 / ${parsed.length}개 시도 · 사이트맵 전체 ${sitemapTotal}개`;
  setSiteCardLevel('ds-pages', total >= 5 ? 'good' : (total >= 2 ? 'warn' : 'bad'));

  if (total === 0) return;

  // Author coverage
  const withAuthor = okPages.filter(p => p.data.eeat.author).length;
  const authorPct = Math.round((withAuthor / total) * 100);
  setCard('ds-author',
    authorPct >= 50 ? '✓' : (authorPct >= 20 ? '△' : '✗'),
    `${withAuthor}/${total} 페이지에 저자 정보 (${authorPct}%)`,
    authorPct >= 50 ? 'good' : (authorPct >= 20 ? 'warn' : 'bad'));

  // Organization schema
  const orgPages = okPages.filter(p => p.data.eeat.organizationName);
  const orgNames = [...new Set(orgPages.map(p => p.data.eeat.organizationName))];
  if (orgPages.length > 0) {
    setCard('ds-org', '✓',
      `${orgPages.length}개 페이지에서 감지 · ${orgNames.slice(0,2).join(', ')}`,
      'good');
  } else {
    setCard('ds-org', '✗', 'Organization schema 없음 — 사이트 차원 신뢰 신호 부족', 'bad');
  }

  // Schema diversity
  const allTypes = new Set();
  okPages.forEach(p => p.data.schema.types.forEach(t => allTypes.add(t)));
  setCard('ds-schema-diversity',
    allTypes.size >= 5 ? '✓' : (allTypes.size >= 2 ? '△' : '✗'),
    `${allTypes.size}종 타입: ${[...allTypes].slice(0, 6).join(', ')}${allTypes.size>6?'...':''}`,
    allTypes.size >= 5 ? 'good' : (allTypes.size >= 2 ? 'warn' : 'bad'));

  // FAQ coverage
  const faqPages = okPages.filter(p => p.data.schema.types.some(t => /FAQ|Question/i.test(t)));
  if (faqPages.length > 0) {
    setCard('ds-faq-coverage', '✓',
      `${faqPages.length}/${total} 페이지에 FAQ/Q&A 스키마 (AEO 강점)`,
      'good');
  } else {
    setCard('ds-faq-coverage', '△',
      `FAQ/Q&A 스키마 없음 — Q&A 페이지에 추가 권장`,
      'warn');
  }

  // Freshness
  const dates = okPages.map(p => p.data.eeat.publishedTime).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d));
  if (dates.length > 0) {
    dates.sort((a,b) => a-b);
    const oldest = dates[0];
    const newest = dates[dates.length-1];
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const daysSinceNewest = Math.round((Date.now() - newest.getTime()) / 86400000);
    let lvl = 'good';
    if (daysSinceNewest > 365) lvl = 'bad';
    else if (daysSinceNewest > 180) lvl = 'warn';
    setCard('ds-freshness',
      daysSinceNewest <= 90 ? '✓' : (daysSinceNewest <= 365 ? '△' : '✗'),
      `최신: ${fmt(newest)} (${daysSinceNewest}일 전) · 가장 오래: ${fmt(oldest)}`,
      lvl);
  } else {
    setCard('ds-freshness', '—', '발행 날짜 메타데이터 없음', 'warn');
  }

  // Knowledge Graph / external trust (sameAs)
  const totalSameAs = okPages.reduce((sum, p) => sum + (p.data.eeat.sameAsCount || 0), 0);
  if (totalSameAs >= 3) {
    setCard('ds-knowledge-graph', '✓',
      `sameAs 외부 연결 ${totalSameAs}개 (Wikipedia/SNS 등) — 강한 신뢰 신호`,
      'good');
  } else if (totalSameAs > 0) {
    setCard('ds-knowledge-graph', '△',
      `sameAs ${totalSameAs}개 — 더 추가 권장`,
      'warn');
  } else {
    setCard('ds-knowledge-graph', '✗',
      'sameAs 외부 연결 없음 — Wikipedia·SNS·언론 링크 추가 권장',
      'bad');
  }
}

function setSiteCardLevel(id, level) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('good','warn','bad','pending');
  el.classList.add(level);
}
