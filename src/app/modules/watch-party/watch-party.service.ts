import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import {
    selectShikimoriCurrentUser,
    selectShikimoriCurrentUserNickname,
} from '@app/store/shikimori/selectors/shikimori.selectors';

export interface WatchPartyParticipant {
    id: string;
    nickname: string;
    isHost: boolean;
}

export interface WatchPartyVideoState {
    playing: boolean;
    currentTime: number;
    animeId: string | null;
    episode: number | null;
    vkId: string | null;
    animeUrl: string | null;
    animeTitle: string | null;
}

export type WatchPartyStatus = 'disconnected' | 'connecting' | 'lobby' | 'room';

const WS_URL = 'wss://api.sithond.com/watch-party';
const RECONNECT_DELAY = 3000;
const SESSION_KEY = 'wp:roomId';

@Injectable({ providedIn: 'root' })
export class WatchPartyService implements OnDestroy {
    private readonly store = inject(Store);
    private ws: WebSocket | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingJoinRoomId: string | null = null;
    private hostId: string | null = null;
    private mySocketId: string | null = null;

    readonly status = signal<WatchPartyStatus>('disconnected');
    readonly roomId = signal<string | null>(null);
    readonly isHost = signal(false);
    readonly participants = signal<WatchPartyParticipant[]>([]);
    readonly videoState = signal<WatchPartyVideoState | null>(null);
    readonly error = signal<string | null>(null);
    readonly lastSyncEvent = signal<WatchPartyVideoState | null>(null);

    readonly isLoggedIn = this.store.selectSignal(selectShikimoriCurrentUser);

    private get nickname(): string {
        return this.store.selectSignal(selectShikimoriCurrentUserNickname)() ?? '';
    }

    connect(): void {
        if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;

        this.status.set('connecting');
        this.error.set(null);

        this.ws = new WebSocket(WS_URL);

        this.ws.onopen = () => {
            const savedRoomId = sessionStorage.getItem(SESSION_KEY);
            if (this.pendingJoinRoomId) {
                this.status.set('lobby');
                this.joinRoom(this.pendingJoinRoomId);
                this.pendingJoinRoomId = null;
            } else if (savedRoomId) {
                // Auto-rejoin after reconnect — status stays 'connecting' until ROOM_JOINED arrives
                this.send({ type: 'JOIN_ROOM', roomId: savedRoomId, name: this.nickname });
            } else {
                this.status.set('lobby');
            }
        };

        this.ws.onmessage = (event) => this.handleMessage(JSON.parse(event.data as string));

        this.ws.onerror = () => {
            this.error.set('Не удалось подключиться к серверу');
        };

        this.ws.onclose = () => {
            if (this.status() === 'room') {
                // Save room for auto-rejoin, keep status as 'connecting' for UI
                const currentRoomId = this.roomId();
                if (currentRoomId) sessionStorage.setItem(SESSION_KEY, currentRoomId);
                this.status.set('connecting');
                this.scheduleReconnect();
            } else {
                this.status.set('disconnected');
            }
        };
    }

    disconnect(): void {
        this.clearReconnect();
        this.pendingJoinRoomId = null;
        sessionStorage.removeItem(SESSION_KEY);
        this.ws?.close();
        this.ws = null;
        this.mySocketId = null;
        this.status.set('disconnected');
        this.roomId.set(null);
        this.isHost.set(false);
        this.hostId = null;
        this.participants.set([]);
        this.videoState.set(null);
    }

    createRoom(): void {
        if (!this.nickname) {
            this.error.set('Войдите в аккаунт Shikimori'); return;
        }
        this.send({ type: 'CREATE_ROOM', name: this.nickname });
    }

    joinRoom(roomId: string): void {
        if (!this.nickname) {
            this.error.set('Войдите в аккаунт Shikimori'); return;
        }
        if (this.status() === 'connecting') {
            this.pendingJoinRoomId = roomId;
            return;
        }
        this.send({ type: 'JOIN_ROOM', roomId: roomId.toUpperCase(), name: this.nickname });
    }

    leaveRoom(): void {
        sessionStorage.removeItem(SESSION_KEY);
        this.send({ type: 'LEAVE_ROOM' });
        this.roomId.set(null);
        this.isHost.set(false);
        this.hostId = null;
        this.participants.set([]);
        this.videoState.set(null);
        this.status.set('lobby');
    }

    syncVideo(playing: boolean, currentTime: number): void {
        const current = this.videoState();
        this.send({
            type: 'SYNC_VIDEO',
            videoState: {
                playing, currentTime,
                animeUrl: current?.animeUrl ?? null, animeTitle: current?.animeTitle ?? null,
            },
        });
        this.videoState.update((s) => s ? { ...s, playing, currentTime } : s);
    }

