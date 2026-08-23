
const SHIKIMORI_URL_PATTERNS = [
    '*://shikimori.rip/*',
    '*://shikimori.fi/*',
    '*://shikimori.net/*',
    '*://shikimori.moe/*',
    '*://ygg.shiki.rip/*',
];

// Shared promise while a proxy tab is being created/loading.
// All concurrent requests reuse this promise instead of spawning multiple tabs.
var proxyTabReady = null;

function waitForTabLoad(tabId) {
    return new Promise(function(resolve, reject) {
        var timer = setTimeout(function() {
            chrome.tabs.onUpdated.removeListener(listener);
            reject(new Error('proxy tab load timeout'));
        }, 25000);

        function listener(id, info) {
            if (id !== tabId || info.status !== 'complete') return;
            chrome.tabs.onUpdated.removeListener(listener);
            clearTimeout(timer);
            resolve(tabId);
        }

        chrome.tabs.onUpdated.addListener(listener);
    });
}

function createProxyTab() {
    return new Promise(function(resolve, reject) {
        chrome.tabs.create({ url: 'https://shikimori.rip/', active: false }, function(newTab) {
            if (chrome.runtime.lastError) {
                reject(new Error('Cannot create proxy tab: ' + chrome.runtime.lastError.message));
                return;
            }
            waitForTabLoad(newTab.id).then(resolve).catch(reject);
        });
    });
}

function getProxyTabId() {
    return new Promise(function(resolve, reject) {
        chrome.tabs.query({ url: SHIKIMORI_URL_PATTERNS }, function(tabs) {
            if (tabs && tabs.length > 0) {
                // Existing shikimori tab found — no need for a background proxy tab.
                proxyTabReady = null;
                resolve(tabs[0].id);
                return;
            }

            // No shikimori tab open — reuse or create our background proxy tab.
            if (!proxyTabReady) {
                proxyTabReady = createProxyTab().catch(function(err) {
                    proxyTabReady = null; // allow retry on next request
                    throw err;
                });
            }

            proxyTabReady.then(resolve).catch(reject);
        });
    });
}

function fetchImageViaTab(tabId, imageUrl) {
    return chrome.scripting.executeScript({
        target: { tabId: tabId },
        world: 'MAIN',
        func: function(url) {
            return fetch(url, { referrerPolicy: 'unsafe-url' })
                .then(function(r) {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return r.blob();
                })
                .then(function(blob) {
                    return new Promise(function(resolve, reject) {
                        var fr = new FileReader();
                        fr.onload = function() { resolve(fr.result); };
                        fr.onerror = function() { reject(new Error('FileReader error')); };
                        fr.readAsDataURL(blob);
                    });
                });
        },
        args: [imageUrl]
    }).then(function(results) {
        var r = results && results[0];
        if (r && r.result) {
            return { ok: true, dataUrl: r.result };
        }
        var errMsg = (r && r.error && r.error.message) || 'executeScript returned no result';
        return { ok: false, error: errMsg };
    });
}

// ── Direct fetch helpers (service worker context, bypasses CORS) ─────────────

async function fetchImageDirect(url, headers) {
    var response = await fetch(url, { headers: headers || {} });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    var buffer = await response.arrayBuffer();
    var bytes = new Uint8Array(buffer);
    var mimeType = response.headers.get('content-type') || 'image/jpeg';
    var binary = '';
    var chunkSize = 8192;
    for (var i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
    }
    return { ok: true, dataUrl: 'data:' + mimeType + ';base64,' + btoa(binary) };
}

async function fetchJson(url, headers) {
    var response = await fetch(url, { headers: headers || {} });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    var json = await response.json();
    return { ok: true, json: json };
}

async function fetchReadMangaChapters(slug) {
    var url = 'https://readmanga.live/' + slug;
    var response = await fetch(url, { headers: { 'Referer': 'https://readmanga.live/' } });
    var html = await response.text();

    var chapters = [];
    // Match chapter links: /slug/vol1/ch1 or /slug/vol1/ch1.5
    var re = /href="\/([^"]+\/vol(\d+)\/ch([\d.]+)[^"]*)"[^>]*>([^<]*)</g;
    var seen = new Set();
    var match;
    var index = 0;
    while ((match = re.exec(html)) !== null) {
        var key = match[2] + '_' + match[3];
        if (seen.has(key)) continue;
        seen.add(key);
        index++;
        chapters.push({
            id: slug + '/vol' + match[2] + '/ch' + match[3],
            index: index,
            volume: match[2],
            number: match[3],
            name: match[4].trim() || null,
        });
    }
    // Reverse so index 1 = first chapter
    chapters.reverse();
    chapters.forEach(function(ch, i) { ch.index = i + 1; });
    return { ok: true, chapters: chapters };
}

async function fetchReadMangaPages(url) {
    var response = await fetch(url, { headers: { 'Referer': 'https://readmanga.live/' } });
    var html = await response.text();
    // Extract: rm_h.init( [["//imgX.../file.jpg","ext"],...], 0, true );
    var match = html.match(/rm_h\.init\s*\(\s*(\[\[[\s\S]*?\]\])\s*[,)]/);
    if (!match) return { ok: false, error: 'No pages found' };
    var raw = JSON.parse(match[1]);
    var urls = raw.map(function(p) {
        var u = (p[0] + p[1]).trim();
        return u.startsWith('//') ? 'https:' + u : u;
    }).filter(function(u) { return u.length > 0; });
    return { ok: true, urls: urls };
}

// ── Kodik stream extractor ───────────────────────────────────────────────────

