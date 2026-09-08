import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, tap } from 'rxjs/operators';

import { CvhPlaylistResponse, CvhSources, CvhVideoResponse } from '@app/shared/types/cvh';

const CVH_API = 'https://plapi.cdnvideohub.com/api/v1/player/sv';
const EMPTY_PLAYLIST: CvhPlaylistResponse = { items: [] };

@Injectable({
    providedIn: 'root',
})
export class CvhClient {
    private http = inject(HttpClient);
    private readonly urlCache = new Map<string, string | null>();
    private readonly pendingRequests = new Map<string, Observable<string | null>>();

    findAnimes(shikimoriId: string): Observable<CvhPlaylistResponse> {
        const params = new HttpParams()
            .set('id', shikimoriId)
            .set('pub', '747')
            .set('aggr', 'mali');

        return this.http
            .get<CvhPlaylistResponse>(`${CVH_API}/playlist`, { params })
            .pipe(catchError(() => of(EMPTY_PLAYLIST)));
    }

    resolveVideoUrl(vkId: string): Observable<string | null> {
        if (this.urlCache.has(vkId)) {
            return of(this.urlCache.get(vkId)!);
        }
        if (this.pendingRequests.has(vkId)) {
            return this.pendingRequests.get(vkId)!;
        }
        const req$ = this.http
            .get<CvhVideoResponse>(`${CVH_API}/video/${vkId}`)
            .pipe(
                map(({ sources }) => this.getBestUrl(sources)),
                catchError(() => of(null as string | null)),
                tap((url) => {
                    this.urlCache.set(vkId, url);
                    this.pendingRequests.delete(vkId);
                }),
                shareReplay(1),
            );
        this.pendingRequests.set(vkId, req$);
        return req$;
    }

    private getBestUrl(sources: CvhSources): string | null {
        return sources.mpegFullHdUrl ||
            sources.mpegHighUrl ||
            sources.mpeg4kUrl ||
            sources.mpegQhdUrl ||
            sources.mpeg2kUrl ||
            sources.mpegMediumUrl ||
            sources.mpegLowUrl ||
            sources.mpegLowestUrl ||
            sources.mpegTinyUrl ||
            sources.hlsUrl ||
            sources.dashUrl ||
            null;
    }
}
