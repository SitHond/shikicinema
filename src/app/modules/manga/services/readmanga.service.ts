import { Injectable } from '@angular/core';
import { Observable, catchError, from, of } from 'rxjs';

import { ReaderPage, SourceChapter, SourceTitle } from '@app/modules/manga/types/manga-source.types';

const BASE = 'https://readmanga.live';

interface SuggestionItem {
    id?: string;
    name?: string;
    url?: string;
    imageUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class ReadMangaService {
    search(query: string): Observable<SourceTitle[]> {
        const suggestionUrl = `${BASE}/search/suggestion?query=${encodeURIComponent(query)}`;
        return from(
            chrome.runtime.sendMessage({ type: 'FETCH_JSON', url: suggestionUrl })
                .then((res: { ok: boolean; json?: SuggestionItem[] }) => {
                    if (!res?.ok || !Array.isArray(res.json)) return [];
                    return res.json.map((item): SourceTitle => ({
                        source: 'readmanga',
                        id: item.url ?? item.id ?? '',
                        slug: (item.url ?? '').replace(/^\//, ''),
                        name: item.name ?? '',
                        coverUrl: item.imageUrl,
                    }));
                })
                .catch(() => [] as SourceTitle[]),
        ).pipe(catchError(() => of([])));
    }

    getChapters(slug: string): Observable<SourceChapter[]> {
        return from(
            chrome.runtime.sendMessage({ type: 'FETCH_READMANGA_CHAPTERS', slug })
                .then((res: { ok: boolean; chapters?: SourceChapter[] }) => res?.ok ? res.chapters ?? [] : [])
                .catch(() => [] as SourceChapter[]),
        ).pipe(catchError(() => of([])));
    }

    getPages(slug: string, volume: string, number: string): Observable<ReaderPage[]> {
        const url = `${BASE}/${slug}/vol${volume}/ch${number}?mtr=1`;
        return from(
            chrome.runtime.sendMessage({ type: 'FETCH_READMANGA_PAGES', url })
                .then((res: { ok: boolean; urls?: string[] }) => {
                    if (!res?.ok || !res.urls) return [];
                    return res.urls.map((u, i) => ({ id: `p${i}`, url: u }));
                })
                .catch(() => [] as ReaderPage[]),
        ).pipe(catchError(() => of([])));
    }
}
