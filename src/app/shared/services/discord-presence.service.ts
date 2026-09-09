import { Injectable, OnDestroy, inject } from '@angular/core';
import { Store } from '@ngrx/store';

import { selectDiscordRpc } from '@app/store/settings/selectors/settings.selectors';
import { selectShikimoriDomain } from '@app/store/shikimori/selectors/shikimori.selectors';

const DRP_URL = 'http://127.0.0.1:56789/';
const HEARTBEAT_INTERVAL_MS = 30_000;

export interface PresenceData {
    animeId: number;
    animeName: string;
    animeNameRu?: string;
    episode: number;
    totalEpisodes?: number;
    posterPath?: string;
    startedAt?: number;
}

@Injectable({ providedIn: 'root' })
export class DiscordPresenceService implements OnDestroy {
    private readonly store = inject(Store);

    private enabled = false;
    private current: PresenceData | null = null;
    private paused = false;
    private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    private shikimoriDomain = 'https://shikimori.rip';

    constructor() {
        this.store.select(selectDiscordRpc).subscribe((enabled) => {
            this.enabled = enabled;
            if (!enabled) this.clear();
        });

        this.store.select(selectShikimoriDomain).subscribe((domain) => {
            this.shikimoriDomain = domain || 'https://shikimori.rip';
        });
    }

    play(data: PresenceData): void {
        if (!this.enabled) return;
        this.current = data;
        this.paused = false;
        this._send({
            type: 'PLAY',
            ...this._buildPayload(data),
            startedAt: data.startedAt ?? Date.now(),
            paused: false,
        });
        this._startHeartbeat();
    }

    pause(): void {
        if (!this.enabled || !this.current) return;
        this.paused = true;
        this._send({
            type: 'PAUSE',
            ...this._buildPayload(this.current),
            paused: true,
        });
    }

    resume(): void {
        if (!this.enabled || !this.current) return;
        this.paused = false;
        this._send({
            type: 'RESUME',
            ...this._buildPayload(this.current),
            startedAt: Date.now(),
            paused: false,
        });
    }

    clear(): void {
        this._stopHeartbeat();
        this.current = null;
        this._send({ type: 'STOP' });
    }

    ngOnDestroy(): void {
        this.clear();
    }

    private _buildPayload(data: PresenceData) {
        return {
            animeName: data.animeName,
            animeNameRu: data.animeNameRu,
            episode: data.episode,
            totalEpisodes: data.totalEpisodes,
            posterUrl: data.posterPath
                ? `${this.shikimoriDomain}${data.posterPath}`
                : undefined,
            animeUrl: `${this.shikimoriDomain}/animes/${data.animeId}`,
        };
    }

    private _startHeartbeat(): void {
        this._stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (!this.enabled || !this.current) return;
            this._send({ type: 'HEARTBEAT' });
        }, HEARTBEAT_INTERVAL_MS);
    }

    private _stopHeartbeat(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    private _send(msg: object): void {
        fetch(DRP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(msg),
        }).catch(() => {
            // Daemon not running — silently ignore
        });
    }
}
