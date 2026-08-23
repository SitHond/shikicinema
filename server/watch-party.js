/**
 * Watch Party WebSocket server.
 * Deploy alongside api.sithond.com:
 *   node server/watch-party.js
 *
 * Expose via nginx proxy_pass at /watch-party with upgrade support.
 *
 * Dependencies: npm install ws
 */

const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.WATCH_PARTY_PORT || 3001;
const wss = new WebSocketServer({ port: PORT });

// roomId → { hostId, state, participants: Map<clientId, { id, nickname, ws }> }
const rooms = new Map();

let nextClientId = 1;

function generateRoomId() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function broadcast(room, message, excludeId = null) {
    const json = JSON.stringify(message);
    room.participants.forEach((p) => {
        if (p.id !== excludeId && p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(json);
        }
    });
}

function broadcastAll(room, message) {
    broadcast(room, message, null);
}

function participantList(room) {
    return Array.from(room.participants.values()).map((p) => ({
        id: p.id,
        nickname: p.nickname,
        isHost: p.id === room.hostId,
    }));
}

wss.on('connection', (ws) => {
    const clientId = nextClientId++;
    let currentRoomId = null;

    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        switch (msg.type) {

            case 'CREATE_ROOM': {
                let roomId;
                do { roomId = generateRoomId(); } while (rooms.has(roomId));

                const room = {
                    hostId: clientId,
                    state: { action: 'pause', position: 0, animeUrl: null, animeTitle: null },
                    participants: new Map(),
                };
                rooms.set(roomId, room);
                currentRoomId = roomId;

                const participant = { id: clientId, nickname: msg.nickname || 'Гость', ws };
                room.participants.set(clientId, participant);

                ws.send(JSON.stringify({
                    type: 'ROOM_CREATED',
                    roomId,
                    participants: participantList(room),
                    state: room.state,
                }));
                break;
            }

            case 'JOIN_ROOM': {
                const room = rooms.get(msg.roomId);
                if (!room) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Комната не найдена' }));
                    return;
                }

                currentRoomId = msg.roomId;
                const participant = { id: clientId, nickname: msg.nickname || 'Гость', ws };
                room.participants.set(clientId, participant);

                ws.send(JSON.stringify({
                    type: 'ROOM_JOINED',
                    roomId: msg.roomId,
                    participants: participantList(room),
                    state: room.state,
                    isHost: false,
                }));

                broadcast(room, {
                    type: 'USER_JOINED',
                    participant: { id: clientId, nickname: participant.nickname, isHost: false },
                }, clientId);
                break;
            }

            case 'LEAVE_ROOM': {
                handleLeave();
                break;
            }

            case 'SYNC_VIDEO': {
                const room = rooms.get(currentRoomId);
                if (!room) return;

                if (clientId !== room.hostId) {
                    ws.send(JSON.stringify({ type: 'ERROR', message: 'Только хост может управлять воспроизведением' }));
                    return;
                }

                room.state = {
                    action: msg.action,
                    position: msg.position ?? room.state.position,
                    animeUrl: msg.animeUrl ?? room.state.animeUrl,
                    animeTitle: msg.animeTitle ?? room.state.animeTitle,
                };

                broadcast(room, {
                    type: 'VIDEO_SYNC',
                    action: msg.action,
                    position: room.state.position,
                    animeUrl: room.state.animeUrl,
                    animeTitle: room.state.animeTitle,
                    userId: clientId,
                }, clientId);
                break;
            }

            case 'REQUEST_SYNC': {
                // New member asking host for current state
                const room = rooms.get(currentRoomId);
                if (!room) return;

                // Ask host to re-send state
                const host = room.participants.get(room.hostId);
                if (host && host.ws.readyState === WebSocket.OPEN) {
                    host.ws.send(JSON.stringify({ type: 'SYNC_REQUEST', fromId: clientId }));
                }
                break;
            }

            case 'SYNC_RESPONSE': {
                // Host responding to a sync request
                const room = rooms.get(currentRoomId);
                if (!room || clientId !== room.hostId) return;

                const target = room.participants.get(msg.toId);
                if (target && target.ws.readyState === WebSocket.OPEN) {
                    target.ws.send(JSON.stringify({
                        type: 'VIDEO_SYNC',
                        action: msg.action,
                        position: msg.position,
                        animeUrl: msg.animeUrl,
                        animeTitle: msg.animeTitle,
                        userId: clientId,
                    }));
                }
                break;
            }
        }
    });

    function handleLeave() {
        if (!currentRoomId) return;
        const room = rooms.get(currentRoomId);
        if (!room) return;

        room.participants.delete(clientId);

        if (room.participants.size === 0) {
            rooms.delete(currentRoomId);
        } else if (clientId === room.hostId) {
            // Pass host to next participant
            const next = room.participants.values().next().value;
            room.hostId = next.id;
            broadcastAll(room, { type: 'HOST_CHANGED', newHostId: next.id });
        }

        broadcast(room, { type: 'USER_LEFT', userId: clientId });
        currentRoomId = null;
    }

    ws.on('close', handleLeave);
    ws.on('error', handleLeave);
});

console.log(`Watch Party WS server running on ws://localhost:${PORT}`);
