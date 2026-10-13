
// Mutable — updated from API on startup so isTrustedSender() picks up new domains.
const SHIKIMORI_URL_PATTERNS = [
    '*://shikimori.rip/*',
    '*://shikimori.fi/*',
    '*://shikimori.net/*',
    '*://shikimori.moe/*',
    '*://shikimori.mov/*',
    '*://shikimori.life/*',
    '*://ygg.shiki.rip/*',
];

// ── Dynamic domain management ─────────────────────────────────────────────────

var DOMAINS_API_URL = 'https://api.sithond.com/api/config/domains';
var DOMAINS_CACHE_KEY = 'shikirip_domains_cache';
var FALLBACK_DOMAINS = [
    'https://shikimori.rip',
    'https://shikimori.fi',
    'https://shikimori.net',
    'https://shikimori.moe',
    'https://shikimori.mov',
    'https://shikimori.life',
    'https://ygg.shiki.rip',
];

function domainToPattern(domain) {
    try {
        var parsed = new URL(domain);
        return parsed.protocol + '//' + parsed.hostname + '/*';
    } catch { return null; }
}

function domainToOrigin(domain) {
    return domain.replace(/\/$/, '') + '/*';
}

function scriptIdForDomain(domain) {
    return 'sc_' + domain.replace(/https?:\/\//, '').replace(/[^a-z0-9]/gi, '_');
}

async function loadDomainList() {
    try {
        var resp = await fetch(DOMAINS_API_URL, { signal: AbortSignal.timeout(8000) });
        if (resp.ok) {
            var data = await resp.json();
            if (Array.isArray(data.domains) && data.domains.length > 0) {
                await chrome.storage.local.set({ [DOMAINS_CACHE_KEY]: data.domains });
                return data.domains;
            }
        }
    } catch (e) { /* network error — use cache */ }

    try {
        var stored = await chrome.storage.local.get(DOMAINS_CACHE_KEY);
        if (stored[DOMAINS_CACHE_KEY] && stored[DOMAINS_CACHE_KEY].length) {
            return stored[DOMAINS_CACHE_KEY];
        }
    } catch (e) {}

    return FALLBACK_DOMAINS;
}

var hasScriptingApi = typeof chrome !== 'undefined' && !!chrome.scripting && !!chrome.scripting.getRegisteredContentScripts;

async function registerContentScriptsForGrantedDomains(domains) {
    if (!hasScriptingApi) return; // Firefox MV2 uses static content_scripts
    for (var i = 0; i < domains.length; i++) {
        var domain = domains[i];
        try {
            var hasPermission = await chrome.permissions.contains({ origins: [domainToOrigin(domain)] });
            if (!hasPermission) continue;

            var id = scriptIdForDomain(domain);
            var existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
            if (existing.length > 0) continue;

            var pattern = domainToPattern(domain);
            if (!pattern) continue;

            await chrome.scripting.registerContentScripts([{
                id: id,
                matches: [pattern],
                js: ['shikicinema.js'],
                css: ['watch-button.css'],
                runAt: 'document_idle',
            }]);
        } catch (e) {
            console.warn('[ShikiRIP] registerContentScripts failed for', domain, e.message);
        }
    }
}

async function cleanupRemovedDomains(activeDomains) {
    if (!hasScriptingApi) return;
    try {
        var registered = await chrome.scripting.getRegisteredContentScripts();
        for (var i = 0; i < registered.length; i++) {
            var script = registered[i];
            if (!script.id.startsWith('sc_')) continue;
            var isActive = activeDomains.some(function(d) {
                return domainToPattern(d) === (script.matches && script.matches[0]);
            });
            if (!isActive) {
                await chrome.scripting.unregisterContentScripts({ ids: [script.id] });
            }
        }
    } catch (e) { /* ignore */ }
}

function syncUrlPatterns(domains) {
    SHIKIMORI_URL_PATTERNS.length = 0;
    for (var i = 0; i < domains.length; i++) {
        var p = domainToPattern(domains[i]);
        if (p) SHIKIMORI_URL_PATTERNS.push(p);
    }
}

async function initDynamicDomains() {
    var domains = await loadDomainList();
    syncUrlPatterns(domains);
    await registerContentScriptsForGrantedDomains(domains);
    await cleanupRemovedDomains(domains);
}

// Show notification when user visits a Shikimori domain without permission
async function checkTabForNewDomain(tab) {
    if (!tab || !tab.url) return;
    var url;
    try { url = new URL(tab.url); } catch { return; }
    if (url.protocol !== 'https:') return;

    var stored = await chrome.storage.local.get(DOMAINS_CACHE_KEY);
    var domains = (stored[DOMAINS_CACHE_KEY] && stored[DOMAINS_CACHE_KEY].length)
        ? stored[DOMAINS_CACHE_KEY]
        : FALLBACK_DOMAINS;

    var matched = null;
    for (var i = 0; i < domains.length; i++) {
        try {
            if (new URL(domains[i]).hostname === url.hostname) { matched = domains[i]; break; }
        } catch {}
    }
    if (!matched) return;

    var hasPermission = await chrome.permissions.contains({ origins: [domainToOrigin(matched)] });
    if (hasPermission) return;

    // Avoid repeated notifications for the same tab
    var stateKey = 'notif_shown_' + tab.id;
    var alreadyShown = await chrome.storage.local.get(stateKey);
    if (alreadyShown[stateKey]) return;
    await chrome.storage.local.set({ [stateKey]: true });

    var notifId = 'new_shiki_domain_' + tab.id;
    chrome.notifications.create(notifId, {
        type: 'basic',
        iconUrl: 'assets/icon128.png',
        title: 'ShikiRIP Cinema',
        message: 'Обнаружен новый домен Shikimori: ' + url.hostname + '\nНажмите на это уведомление, чтобы разрешить работу расширения.',
        requireInteraction: true,
    });
    await chrome.storage.local.set({ [notifId]: { domain: matched, tabId: tab.id } });
}

// Body click works on all platforms (unlike buttons which fail on Firefox/Linux)
chrome.notifications.onClicked.addListener(function(notifId) {
    if (!notifId.startsWith('new_shiki_domain_')) return;
    chrome.notifications.clear(notifId);
    chrome.storage.local.get(notifId, function(data) {
        var info = data[notifId];
        if (!info) return;
        var url = chrome.runtime.getURL('permission-grant.html')
            + '?domain=' + encodeURIComponent(info.domain)
            + '&tabId=' + info.tabId
            + '&notifId=' + encodeURIComponent(notifId);
        chrome.tabs.create({ url: url, active: true });
    });
});

// permission-grant.html notifies background after user grants permission
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.type === 'DOMAIN_PERMISSION_GRANTED' && request.domain) {
        var grantedDomains = Array.isArray(request.domain) ? request.domain : [request.domain];
        registerContentScriptsForGrantedDomains(grantedDomains).then(function() {
            loadDomainList().then(syncUrlPatterns);
            // Reload all open tabs on any of the newly granted domains
            chrome.tabs.query({}, function(tabs) {
                tabs.forEach(function(tab) {
                    if (!tab.url) return;
                    var tabHost;
                    try { tabHost = new URL(tab.url).hostname; } catch { return; }
                    var matches = grantedDomains.some(function(d) {
                        try { return new URL(d).hostname === tabHost; } catch { return false; }
                    });
                    if (matches) chrome.tabs.reload(tab.id);
                });
            });
        });
    }
});