    shareAnime(animeId: string, episode: number, animeTitle: string, animeUrl: string, vkId?: string): void {
        if (!this.isHost()) return;
        this.send({ type: 'SET_ANIME', animeId, episode, animeTitle, animeUrl, vkId: vkId ?? null });
        this.videoState.update((s) => ({
            playing: false, currentTime: 0,
            ...s,
            animeId, episode, animeTitle, animeUrl,
            vkId: vkId ?? s?.vkId ?? null,
        }));
    }

    selectSource(vkId: string): void {
        if (!this.isHost()) return;
        this.send({ type: 'SET_ANIME', vkId });
        this.videoState.update((s) => s ? { ...s, vkId, playing: false, currentTime: 0 } : s);
    }

    kickParticipant(participantId: string): void {
        if (!this.isHost()) return;
        this.send({ type: 'KICK_PARTICIPANT', participantId });
    }

    banParticipant(participantId: string): void {
        if (!this.isHost()) return;
        this.send({ type: 'BAN_PARTICIPANT', participantId });
    }

    changeEpisode(episode: number): void {
        if (!this.isHost()) return;
        const current = this.videoState();
        if (!current?.animeId || episode < 1) return;
        this.send({ type: 'SET_ANIME', episode, vkId: null });
        this.videoState.update((s) => s ? { ...s, episode, vkId: null, playing: false, currentTime: 0 } : s);
    }

    private mapParticipants(raw: { id: string; name: string }[], hostId: string): WatchPartyParticipant[] {
        return raw.map((p) => ({ id: p.id, nickname: p.name, isHost: p.id === hostId }));
    }

    private handleMessage(msg: any): void {
        switch (msg.type) {
            case 'CONNECTED':
                this.mySocketId = msg.socketId;
                break;

            case 'ROOM_CREATED':
                this.hostId = msg.hostId;
                this.roomId.set(msg.roomId);
                this.isHost.set(true);
                this.participants.set(this.mapParticipants(msg.participants ?? [], msg.hostId));
                this.videoState.set(msg.videoState ?? null);
                this.status.set('room');
                sessionStorage.setItem(SESSION_KEY, msg.roomId);
                break;

            case 'ROOM_JOINED': {
                this.hostId = msg.hostId;
                this.roomId.set(msg.roomId);
                const amHost = msg.hostId === this.mySocketId;
                this.isHost.set(amHost);
                this.participants.set(this.mapParticipants(msg.participants ?? [], msg.hostId));
                this.videoState.set(msg.videoState ?? null);
                this.status.set('room');
                sessionStorage.setItem(SESSION_KEY, msg.roomId);
                if (msg.videoState?.animeId) {
                    this.lastSyncEvent.set(msg.videoState);
                }
                if (!amHost) {
                    // Ask host for exact current time
                    this.send({ type: 'REQUEST_SYNC' });
                }
                break;
            }

            case 'PARTICIPANT_JOINED':
                this.participants.update((p) => [
                    ...p,
                    {
                        id: msg.participant.id, nickname: msg.participant.name,
                        isHost: msg.participant.id === this.hostId,
                    },
                ]);
                break;

            case 'PARTICIPANT_LEFT':
                this.participants.update((p) => p.filter((x) => x.id !== msg.participantId));
                break;

            case 'HOST_CHANGED':
                this.hostId = msg.hostId;
                this.isHost.set(msg.hostId === this.mySocketId);
                this.participants.update((p) => p.map((x) => ({ ...x, isHost: x.id === msg.hostId })));
                break;

            case 'VIDEO_STATE':
                this.videoState.set(msg.videoState);
                this.lastSyncEvent.set(msg.videoState);
                break;

            case 'SYNC_REQUESTED':
                if (this.isHost()) {
                    const current = this.videoState();
                    if (current) {
                        this.send({ type: 'SYNC_RESPONSE', targetId: msg.requesterId, videoState: current });
                    }
                }
                break;

            case 'KICKED':
                sessionStorage.removeItem(SESSION_KEY);
                this.roomId.set(null);
                this.isHost.set(false);
                this.hostId = null;
                this.participants.set([]);
                this.videoState.set(null);
                this.status.set('lobby');
                this.error.set('Вас выгнали из комнаты');
                break;

            case 'BANNED':
                sessionStorage.removeItem(SESSION_KEY);
                this.roomId.set(null);
                this.isHost.set(false);
                this.hostId = null;
                this.participants.set([]);
                this.videoState.set(null);
                this.status.set('lobby');
                this.error.set('Вы заблокированы в этой комнате');
                break;

            case 'ERROR':
                this.error.set(msg.message);
                // If room not found during auto-rejoin, clear saved id and go to lobby
                if (msg.message === 'Room not found') {
                    sessionStorage.removeItem(SESSION_KEY);
                    this.status.set('lobby');
                }
                break;
        }
    }

    private send(data: object): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    private scheduleReconnect(): void {
        this.clearReconnect();
        this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_DELAY);
    }

    private clearReconnect(): void {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    ngOnDestroy(): void {
        this.disconnect();
    }
}
