var params = new URLSearchParams(location.search);
var mode    = params.get('mode') || 'single';
var domain  = params.get('domain') || '';
var tabId   = parseInt(params.get('tabId') || '0', 10);
var notifId = params.get('notifId') || '';
var domains = params.get('domains') ? params.get('domains').split(',').filter(Boolean) : [];

var _chrome = typeof chrome !== 'undefined' ? chrome : browser;

var wrap = document.getElementById('domain-wrap');
var desc = document.getElementById('desc');

if (mode === 'initial') {
    document.getElementById('title').textContent = 'Настройка ShikiRIP Cinema';
    desc.textContent = 'Расширению нужен доступ к сайтам Shikimori для работы плеера. Это одноразовое действие.';
    var list = document.createElement('div');
    list.className = 'domain-list';
    domains.forEach(function(d) {
        var el = document.createElement('div');
        el.className = 'domain';
        el.textContent = d;
        list.appendChild(el);
    });
    wrap.appendChild(list);
} else {
    desc.textContent = 'Этот домен появился в официальном списке ShikiRIP. Разрешите расширению работать на нём — это одноразовое действие.';
    var el = document.createElement('div');
    el.className = 'domain';
    el.textContent = domain || '—';
    wrap.appendChild(el);
}

function grantPermission() {
    var btn = document.getElementById('btn-grant');
    var status = document.getElementById('status');

    var origins;
    if (mode === 'initial') {
        if (!domains.length) { status.textContent = 'Список доменов пуст.'; status.className = 'status err'; return; }
        origins = domains.map(function(d) { return d.replace(/\/$/, '') + '/*'; });
    } else {
        if (!domain) { status.textContent = 'Домен не указан.'; status.className = 'status err'; return; }
        origins = [domain.replace(/\/$/, '') + '/*'];
    }

    btn.disabled = true;
    btn.textContent = 'Запрос разрешения…';

    function onGranted(granted) {
        if (!granted) {
            status.textContent = 'Разрешение не выдано.';
            status.className = 'status err';
            btn.disabled = false;
            btn.textContent = 'Разрешить доступ';
            return;
        }

        status.textContent = mode === 'initial' ? 'Готово! Можно закрыть эту вкладку.' : 'Готово! Страница перезагружается…';
        status.className = 'status ok';

        if (mode === 'initial') {
            domains.forEach(function(d) {
                _chrome.runtime.sendMessage({ type: 'DOMAIN_PERMISSION_GRANTED', domain: d });
            });
            setTimeout(function() { window.close(); }, 1200);
        } else {
            _chrome.runtime.sendMessage({ type: 'DOMAIN_PERMISSION_GRANTED', domain: domain });
            if (notifId) _chrome.storage.local.remove([notifId, 'notif_shown_' + tabId]);
            setTimeout(function() {
                if (tabId) _chrome.tabs.update(tabId, { active: true });
                if (tabId) _chrome.tabs.reload(tabId);
                window.close();
            }, 800);
        }
    }

    if (_chrome.permissions && _chrome.permissions.request) {
        _chrome.permissions.request({ origins: origins }, onGranted);
    } else {
        status.textContent = 'chrome.permissions API недоступен.';
        status.className = 'status err';
        btn.disabled = false;
    }
}

document.getElementById('btn-grant').addEventListener('click', grantPermission);
