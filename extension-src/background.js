
let discordWs = null;
let discordClientId = null;
let pendingActivity = null;

const DISCORD_PORTS = [6463, 6464, 6465, 6466, 6467, 6468, 6469, 6470, 6471, 6472];

function tryConnectPort(clientId, portIndex) {
    if (portIndex >= DISCORD_PORTS.length) {
        setTimeout(() => tryConnectPort(clientId, 0), 30000);
        return;
    }

    const port = DISCORD_PORTS[portIndex];
    let ws;
    let readyReceived = false;

    try {
        ws = new WebSocket(`ws://127.0.0.1:${port}/?v=1&client_id=${clientId}&encoding=json`);
    } catch(e) {
        tryConnectPort(clientId, portIndex + 1);
        return;
    }

    const connectTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
            ws.onclose = null;
            ws.onerror = null;
            ws.close();
            tryConnectPort(clientId, portIndex + 1);
        }
    }, 3000);

    ws.onopen = () => {
        clearTimeout(connectTimeout);
        ws.send(JSON.stringify({
            cmd: 'HANDSHAKE',
            nonce: String(Date.now()),
            args: { v: 1, client_id: clientId },
        }));
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.evt === 'READY') {
                readyReceived = true;
                discordWs = ws;
                if (pendingActivity) {
                    sendDiscordActivity(pendingActivity);
                }
            }
        } catch(e) {}
    };

    ws.onerror = () => {
        clearTimeout(connectTimeout);
    };

    ws.onclose = () => {
        clearTimeout(connectTimeout);
        if (!readyReceived) {
            tryConnectPort(clientId, portIndex + 1);
        } else if (discordWs === ws) {
            discordWs = null;
            setTimeout(() => {
                if (discordClientId === clientId) {
                    tryConnectPort(clientId, 0);
                }
            }, 30000);
        }
    };
}

function connectDiscord(clientId) {
    if (discordWs) {
        discordWs.onclose = null;
        discordWs.onerror = null;
        discordWs.close();
        discordWs = null;
    }

    discordClientId = clientId;
    tryConnectPort(clientId, 0);
}

function sendDiscordActivity(activity) {
    if (!discordWs || discordWs.readyState !== WebSocket.OPEN) {
        pendingActivity = activity;
        return;
    }

    try {
        discordWs.send(JSON.stringify({
            cmd: 'SET_ACTIVITY',
            args: { pid: 1, activity },
            nonce: String(Date.now()),
        }));
        pendingActivity = null;
    } catch(e) {
        pendingActivity = activity;
    }
}

function clearDiscordActivity() {
    pendingActivity = null;
    if (!discordWs || discordWs.readyState !== WebSocket.OPEN) return;
    try {
        discordWs.send(JSON.stringify({
            cmd: 'SET_ACTIVITY',
            args: { pid: 1, activity: null },
            nonce: String(Date.now()),
        }));
    } catch(e) {}
}

function run() {
    try {
        chrome.runtime.onMessage.addListener((request, sender) => {
            if ('discordActivity' in request) {
                const payload = request.discordActivity;

                if (payload && payload.clientId) {
                    const { clientId, ...activity } = payload;

                    pendingActivity = activity;

                    if (discordClientId !== clientId || !discordWs || discordWs.readyState === WebSocket.CLOSED || discordWs.readyState === WebSocket.CLOSING) {
                        connectDiscord(clientId);
                    } else if (discordWs.readyState === WebSocket.OPEN) {
                        sendDiscordActivity(activity);
                    }
                } else {
                    clearDiscordActivity();
                }

                return false;
            }

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
            }

            return false;
        });
    } catch (err) {
        console.log(err);
    }
}

run();
