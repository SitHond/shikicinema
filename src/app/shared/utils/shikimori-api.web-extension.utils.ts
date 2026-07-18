/* eslint-disable no-use-before-define */
const OOB_REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';

export interface AuthorizationCodeResult {
    code: string;
    redirectUri?: string;
}

export function getAuthorizationCode(
    shikimoriDomain: string,
    shikimoriOAuthClientId: string,
): Promise<AuthorizationCodeResult> {
    if (!hasChromeTabsApi()) {
        return getAuthorizationCodeFromBrowser(shikimoriDomain, shikimoriOAuthClientId);
    }

    return new Promise(async (resolve, reject) => {
        const codeUrl = createAuthorizationUrl(shikimoriDomain, shikimoriOAuthClientId, OOB_REDIRECT_URI);

        chrome.tabs.query({ active: true }, ([selectedTab]) =>
            chrome.tabs.create({ active: true, url: codeUrl.toString() }, (authCodeTab) => {
                const onRemove = (tabId) => {
                    if (tabId === authCodeTab.id) {
                        reject(new Error('tab-removed'));
                        removeListeners();
                    }
                };

                const onUpdate = (tabId, changeInfo) => {
                    const isUrlNoTChanged = !changeInfo.url;
                    const isShouldSignIn = changeInfo?.url?.toString()?.includes('sign_in');

                    if (isUrlNoTChanged || isShouldSignIn) {
                        return;
                    }

                    const tabUrl = new URL(changeInfo.url);
                    const error = tabUrl.searchParams.get('error');
                    const message = tabUrl.searchParams.get('error_description');
                    const code = tabUrl.toString().split('authorize/')[1];

                    if (
                        tabId !== authCodeTab.id ||
                        isUrlNoTChanged ||
                        tabUrl.toString().includes('response_type')
                    ) {
                        return;
                    }

                    if (error || message || !code) {
                        reject(new Error(error || message));
                    } else {
                        resolve({ code, redirectUri: OOB_REDIRECT_URI });
                    }

                    removeListeners();
                    chrome.tabs.update(
                        selectedTab.id,
                        { active: true },
                        () => chrome.tabs.remove(authCodeTab.id),
                    );
                };

                const removeListeners = () => {
                    chrome.tabs.onRemoved.removeListener(onRemove);
                    chrome.tabs.onUpdated.removeListener(onUpdate);
                };

                chrome.tabs.onRemoved.addListener(onRemove);
                chrome.tabs.onUpdated.addListener(onUpdate);
            }),
        );
    });
}

function getAuthorizationCodeFromBrowser(
    shikimoriDomain: string,
    shikimoriOAuthClientId: string,
): Promise<AuthorizationCodeResult> {
    return new Promise((resolve, reject) => {
        const codeUrl = createAuthorizationUrl(shikimoriDomain, shikimoriOAuthClientId, OOB_REDIRECT_URI);
        const authWindow = window.open(codeUrl.toString(), 'shikimori-oauth', 'popup,width=640,height=760');

        if (!authWindow) {
            reject(new Error('oauth-popup-blocked'));
            return;
        }

        window.setTimeout(() => {
            const code = window
                .prompt('Скопируйте код авторизации Shikimori из открытого окна и вставьте его сюда:')
                ?.trim();

            authWindow.close();

            if (!code) {
                reject(new Error('oauth-code-missing'));
                return;
            }

            resolve({ code, redirectUri: OOB_REDIRECT_URI });
        }, 500);
    });
}

function createAuthorizationUrl(shikimoriDomain: string, shikimoriOAuthClientId: string, redirectUri: string): URL {
    const codeUrl = new URL(`${shikimoriDomain}/oauth/authorize`);

    codeUrl.searchParams.set('client_id', shikimoriOAuthClientId);
    codeUrl.searchParams.set('redirect_uri', redirectUri);
    codeUrl.searchParams.set('response_type', 'code');
    codeUrl.searchParams.set('scope', 'user_rates comments topics');

    return codeUrl;
}

function hasChromeTabsApi(): boolean {
    return typeof chrome !== 'undefined' && Boolean(chrome.tabs?.create && chrome.tabs?.query);
}
