'use strict';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type !== 'PROXY_IMAGE') return false;

    fetch(request.url, { referrer: window.location.href, referrerPolicy: 'unsafe-url' })
        .then((r) => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.blob();
        })
        .then((blob) => new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = reject;
            fr.readAsDataURL(blob);
        }))
        .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
        .catch((err) => sendResponse({ ok: false, error: err.message }));

    return true;
});
