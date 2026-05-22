import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

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

    readonly baseUri = environment.kodik.apiURI;
    readonly token = environment.kodik.authToken;

    findAnimes(animeId: string): Observable<KodikApiResponse<KodikAnimeInfo>> {
        if (!this.token) {
            return of(EMPTY_KODIK_RESPONSE);
        }

        const url = `${this.baseUri}/search`;
        const params = new HttpParams()
            .set('token', this.token)
            .set('shikimori_id', animeId)
            .set('with_episodes', true);

        return this.http.get<KodikApiResponse<KodikAnimeInfo>>(url, { params })
            .pipe(catchError(() => of(EMPTY_KODIK_RESPONSE)));
    }
}
