import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, switchMap, take } from 'rxjs';
import { Store } from '@ngrx/store';

import { ResourceIdType } from '@app/shared/types';
import { environment } from '@app-env/environment';
import { selectIsAuthenticated } from '@app/store/auth/selectors/auth.selectors';
import { selectShikicinemaUploadToken } from '@app/store/shikicinema/selectors/shikicinema.selectors';

export interface AuthorRating {
    author: string;
    up: number;
    down: number;
    user_vote: 1 | -1 | null;
}

@Injectable({ providedIn: 'root' })
export class DubbingRatingService {
    private readonly _http = inject(HttpClient);
    private readonly _store = inject(Store);

    private readonly _uploadToken$ = this._store.select(selectShikicinemaUploadToken);
    readonly isAuthenticated$ = this._store.select(selectIsAuthenticated);

    private readonly _baseUri = environment.smarthard.apiURI;

    getRatings(animeId: ResourceIdType): Observable<AuthorRating[]> {
        return this._uploadToken$.pipe(
            take(1),
            switchMap((uploadToken) => {
                const headers = uploadToken?.access_token
                    ? { Authorization: `Bearer ${uploadToken.access_token}` }
                    : {};
                return this._http.get<AuthorRating[]>(`${this._baseUri}/api/ratings`, {
                    params: { anime_id: String(animeId) },
                    headers,
                });
            }),
            catchError(() => of([])),
        );
    }

    vote(animeId: ResourceIdType, author: string, vote: 1 | -1): Observable<boolean> {
        // Authorization header is added automatically by shikicinemaApiInterceptor for POST
        return this._http.post<{ ok: boolean }>(`${this._baseUri}/api/ratings`, {
            anime_id: Number(animeId),
            author,
            vote,
        }).pipe(
            map((r) => r.ok),
            catchError(() => of(false)),
        );
    }

    removeVote(animeId: ResourceIdType, author: string): Observable<boolean> {
        return this._uploadToken$.pipe(
            take(1),
            switchMap((uploadToken) => {
                if (!uploadToken?.access_token) return of(false);
                return this._http.delete<{ ok: boolean }>(`${this._baseUri}/api/ratings`, {
                    params: { anime_id: String(animeId), author },
                    headers: { Authorization: `Bearer ${uploadToken.access_token}` },
                }).pipe(
                    map((r) => r.ok),
                    catchError(() => of(false)),
                );
            }),
        );
    }
}
