import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { ResourceIdType } from '@app/shared/types/resource-id.type';
import { ShikivideosInterface, UploadToken } from '@app/shared/types/shikicinema/v1';
import { VideoInfoInterface } from '@app/modules/player/types';
import { environment } from '@app-env/environment';
import { mapVideoKindToShikicinema } from '@app/shared/utils/map-video-kind-to-shikicinema-v1.function';

@Injectable({
    providedIn: 'root',
})
export class ShikicinemaV1Client {
    private http = inject(HttpClient);

    private readonly baseUri = environment.smarthard.apiURI;
    private readonly apiURIs = environment.smarthard.apiURIs?.length
        ? environment.smarthard.apiURIs
        : [environment.smarthard.apiURI];
    private readonly clientId = environment.smarthard.authClientId;
    private readonly clientSecret = environment.smarthard.authClientSecret;

    findAnimes(animeId: string): Observable<ShikivideosInterface[]> {
        const params = new HttpParams()
            .set('limit', 'all');

        return forkJoin(
            this.apiURIs.map((apiURI) => this.http
                .get<ShikivideosInterface[]>(`${apiURI}/api/shikivideos/${animeId}`, { params })
                .pipe(catchError(() => of([] as ShikivideosInterface[])))),
        ).pipe(
            map((sources) => this.uniqueVideos(sources.flat())),
        );
    }

    getUploadToken(shikimoriToken: string) {
        const url = `${this.baseUri}/oauth/token`;
        const params = new HttpParams()
            .set('grant_type', 'shikimori_token')
            .set('client_id', this.clientId)
            .set('client_secret', this.clientSecret)
            .set('scopes', 'database:shikivideos_create');
        const body = { shikimori_token: shikimoriToken };

        return this.http.put<UploadToken>(url, body, { params });
    }

    uploadVideo(animeId: ResourceIdType, video: VideoInfoInterface) {
        const url = `${this.baseUri}/api/shikivideos`;

        let params = new HttpParams()
            .set('anime_id', animeId)
            .set('episode', video.episode)
            .set('kind', mapVideoKindToShikicinema(video.kind))
            .set('language', video.language)
            .set('url', video.url);

        if (video.author) {
            params = params.set('author', video.author);
        }

        if (video.quality) {
            params = params.set('quality', video.quality);
        }

        return this.http.post<ShikivideosInterface>(url, null, { params });
    }

    getContributions(uploaderId: ResourceIdType, page = 1): Observable<ShikivideosInterface[]> {
        const limit = 100;
        let params = new HttpParams()
            .set('limit', limit)
            .set('uploader', uploaderId);

        if (page > 1) {
            params = params.set('offset', (page - 1) * limit);
        }

        return forkJoin(
            this.apiURIs.map((apiURI) => this.http
                .get<ShikivideosInterface[]>(`${apiURI}/api/shikivideos/search`, { params })
                .pipe(catchError(() => of([] as ShikivideosInterface[])))),
        ).pipe(
            map((sources) => this.uniqueVideos(sources.flat())),
        );
    }

    private uniqueVideos(videos: ShikivideosInterface[]): ShikivideosInterface[] {
        const unique = new Map<string, ShikivideosInterface>();

        for (const video of videos || []) {
            const key = [
                video.url,
                video.anime_id,
                video.episode,
                video.kind,
                video.language,
                video.author,
            ].join('|');

            if (!unique.has(key)) {
                unique.set(key, video);
            }
        }

        return [...unique.values()];
    }
}