// Clear per-tab notification state when tab is closed
chrome.tabs.onRemoved.addListener(function(tabId) {
    chrome.storage.local.remove(['notif_shown_' + tabId, 'new_shiki_domain_' + tabId]);
});

chrome.runtime.onInstalled.addListener(function(details) {
    initDynamicDomains();
    if (details.reason === 'install') {
        loadDomainList().then(function(domains) {
            var url = chrome.runtime.getURL('permission-grant.html')
                + '?domains=' + encodeURIComponent(domains.join(','))
                + '&mode=initial';
            chrome.tabs.create({ url: url, active: true });
        });
    }
});
chrome.runtime.onStartup.addListener(function() { initDynamicDomains(); });

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete' && tab.url) {
        checkTabForNewDomain(tab);
    }
});

// ─────────────────────────────────────────────────────────────────────────────

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

    var shikiDomain = getShikimoriDomain();
    var resp = await fetch(iframeUrl, {
        headers: { 'Referer': shikiDomain + '/' }
    });
    var html = await resp.text();
    var hostname = new URL(resp.url).hostname;

    function extract(re) { return (html.match(re) || [])[1] || ''; }

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

    // Dynamically find POST endpoint from the JS bundle
    var postLink = '/gvi';
    var scriptSrc = extract(/<script[^>]+src="([^"]*\/assets\/js\/app[^"]*\.js[^"]*)"/);
    if (scriptSrc) {
        var scriptUrl = scriptSrc.startsWith('//') ? 'https:' + scriptSrc
                      : scriptSrc.startsWith('/') ? 'https://' + hostname + scriptSrc
                      : scriptSrc;
        try {
            var jsResp = await fetch(scriptUrl, { headers: { 'Referer': iframeUrl } });
            var jsText = await jsResp.text();
            var ajaxMatch = jsText.match(/\$\.ajax\(\{[^}]*type\s*:\s*["']POST["'][^}]*url\s*:\s*(?:atob\()?["']([^"']+)["']\)?/);
            if (ajaxMatch) {
                try { postLink = atob(ajaxMatch[1]); } catch (e) { postLink = ajaxMatch[1]; }
            }
        } catch (e) { /* fallback to /gvi */ }
    }

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

    var postUrl = postLink.startsWith('http') ? postLink : 'https://' + hostname + postLink;
    var postResp = await fetch(postUrl, {
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

        // Already decoded
        if (encoded.includes('mp4:hls:manifest')) {
            var baseUrl = encoded.replace(/^https?:/, '').replace(/\/[^/]*$/, '');
            return { ok: true, streamUrl: 'https:' + baseUrl + '/' + qualities[qi] + '.mp4:hls:manifest.m3u8', quality: qualities[qi] };
        }

        for (var shift = 0; shift <= 25; shift++) {
            try {
                var padded = encoded + '==='.slice((encoded.length + 3) % 4);
                var decoded = caesarDecode(atob(padded), shift);
                if (decoded.includes('mp4:hls:manifest')) {
                    var baseUrl = decoded.replace(/^https?:/, '').replace(/\/[^/]*$/, '');
                    return { ok: true, streamUrl: 'https:' + baseUrl + '/' + qualities[qi] + '.mp4:hls:manifest.m3u8', quality: qualities[qi] };
                }
            } catch (e) { /* wrong shift, try next */ }
        }
    }
    throw new Error('Kodik: could not decode stream URL');
}

// ── Kodik CDN: fix Referer + CORS (Firefox/v2 webRequest) ────────────────────

if (typeof chrome !== 'undefined' && chrome.webRequest) {
    chrome.webRequest.onBeforeSendHeaders.addListener(
        function(details) {
            var headers = details.requestHeaders || [];
            var hasReferer = false;
            for (var i = 0; i < headers.length; i++) {
                if (headers[i].name.toLowerCase() === 'referer') {
                    headers[i].value = 'https://kodik.info/';
                    hasReferer = true;
                }
            }
            if (!hasReferer) {
                headers.push({ name: 'Referer', value: 'https://kodik.info/' });
            }
            return { requestHeaders: headers };
        },
        { urls: ['https://*.solodcdn.com/*'] },
        ['blocking', 'requestHeaders']
    );

    chrome.webRequest.onHeadersReceived.addListener(
        function(details) {
            var headers = details.responseHeaders || [];
            headers = headers.filter(function(h) {
                return h.name.toLowerCase() !== 'access-control-allow-origin';
            });
            headers.push({ name: 'Access-Control-Allow-Origin', value: '*' });
            return { responseHeaders: headers };
        },
        { urls: ['https://*.solodcdn.com/*'] },
        ['blocking', 'responseHeaders']
    );
}

// ── Rutube CDN: fix Referer + CORS (Firefox/v2 webRequest) ───────────────────

if (typeof chrome !== 'undefined' && chrome.webRequest) {
    chrome.webRequest.onBeforeSendHeaders.addListener(
        function(details) {
            var headers = details.requestHeaders || [];
            var hasReferer = false;
            for (var i = 0; i < headers.length; i++) {
                if (headers[i].name.toLowerCase() === 'referer') {
                    headers[i].value = 'https://rutube.ru/';
                    hasReferer = true;
                }
            }
            if (!hasReferer) {
                headers.push({ name: 'Referer', value: 'https://rutube.ru/' });
            }
            return { requestHeaders: headers };
        },
        { urls: ['https://*.rutube.ru/*', 'https://rutube.ru/*'] },
        ['blocking', 'requestHeaders']
    );

    chrome.webRequest.onHeadersReceived.addListener(
        function(details) {
            var headers = details.responseHeaders || [];
            headers = headers.filter(function(h) {
                var n = h.name.toLowerCase();
                return n !== 'access-control-allow-origin' && n !== 'access-control-allow-methods';
            });
            headers.push({ name: 'Access-Control-Allow-Origin', value: '*' });
            headers.push({ name: 'Access-Control-Allow-Methods', value: 'GET, OPTIONS, HEAD' });
            return { responseHeaders: headers };
        },
        { urls: ['https://*.rutube.ru/*'] },
        ['blocking', 'responseHeaders']
    );
}

// ── Unread messages badge ─────────────────────────────────────────────────────

var UNREAD_POLL_INTERVAL = 5 * 60 * 1000; // 5 min

function getStoredJson(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
}

function getAuthToken() {
    var auth = getStoredJson('auth');
    return auth && auth.shikimoriBearerToken ? auth.shikimoriBearerToken : null;
}

function getShikimoriDomain() {
    var shikimori = getStoredJson('shikimori');
    return (shikimori && shikimori.shikimoriDomain) || 'https://shikimori.rip';
}

function setBadge(count) {
    var text = count > 0 ? String(count > 99 ? 99 : count) : '';
    var api = chrome.action || chrome.browserAction;
    if (!api) return;
    api.setBadgeText({ text: text });
    if (count > 0) api.setBadgeBackgroundColor({ color: '#e53935' });
}

async function checkUnreadMessages() {
    var token = getAuthToken();
    if (!token) { setBadge(0); return; }
    var domain = getShikimoriDomain();
    try {
        var resp = await fetch(domain + '/api/messages/unread_count', {
            headers: { 'Authorization': token },
        });
        if (!resp.ok) return;
        var data = await resp.json();
        var total = (data.messages || 0) + (data.news || 0) + (data.notifications || 0);
        setBadge(total);
    } catch (e) { /* network error — keep old badge */ }
}

// ─────────────────────────────────────────────────────────────────────────────

function run() {
    // Start unread badge polling
    checkUnreadMessages();
    setInterval(checkUnreadMessages, UNREAD_POLL_INTERVAL);

    function isTrustedSender(sender) {
        if (!sender.tab || !sender.url) return false;
        try {
            var origin = new URL(sender.url).hostname;
            return SHIKIMORI_URL_PATTERNS.some(function(p) {
                // pattern: '*://shikimori.rip/*' → extract hostname
                var m = p.match(/\*:\/\/([^/]+)\//);
                if (!m) return false;
                var host = m[1].replace(/^\*\./, '');
                return origin === host || origin.endsWith('.' + host);
            });
        } catch { return false; }
    }

    try {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (!isTrustedSender(sender)) return false;

            if (request.openUrl) {
                var openUrl = request.openUrl;
                var isExtensionUrl = typeof openUrl === 'string' && openUrl.startsWith(chrome.runtime.getURL(''));
                var isSafeUrl = typeof openUrl === 'string' && /^https?:\/\//i.test(openUrl);
                if (!isExtensionUrl && !isSafeUrl) return false;

                chrome.storage.local.get('settings', (obj) => {
                    const settings = obj.settings;

                    if (settings && settings.playerTabOpens && settings.playerTabOpens === 'same') {
                        chrome.tabs.update(sender.tab.id, { url: openUrl });
                    } else {
                        chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
                            const currentIndex = tabs[0].index;
                            chrome.tabs.create({ url: openUrl, index: currentIndex + 1, active: true });
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
