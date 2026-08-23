import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { map } from 'rxjs/operators';

import {
    MangaLibChapter,
    MangaLibChapterResponse,
    MangaLibChaptersResponse,
    MangaLibPage,
    MangaLibSearchResponse,
    MangaLibTitle,
} from '@app/modules/manga/types/mangalib.types';

const API = 'https://api.cdnlibs.org/api';
const IMG_BASE = 'https://img3.cdnlibs.org';

@Injectable({ providedIn: 'root' })
export class MangaLibService {
    private readonly http = inject(HttpClient);

    search(query: string): Observable<MangaLibTitle[]> {
        return this.http
            .get<MangaLibSearchResponse>(`${API}/manga`, {
                params: { 'search': query, 'site_id[]': '1', 'limit': '60' },
            })
            .pipe(map((res) => res.data ?? []));
    }

    getChapters(slugUrl: string): Observable<MangaLibChapter[]> {
        return this.http
            .get<MangaLibChaptersResponse>(`${API}/manga/${slugUrl}/chapters`)
            .pipe(
                map((res) =>
                    (res.data ?? []).map((ch, i) => ({ ...ch, index: i + 1 })),
                ),
            );
    }

    getMangaBySlug(slugUrl: string): Observable<MangaLibTitle | null> {
        return this.http
            .get<{ data: MangaLibTitle }>(`${API}/manga/${slugUrl}`)
            .pipe(
                map((res) => res.data ?? null),
                catchError(() => of(null)),
            );
    }

    getChapterPages(slugUrl: string, volume: string, number: string): Observable<MangaLibPage[]> {
        return this.http
            .get<MangaLibChapterResponse>(`${API}/manga/${slugUrl}/chapter`, {
                params: { volume, number },
            })
            .pipe(map((res) => res.data?.pages ?? []));
    }

    absoluteImageUrl(path: string): string {
        if (!path || /^https?:\/\//.test(path)) return path;
        // Protocol-relative paths like //manga/... — strip one leading slash
        const normalized = path.startsWith('//') ? path.slice(1) : path;
        return `${IMG_BASE}${normalized.startsWith('/') ? '' : '/'}${normalized}`;
    }
}
