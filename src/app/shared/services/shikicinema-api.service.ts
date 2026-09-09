import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import { environment } from '@app-env/environment';

export type ReportCategory = 'broken_link' | 'wrong_episode' | 'wrong_dub' | 'spam' | 'copyright' | 'other';

/** Shared regex for detecting Kodik iframe URLs */
export const KODIK_URL_RE = /kodik(?:player)?\.(?:info|biz|cc|com)\//;

/** Canonical resolved-stream shape used across player.page, embed.page and wp-video-player */
export interface ResolvedStream {
    url: string | null;
    urlType: 'video' | 'iframe';
    streams?: Record<string, string>;
}

export interface KodikStreamResponse {
    ok: true;
    streamUrl: string;
    streams: Record<string, string>;
    quality: string;
}

export interface WatchHistoryStats {
    ok: true;
    summary: {
        total_episodes: number;
        total_anime: number;
        watch_hours: number;
        first_watched_at: string | null;
    };
    by_month: { month: string; count: number }[];
    by_provider: { provider: string; count: number }[];
    by_weekday: { dow: number; count: number }[];
    top_anime: { anime_id: number; count: number }[];
}

export interface SubmitReportParams {
    type: 'anime' | 'manga';
    target_id: string;
    category: ReportCategory;
    video_id?: number;
    description?: string;
}

@Injectable({
    providedIn: 'root',
})
export class ShikicinemaApiService {
    private readonly http = inject(HttpClient);
    private readonly baseUri = environment.smarthard.apiURI;

    submitReport(params: SubmitReportParams): Observable<{ ok: boolean }> {
        return this.http
            .post(`${this.baseUri}/api/reports`, params)
            .pipe(
                map(() => ({ ok: true as const })),
                catchError(() => of({ ok: false as const })),
            );
    }

    logWatch(animeId: number, episode: number | null, provider: string | null): Observable<void> {
        return this.http
            .post<void>(`${this.baseUri}/api/watch-history`, { anime_id: animeId, episode, provider })
            .pipe(catchError(() => of(void 0)));
    }

    getWatchHistory(): Observable<WatchHistoryStats | { ok: false; reason?: string }> {
        return this.http
            .get<WatchHistoryStats | { ok: false; reason?: string }>(`${this.baseUri}/api/watch-history`)
            .pipe(catchError(() => of({ ok: false as const })));
    }

    setWatchCollection(allow: boolean): Observable<void> {
        return this.http
            .post<void>(`${this.baseUri}/api/watch-settings`, { allow })
            .pipe(catchError(() => of(void 0)));
    }

    resolveRutubeStream(embedUrl: string): Observable<{ ok: true; streamUrl: string } | { ok: false }> {
        const params = new URLSearchParams({ url: embedUrl });

        return this.http
            .get<{ ok: true; streamUrl: string }>(`${this.baseUri}/v1/rutube-stream?${params}`)
            .pipe(catchError(() => of({ ok: false as const })));
    }

    resolveKodikStream(iframeUrl: string): Observable<KodikStreamResponse | { ok: false }> {
        const params = new URLSearchParams({ url: iframeUrl });

        return this.http
            .get<KodikStreamResponse>(`${this.baseUri}/v1/kodik-stream?${params}`)
            .pipe(catchError(() => of({ ok: false as const })));
    }

    resolveKodikToStream(iframeUrl: string): Observable<ResolvedStream> {
        return this.resolveKodikStream(iframeUrl).pipe(
            map((resp) => resp.ok
                ? { url: resp.streamUrl, urlType: 'video' as const, streams: resp.streams }
                : { url: iframeUrl, urlType: 'iframe' as const },
            ),
        );
    }

    resolveRutubeToStream(embedUrl: string): Observable<ResolvedStream> {
        return this.resolveRutubeStream(embedUrl).pipe(
            map((resp) => resp.ok
                ? { url: resp.streamUrl, urlType: 'video' as const }
                : { url: embedUrl, urlType: 'iframe' as const },
            ),
        );
    }
}