function caesarDecode(str, shift) {
    return str.split('').map(function(c) {
        var code = c.charCodeAt(0);
        if (code >= 97 && code <= 122) return String.fromCharCode(((code - 97 + shift) % 26) + 97);
        if (code >= 65 && code <= 90) return String.fromCharCode(((code - 65 + shift) % 26) + 65);
        return c;
    }).join('');
}

async function fetchKodikStream(iframeUrl) {
    if (iframeUrl.startsWith('//')) iframeUrl = 'https:' + iframeUrl;

    var resp = await fetch(iframeUrl, {
        headers: { 'Referer': 'https://shikimori.one/' }
    });
    var html = await resp.text();
    var hostname = new URL(resp.url).hostname;

    function extract(re) { return (html.match(re) || [])[1] || ''; }

    // Extract video info object
    var infoMatch = html.match(/var\s+videoInfo\s*=\s*\{([^}]+)\}/);
    var infoStr = infoMatch ? infoMatch[0] : '';
    var videoType = extract(/videoInfo\s*=\s*\{[^}]*type\s*:\s*['"](\w+)['"]/);
    var videoId   = extract(/videoInfo\s*=\s*\{[^}]*id\s*:\s*['"]?(\d+)['"]?/);
    var videoHash = extract(/videoInfo\s*=\s*\{[^}]*hash\s*:\s*['"]([a-zA-Z0-9]+)['"]/);
    var d       = extract(/var\s+d\s*=\s*['"]([^'"]+)['"]/);
    var dSign   = extract(/var\s+d_sign\s*=\s*['"]([^'"]+)['"]/);
    var pd      = extract(/var\s+pd\s*=\s*['"]([^'"]+)['"]/);
    var pdSign  = extract(/var\s+pd_sign\s*=\s*['"]([^'"]+)['"]/);
    var ref     = extract(/var\s+ref\s*=\s*['"]([^'"]*)['"]/);
    var refSign = extract(/var\s+ref_sign\s*=\s*['"]([^'"]*)['"]/);

    if (!videoId || !videoHash) throw new Error('Kodik: cannot extract video params from iframe HTML');

    var body = new URLSearchParams({
        type: videoType || 'seria',
        id: videoId,
        hash: videoHash,
        domain: d || hostname,
        d_sign: dSign,
        pd: pd || hostname,
        pd_sign: pdSign,
        ref: ref || '',
        ref_sign: refSign || '',
        bad_user: 'true',
        cdn_is_working: 'true',
    });

    var postResp = await fetch('https://' + hostname + '/gvi', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': iframeUrl,
            'Origin': 'https://' + hostname,
        },
        body: body.toString(),
    });
    var data = await postResp.json();

    if (!data.links) throw new Error('Kodik: no links in response');

    var qualities = ['1080', '720', '480', '360'];
    for (var qi = 0; qi < qualities.length; qi++) {
        var sources = data.links[qualities[qi]];
        if (!sources || !sources.length) continue;
        var encoded = sources[0].src;
        for (var shift = 0; shift <= 25; shift++) {
            try {
                var decoded = caesarDecode(atob(encoded), shift);
                if (decoded.includes('://') && (decoded.includes('.m3u8') || decoded.includes('mp4:hls'))) {
                    var streamUrl = decoded.replace(/mp4:hls:manifest/g, 'index.m3u8');
                    if (streamUrl.startsWith('//')) streamUrl = 'https:' + streamUrl;
                    return { ok: true, streamUrl: streamUrl, quality: qualities[qi] };
                }
            } catch (e) { /* wrong shift, try next */ }
        }
    }
    throw new Error('Kodik: could not decode stream URL');
}

// ─────────────────────────────────────────────────────────────────────────────

function run() {
    try {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.openUrl) {
                chrome.storage.local.get('settings', (obj) => {
                    const settings = obj.settings;

                    if (settings && settings.playerTabOpens && settings.playerTabOpens === 'same') {
                        chrome.tabs.update(sender.tab.id, { url: request.openUrl });
                    } else {
                        chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
                            const currentIndex = tabs[0].index;
                            chrome.tabs.create({ url: request.openUrl, index: currentIndex + 1, active: true });
                        });
                    }
                });
                return false;
            }

            if (request.type === 'PROXY_IMAGE') {
                getProxyTabId().then(function(tabId) {
                    return fetchImageViaTab(tabId, request.url);
                }).then(function(response) {
                    sendResponse(response);
                }).catch(function(err) {
                    sendResponse({ ok: false, error: err.message || 'proxy error' });
                });
                return true;
            }

            if (request.type === 'FETCH_IMAGE') {
                fetchImageDirect(request.url, request.headers || {})
                    .then(sendResponse)
                    .catch(function(err) { sendResponse({ ok: false, error: err.message }); });
                return true;
            }

            if (request.type === 'FETCH_JSON') {
                fetchJson(request.url, request.headers || {})
                    .then(sendResponse)
                    .catch(function(err) { sendResponse({ ok: false, error: err.message }); });
                return true;
            }

            if (request.type === 'FETCH_READMANGA_CHAPTERS') {
                fetchReadMangaChapters(request.slug)
                    .then(sendResponse)
                    .catch(function(err) { sendResponse({ ok: false, error: err.message }); });
                return true;
            }

            if (request.type === 'FETCH_READMANGA_PAGES') {
                fetchReadMangaPages(request.url)
                    .then(sendResponse)
                    .catch(function(err) { sendResponse({ ok: false, error: err.message }); });
                return true;
            }

            if (request.type === 'FETCH_KODIK_STREAM') {
                fetchKodikStream(request.iframeUrl)
                    .then(sendResponse)
                    .catch(function(err) { sendResponse({ ok: false, error: err.message }); });
                return true;
            }

            return false;
        });
    } catch (err) {
        console.log(err);
    }
}

run();
