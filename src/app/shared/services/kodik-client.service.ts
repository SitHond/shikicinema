import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { KodikAnimeInfo, KodikApiResponse } from '@app/shared/types/kodik';
import { environment } from '@app-env/environment';

const EMPTY_KODIK_RESPONSE: KodikApiResponse<KodikAnimeInfo> = {
    time: '0ms',
    total: 0,
    results: [],
};

@Injectable({
    providedIn: 'root',
})
export class KodikClient {
    private http = inject(HttpClient);

    private readonly apiURIs = [environment.smarthard.apiURI];

    findAnimes(animeId: string): Observable<KodikApiResponse<KodikAnimeInfo>> {
        const params = new HttpParams()
            .set('shikimori_id', animeId)
            .set('with_episodes', true);

        return forkJoin(
            this.apiURIs.map((apiURI) => this.http
                .get<KodikApiResponse<KodikAnimeInfo>>(`${apiURI}/api/kodik/search`, { params })
                .pipe(catchError(() => of(EMPTY_KODIK_RESPONSE)))),
        ).pipe(
            map((responses) => responses.find((response) => response.total > 0) || EMPTY_KODIK_RESPONSE),
        );
    }
}
