// Time update function
function updateTime() {
    const currentTimeElement = document.getElementById("current-time");
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, "0");
    const minutes = now.getMinutes().toString().padStart(2, "0");
    const seconds = now.getSeconds().toString().padStart(2, "0");
    const currentTime = `${hours}:${minutes}:${seconds}`;
    currentTimeElement.textContent = currentTime;
}

// Update time every second
updateTime();
setInterval(updateTime, 1000);

// fetch() with an abort timeout so a slow/hanging request never freezes a widget
function fetchT(url, ms = 8000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
}
function fetchJSON(url, ms = 8000) {
    return fetchT(url, ms).then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    });
}

// Fetch cryptocurrency prices from Binance (no key, CORS-enabled, very generous
// rate limits). Cached with a short TTL so frequent new-tab opens reuse data.
const CRYPTO_TTL = 60 * 1000;
const BINANCE_TICKER = 'https://data-api.binance.vision/api/v3/ticker/24hr?symbols=%5B%22BTCUSDT%22%2C%22ETHUSDT%22%5D';

function setCoin(priceId, changeId, price, change) {
    document.getElementById(priceId).textContent = Number(price).toLocaleString(undefined, { maximumFractionDigits: 2 });
    const el = document.getElementById(changeId);
    el.textContent = change.toFixed(2) + '%';
    el.className = change >= 0 ? 'positive' : 'negative';
}

function renderCrypto(tickers) {
    const btc = tickers.find(t => t.symbol === 'BTCUSDT');
    if (btc) setCoin('btc-price', 'btc-change', parseFloat(btc.lastPrice), parseFloat(btc.priceChangePercent));
    const eth = tickers.find(t => t.symbol === 'ETHUSDT');
    if (eth) setCoin('eth-price', 'eth-change', parseFloat(eth.lastPrice), parseFloat(eth.priceChangePercent));
}

async function fetchCryptoPrices() {
    let cache = null;
    try { cache = JSON.parse(localStorage.getItem('crypto_cache')); } catch (e) { /* ignore */ }
    if (cache && Array.isArray(cache.data)) {
        renderCrypto(cache.data); // show last known prices instantly
        if (cache.ts && Date.now() - cache.ts < CRYPTO_TTL) return; // still fresh — skip network
    }
    try {
        const data = await fetchJSON(BINANCE_TICKER);
        renderCrypto(data);
        localStorage.setItem('crypto_cache', JSON.stringify({ data, ts: Date.now() }));
    } catch (error) {
        console.error('Error fetching crypto prices:', error);
        if (!cache) { // no cached values to fall back on — don't leave "Loading…"
            document.getElementById('btc-price').textContent = '—';
            document.getElementById('btc-change').textContent = '';
            document.getElementById('eth-price').textContent = '—';
            document.getElementById('eth-change').textContent = '';
        }
    }
}

// --- Markets: USD/IDR + IHSG ---

