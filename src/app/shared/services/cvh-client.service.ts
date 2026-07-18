import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { CvhPlaylistResponse, CvhSources, CvhVideoResponse } from '@app/shared/types/cvh';

const CVH_API = 'https://plapi.cdnvideohub.com/api/v1/player/sv';
const EMPTY_PLAYLIST: CvhPlaylistResponse = { items: [] };

@Injectable({
    providedIn: 'root',
})
export class CvhClient {
    private http = inject(HttpClient);

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
        return this.http
            .get<CvhVideoResponse>(`${CVH_API}/video/${vkId}`)
            .pipe(
                map(({ sources }) => this.getBestUrl(sources)),
                catchError(() => of(null)),
            );
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
