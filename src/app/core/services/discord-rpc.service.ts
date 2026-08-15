import { DestroyRef, Injectable, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { combineLatest, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { environment } from '@app-env/environment';
import {
    selectCurrentPlayerAnime,
    selectCurrentPlayerEpisode,
} from '@app/modules/player/store/selectors/player.selectors';

const NATIVE_HOST_ID = 'com.shikicinema.drp';

interface DrpSetActivity {
    type: 'SET_ACTIVITY';
    animeName: string;
    episode: number;
    posterUrl: string | null;
}

interface DrpClearActivity {
    type: 'CLEAR_ACTIVITY';
}

type DrpMessage = DrpSetActivity | DrpClearActivity;

@Injectable()
export class DiscordRpcService {
    private readonly store = inject(Store);
    private readonly destroyRef = inject(DestroyRef);

    private port: chrome.runtime.Port | null = null;

    constructor() {
        if (!this.isAvailable()) return;

        this.connect();

        combineLatest([
            this.store.select(selectCurrentPlayerAnime),
            this.store.select(selectCurrentPlayerEpisode),
        ]).pipe(
            distinctUntilChanged(([a1, e1], [a2, e2]) => a1?.id === a2?.id && e1 === e2),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe(([anime, episode]) => {
            if (!anime?.id || !episode) return;

            const shikimoriBase = environment.shikimori.apiURI.replace(/\/api$/, '');
            const posterUrl = anime.image?.original
                ? `${shikimoriBase}${anime.image.original}`
                : null;

            this.send({
                type: 'SET_ACTIVITY',
                animeName: anime.russian || anime.name,
                episode,
                posterUrl,
            });
        });

        this.destroyRef.onDestroy(() => {
            this.send({ type: 'CLEAR_ACTIVITY' });
            this.disconnect();
        });
    }

    private isAvailable(): boolean {
        return typeof chrome !== 'undefined' &&
            typeof (chrome.runtime as typeof chrome.runtime | undefined)?.connectNative === 'function';
    }

    private connect(): void {
        try {
            this.port = chrome.runtime.connectNative(NATIVE_HOST_ID);

            this.port.onDisconnect.addListener(() => {
                // chrome.runtime.lastError is set when the host is not installed — this is expected
                const err = chrome.runtime.lastError;
                if (err) {
                    console.debug('[DRP] Native host unavailable:', err.message);
                }
                this.port = null;
            });
        } catch (e) {
            console.debug('[DRP] connectNative failed:', e);
            this.port = null;
        }
    }

    private send(msg: DrpMessage): void {
        if (!this.port) return;
        try {
            this.port.postMessage(msg);
        } catch {
            this.port = null;
        }
    }

    private disconnect(): void {
        try {
            this.port?.disconnect();
        } catch {/* ignored */}
        this.port = null;
    }
}