// Format a "as of" timestamp from an ISO/epoch value
function formatAsOf(ts) {
    const d = new Date(ts);
    return 'as of ' + d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

// Render an IHSG value (price + % change) into the DOM
function renderIhsg(price, change, ts, stale) {
    document.getElementById('ihsg-price').textContent = Math.round(price).toLocaleString();
    const changeEl = document.getElementById('ihsg-change');
    if (typeof change === 'number') {
        changeEl.textContent = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
        changeEl.className = 'change ' + (change >= 0 ? 'positive' : 'negative');
    }
    const asOf = document.getElementById('ihsg-asof');
    asOf.textContent = ts ? (stale ? 'cached — ' : '') + formatAsOf(ts) : '';
}

// USD/IDR via open.er-api.com (no key, CORS-enabled) — always works in-browser
async function fetchUsdIdr() {
    let cache = null;
    try { cache = JSON.parse(localStorage.getItem('usdidr_cache')); } catch (e) { /* ignore */ }
    if (cache && cache.idr) {
        document.getElementById('usdidr-price').textContent = 'Rp ' + Math.round(cache.idr).toLocaleString();
        document.getElementById('usdidr-asof').textContent = formatAsOf(cache.ts);
    }
    try {
        const data = await fetchJSON('https://open.er-api.com/v6/latest/USD');
        const idr = data && data.rates && data.rates.IDR;
        if (idr) {
            const ts = data.time_last_update_unix ? data.time_last_update_unix * 1000 : Date.now();
            document.getElementById('usdidr-price').textContent = 'Rp ' + Math.round(idr).toLocaleString();
            document.getElementById('usdidr-asof').textContent = formatAsOf(ts);
            localStorage.setItem('usdidr_cache', JSON.stringify({ idr, ts }));
        } else if (!cache) {
            document.getElementById('usdidr-price').textContent = '—';
        }
    } catch (error) {
        console.error('Error fetching USD/IDR:', error);
        if (!cache) document.getElementById('usdidr-price').textContent = '—';
    }
}

// IHSG via Yahoo Finance (^JKSE). Yahoo has no CORS header, so we go through a
// public proxy. Proxies are flaky, so we try several and fall back to the last
// cached value (localStorage) — the widget never goes blank.
const YAHOO_IHSG = 'https://query1.finance.yahoo.com/v8/finance/chart/^JKSE?range=1d&interval=1d';
const IHSG_PROXIES = [
    url => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
    url => 'https://corsproxy.io/?url=' + encodeURIComponent(url),
    url => 'https://thingproxy.freeboard.io/fetch/' + url
];

async function fetchIhsg() {
    // 1) Show cached value immediately (if any) so there's never an empty/spinning state
    let cache = null;
    try { cache = JSON.parse(localStorage.getItem('ihsg_cache')); } catch (e) { /* ignore */ }
    if (cache && typeof cache.price === 'number') {
        renderIhsg(cache.price, cache.change, cache.ts, true);
    }

    // 2) Try to refresh via the proxy chain
    for (const buildUrl of IHSG_PROXIES) {
        try {
            const res = await fetchT(buildUrl(YAHOO_IHSG), 8000);
            if (!res.ok) continue;
            const data = await res.json();
            const meta = data && data.chart && data.chart.result && data.chart.result[0] && data.chart.result[0].meta;
            if (!meta || typeof meta.regularMarketPrice !== 'number') continue;
            const price = meta.regularMarketPrice;
            const prev = meta.chartPreviousClose || meta.previousClose;
            const change = prev ? ((price - prev) / prev) * 100 : undefined;
            const ts = meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now();
            renderIhsg(price, change, ts, false);
            localStorage.setItem('ihsg_cache', JSON.stringify({ price, change, ts }));
            return; // success — stop trying proxies
        } catch (error) {
            // try next proxy
        }
    }

    // 3) All proxies failed — keep cached value, or show a dash if we never had one
    if (!cache) {
        document.getElementById('ihsg-price').textContent = '—';
        document.getElementById('ihsg-asof').textContent = 'unavailable';
    }
    console.warn('IHSG: all proxies failed; showing cached value if available.');
}

// Fetch all market data
function fetchMarkets() {
    fetchUsdIdr();
    fetchIhsg();
}

// --- Pomodoro timer (simplified: 25 min focus / 5 min break, toggle + reset) ---
function setupPomodoro() {
    const WORK_SECONDS = 25 * 60;
    const BREAK_SECONDS = 5 * 60;

    let onBreak = false;
    let remaining = WORK_SECONDS;
    let running = false;
    let intervalId = null;

    const timeEl = document.getElementById('pomodoro-time');
    const phaseEl = document.getElementById('pomodoro-phase');
    const toggleEl = document.getElementById('pomodoro-toggle');

    function render() {
        const m = Math.floor(remaining / 60).toString().padStart(2, '0');
        const s = (remaining % 60).toString().padStart(2, '0');
        timeEl.textContent = `${m}:${s}`;
        phaseEl.textContent = onBreak ? 'Break' : 'Focus';
        toggleEl.textContent = running ? 'Pause' : 'Start';
        document.title = running ? `${m}:${s} – ${onBreak ? 'Break' : 'Focus'}` : "wid's dashboard";
    }

    function tick() {
        if (remaining > 0) {
            remaining -= 1;
        } else {
            // Switch between focus and break automatically
            onBreak = !onBreak;
            remaining = onBreak ? BREAK_SECONDS : WORK_SECONDS;
        }
        render();
    }

    function toggle() {
        if (running) {
            running = false;
            if (intervalId) clearInterval(intervalId);
            intervalId = null;
        } else {
            running = true;
            intervalId = setInterval(tick, 1000);
        }
        render();
    }

    function reset() {
        running = false;
        if (intervalId) clearInterval(intervalId);
        intervalId = null;
        onBreak = false;
        remaining = WORK_SECONDS;
        render();
    }

    toggleEl.addEventListener('click', toggle);
    document.getElementById('pomodoro-reset').addEventListener('click', reset);

    render();
}

// --- Market Pulse: live snapshot from free, no-key, CORS-enabled sources ---
// Curated fallback bullets shown only if the network and cache both fail.
const PULSE_FALLBACK = [
    '📉 Markets move on expectations — prices often react before news is confirmed.',
    '🧺 Diversifying across assets reduces the impact of any single one falling.',
    '⏳ Time in the market generally beats timing the market.',
    '💸 Dollar-cost averaging spreads risk by investing a fixed amount on a schedule.'
];

function renderPulse(bullets, ts, stale) {
    const list = document.getElementById('pulse-list');
    list.innerHTML = '';
    bullets.forEach(html => {
        const li = document.createElement('li');
        li.innerHTML = html;
        list.appendChild(li);
    });
    const asOf = document.getElementById('pulse-asof');
    asOf.textContent = ts
        ? (stale ? 'cached — ' : 'updated ') + new Date(ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
        : '';
}

const PULSE_TTL = 2 * 60 * 1000;

async function fetchMarketPulse() {
    // 1) Show cached bullets immediately so there's never an empty/spinning state
    let cache = null;
    try { cache = JSON.parse(localStorage.getItem('pulse_cache')); } catch (e) { /* ignore */ }
    if (cache && Array.isArray(cache.bullets) && cache.bullets.length) {
        renderPulse(cache.bullets, cache.ts, true);
        if (cache.ts && Date.now() - cache.ts < PULSE_TTL) return; // fresh — skip network (avoids rate limits)
    }

    // 2) Fetch from diversified providers so one being rate-limited can't break the
    //    whole card. CoinPaprika = market cap/dominance, alt.me = Fear & Greed,
    //    CoinGecko = trending (optional — omitted if it's rate-limited).
    const [globalRes, fngRes, trendRes] = await Promise.allSettled([
        fetchJSON('https://api.coinpaprika.com/v1/global'),
        fetchJSON('https://api.alternative.me/fng/'),
        fetchJSON('https://api.coingecko.com/api/v3/search/trending')
    ]);

    const bullets = [];

    if (globalRes.status === 'fulfilled' && globalRes.value && globalRes.value.market_cap_usd) {
        const d = globalRes.value;
        const cap = d.market_cap_usd;
        const capStr = cap >= 1e12 ? '$' + (cap / 1e12).toFixed(2) + 'T' : '$' + (cap / 1e9).toFixed(0) + 'B';
        const chg = d.market_cap_change_24h;
        if (typeof chg === 'number') {
            const cls = chg >= 0 ? 'positive' : 'negative';
            const arrow = chg >= 0 ? '▲' : '▼';
            bullets.push(`🌐 Crypto market cap: <strong>${capStr}</strong> <span class="${cls}">${arrow}${Math.abs(chg).toFixed(2)}%</span>`);
        } else {
            bullets.push(`🌐 Crypto market cap: <strong>${capStr}</strong>`);
        }
        bullets.push(`₿ BTC dominance: <strong>${d.bitcoin_dominance_percentage.toFixed(1)}%</strong>`);
    }

    if (fngRes.status === 'fulfilled' && fngRes.value && fngRes.value.data && fngRes.value.data[0]) {
        const f = fngRes.value.data[0];
        bullets.push(`😰 Fear &amp; Greed: <strong>${f.value}</strong> — ${f.value_classification}`);
    }

    if (trendRes.status === 'fulfilled' && trendRes.value && Array.isArray(trendRes.value.coins)) {
        const names = trendRes.value.coins.slice(0, 3).map(c => c.item.symbol.toUpperCase());
        if (names.length) bullets.push(`🔥 Trending: <strong>${names.join(', ')}</strong>`);
    }

    // 3) Render: live data if we got any, else keep cache, else curated fallback
    if (bullets.length) {
        const ts = Date.now();
        renderPulse(bullets, ts, false);
        localStorage.setItem('pulse_cache', JSON.stringify({ bullets, ts }));
    } else if (!cache) {
        renderPulse(PULSE_FALLBACK, null, false);
    }
}

// --- Market News: Indonesian + global finance headlines from Google News RSS ---
// Google News RSS has no CORS, so we fetch it through the same proxy chain as IHSG
// and parse the XML in-browser. Cached + TTL so we don't hammer the proxies.
const NEWS_TTL = 10 * 60 * 1000;
const NEWS_FEEDS = [
    { url: 'https://news.google.com/rss/search?q=IHSG+OR+saham+OR+rupiah&hl=id&gl=ID&ceid=ID:id', max: 2 },
    { url: 'https://news.google.com/rss/search?q=stock+market+OR+economy+OR+Fed&hl=en-US&gl=US&ceid=US:en', max: 2 }
];

// Fetch a URL's text through the proxy chain (returns null if all proxies fail)
async function fetchTextViaProxy(targetUrl) {
    for (const buildUrl of IHSG_PROXIES) {
        try {
            const res = await fetchT(buildUrl(targetUrl), 9000);
            if (!res.ok) continue;
            const text = await res.text();
            if (text && text.length > 100) return text;
        } catch (e) { /* try next proxy */ }
    }
    return null;
}

function nodeText(node, sel) {
    const el = node.querySelector(sel);
    return el ? el.textContent.trim() : '';
}

// Google News titles end with " - Source"; split that into title + source
function cleanTitleSource(title, source) {
    if (source) {
        const suffix = ' - ' + source;
        if (title.endsWith(suffix)) title = title.slice(0, -suffix.length);
    } else {
        const idx = title.lastIndexOf(' - ');
        if (idx > 0) { source = title.slice(idx + 3); title = title.slice(0, idx); }
    }
    return { title, source };
}

function parseRssItems(xmlText, max) {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const items = [];
    const nodes = doc.querySelectorAll('item');
    for (let i = 0; i < nodes.length && items.length < max; i++) {
        const it = nodes[i];
        const link = nodeText(it, 'link');
        const cs = cleanTitleSource(nodeText(it, 'title'), nodeText(it, 'source'));
        if (cs.title && link) items.push({ title: cs.title, link, source: cs.source });
    }
    return items;
}

// Load one feed, trying rss2json (JSON, CORS) first, then the proxy chain + XML parse
async function fetchFeedItems(feedUrl, max) {
    // Method 1: rss2json
    try {
        const j = await fetchJSON('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(feedUrl), 9000);
        if (j && j.status === 'ok' && Array.isArray(j.items) && j.items.length) {
            return j.items.slice(0, max).map(i => {
                const cs = cleanTitleSource(i.title || '', '');
                return { title: cs.title, link: i.link || '', source: cs.source };
            }).filter(it => it.title && it.link);
        }
    } catch (e) { /* fall through to proxy */ }

    // Method 2: proxy chain + DOMParser
    const xml = await fetchTextViaProxy(feedUrl);
    return xml ? parseRssItems(xml, max) : [];
}

function renderNews(items, ts, stale) {
    const list = document.getElementById('news-list');
    list.innerHTML = '';
    items.forEach(it => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = it.link;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = it.title;
        li.appendChild(a);
        if (it.source) {
            const s = document.createElement('span');
            s.className = 'news-src';
            s.textContent = it.source;
            li.appendChild(s);
        }
        list.appendChild(li);
    });
    document.getElementById('news-asof').textContent = ts
        ? (stale ? 'cached — ' : 'updated ') + new Date(ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
        : '';
}

async function fetchMarketNews() {
    // 1) Show cached headlines immediately
    let cache = null;
    try { cache = JSON.parse(localStorage.getItem('news_cache')); } catch (e) { /* ignore */ }
    if (cache && Array.isArray(cache.items) && cache.items.length) {
        renderNews(cache.items, cache.ts, true);
        if (cache.ts && Date.now() - cache.ts < NEWS_TTL) return; // fresh — skip proxies
    }

    // 2) Fetch all feeds in parallel; interleave so both regions show even if one is short
    const perFeed = await Promise.all(NEWS_FEEDS.map(f => fetchFeedItems(f.url, f.max)));
    const items = [];
    const maxLen = Math.max(...perFeed.map(a => a.length), 0);
    for (let i = 0; i < maxLen; i++) {
        perFeed.forEach(arr => { if (arr[i]) items.push(arr[i]); });
    }

    // 3) Render: fresh items, else keep cache, else a message
    if (items.length) {
        const ts = Date.now();
        renderNews(items, ts, false);
        localStorage.setItem('news_cache', JSON.stringify({ items, ts }));
    } else if (!cache) {
        document.getElementById('news-list').innerHTML = '<li class="news-loading">Headlines unavailable right now.</li>';
    }
}

// --- Bookmarks (data-driven; add or remove any, saved in localStorage) ---
const DEFAULT_BOOKMARKS = [
    { name: 'YouTube', url: 'https://www.youtube.com/', icon: 'https://www.google.com/s2/favicons?domain=youtube.com&sz=128' },
    { name: 'Gmail', url: 'https://mail.google.com/', icon: 'assets/icons/gmail.svg' },
    { name: 'Google Drive', url: 'https://drive.google.com/drive/u/0/my-drive', icon: 'assets/icons/drive.svg' },
    { name: 'X (Twitter)', url: 'https://twitter.com', icon: 'assets/icons/x.svg' },
    { name: 'Classroom', url: 'https://classroom.google.com', icon: 'assets/icons/classroom.png' },
    { name: 'LinkedIn', url: 'https://www.linkedin.com', icon: 'https://www.google.com/s2/favicons?domain=linkedin.com&sz=128' },
    { name: 'Instagram', url: 'https://www.instagram.com', icon: 'https://www.google.com/s2/favicons?domain=instagram.com&sz=128' },
    { name: 'Canva', url: 'https://www.canva.com', icon: 'https://www.google.com/s2/favicons?domain=canva.com&sz=128' },
    { name: 'Draw.io', url: 'https://app.diagrams.net', icon: 'https://www.google.com/s2/favicons?domain=app.diagrams.net&sz=128' },
    { name: 'ChatGPT', url: 'https://chat.openai.com', icon: 'https://www.google.com/s2/favicons?domain=openai.com&sz=128' },
    { name: 'DeepSeek', url: 'https://chat.deepseek.com', icon: 'https://www.google.com/s2/favicons?domain=deepseek.com&sz=128' },
    { name: 'Tokopedia', url: 'https://www.tokopedia.com', icon: 'https://www.google.com/s2/favicons?domain=tokopedia.com&sz=128' }
];

function setupBookmarks() {
    const addBtn = document.getElementById('add-bookmark');
    const grid = document.getElementById('bookmark-grid');
    if (!addBtn || !grid) return;

    function load() {
        const raw = localStorage.getItem('bookmarks');
        if (raw === null) return DEFAULT_BOOKMARKS.slice(); // first run: seed with defaults
        try {
            const list = JSON.parse(raw);
            // Fall back to defaults if the stored list is missing/empty/corrupt
            return (Array.isArray(list) && list.length) ? list : DEFAULT_BOOKMARKS.slice();
        } catch (e) {
            return DEFAULT_BOOKMARKS.slice();
        }
    }
    function save(list) {
        localStorage.setItem('bookmarks', JSON.stringify(list));
    }
    // High-res favicon for user-added sites (icon.horse → 512px), with a fallback.
    function faviconFor(url) {
        let host;
        try { host = new URL(url).hostname; } catch (e) { host = url; }
        return 'https://icon.horse/icon/' + host;
    }
    function fallbackFor(url) {
        let host;
        try { host = new URL(url).hostname; } catch (e) { host = url; }
        return 'https://www.google.com/s2/favicons?domain=' + host + '&sz=128';
    }

    function render() {
        grid.querySelectorAll('.logo-item').forEach(n => n.remove());
        load().forEach((bm, i) => {
            const a = document.createElement('a');
            a.href = bm.url;
            a.className = 'logo logo-item';
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.title = bm.name;
            const fb = bm.fallback || '';
            a.innerHTML =
                `<img src="${bm.icon}" alt="${bm.name}" loading="lazy"` +
                (fb ? ` onerror="this.onerror=null;this.src='${fb}';"` : '') + `>` +
                `<span class="logo-remove" data-i="${i}" title="Remove">&times;</span>`;
            grid.insertBefore(a, addBtn);
        });
        grid.querySelectorAll('.logo-remove').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                const list = load();
                list.splice(Number(btn.dataset.i), 1);
                save(list);
                render();
            });
        });
    }

    addBtn.addEventListener('click', e => {
        e.preventDefault();
        let url = prompt('Enter website URL (e.g. github.com):');
        if (!url) return;
        url = url.trim();
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        let name;
        try { name = new URL(url).hostname.replace(/^www\./, ''); }
        catch (err) { alert('That doesn\'t look like a valid URL.'); return; }
        const custom = prompt('Name (optional):', name);
        if (custom && custom.trim()) name = custom.trim();
        const list = load();
        list.push({ name, url, icon: faviconFor(url), fallback: fallbackFor(url) });
        save(list);
        render();
    });

    render();
}

// Google Search functionality
function setupSearch() {
    const searchInput = document.getElementById('search-input');
    
    // Auto-focus the search input when page loads
    searchInput.focus();
    
    // Function to perform search
    function performSearch() {
        const query = searchInput.value.trim();
        if (query) {
            let searchUrl = 'https://www.google.com/search?q=' + encodeURIComponent(query);
            window.open(searchUrl, '_blank');
        }
    }
    
    // Event listener for Enter key in search input
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
}

// Initialize the page
window.onload = function() {
    // Fetch crypto prices and market data
    fetchCryptoPrices();
    fetchMarkets();

    // Setup search functionality (includes auto-focus)
    setupSearch();

    // Load the live Market Pulse snapshot
    fetchMarketPulse();

    // Load Market News headlines
    fetchMarketNews();

    // Enable adding custom bookmark icons
    setupBookmarks();

    // Setup the Pomodoro timer
    setupPomodoro();

    // Update crypto prices every 60 seconds
    setInterval(fetchCryptoPrices, 60000);
};