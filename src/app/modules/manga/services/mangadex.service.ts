import { EMPTY, Observable, catchError, expand, map, of, reduce } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import { ReaderPage, SourceChapter, SourceTitle } from '@app/modules/manga/types/manga-source.types';

const API = 'https://api.mangadex.org';
const COVERS = 'https://uploads.mangadex.org/covers';

interface DexManga {
    id: string;
    attributes: {
        title: Record<string, string>;
        altTitles: Record<string, string>[];
        status: string;
        lastChapter: string | null;
    };
    relationships: { type: string; id: string; attributes?: { fileName?: string } }[];
}

interface DexChapter {
    id: string;
    attributes: {
        volume: string | null;
        chapter: string | null;
        title: string | null;
        translatedLanguage: string;
        pages: number;
    };
}

@Injectable({ providedIn: 'root' })
export class MangaDexService {
    private readonly http = inject(HttpClient);

    search(query: string): Observable<SourceTitle[]> {
        return this.http.get<{ data: DexManga[] }>(`${API}/manga`, {
            params: {
                'title': query,
                'availableTranslatedLanguage[]': 'ru',
                'includes[]': 'cover_art',
                'limit': '20',
                'order[relevance]': 'desc',
            },
        }).pipe(
            map((res) => (res.data ?? []).map((m) => this.toSourceTitle(m))),
            catchError(() => of([])),
        );
    }

    getChapters(mangaId: string): Observable<SourceChapter[]> {
        return this.fetchAllChapters(mangaId);
    }

    getPages(chapterId: string): Observable<ReaderPage[]> {
        return this.http.get<{
            baseUrl: string;
            chapter: { hash: string; data: string[] };
        }>(`${API}/at-home/server/${chapterId}`).pipe(
            map((res) =>
                res.chapter.data.map((file, i) => ({
                    id: `p${i}`,
                    url: `${res.baseUrl}/data/${res.chapter.hash}/${file}`,
                })),
            ),
        );
    }

    private fetchAllChapters(mangaId: string): Observable<SourceChapter[]> {
        const fetchPage = (offset: number) =>
            this.http.get<{ data: DexChapter[]; total: number; limit: number }>(`${API}/manga/${mangaId}/feed`, {
                params: {
                    'translatedLanguage[]': 'ru',
                    'order[volume]': 'asc',
                    'order[chapter]': 'asc',
                    'limit': '500',
                    'offset': String(offset),
                },
            }).pipe(map((res) => ({ ...res, offset })));

        return fetchPage(0).pipe(
            expand((res) => {
                const next = res.offset + res.limit;
                return next < res.total ? fetchPage(next) : EMPTY;
            }),
            reduce((all: DexChapter[], res) => all.concat(res.data ?? []), []),
            map((chapters) =>
                chapters
                    .filter((ch) => ch.attributes.chapter)
                    .map((ch, i) => ({
                        id: ch.id,
                        index: i + 1,
                        volume: ch.attributes.volume ?? '1',
                        number: ch.attributes.chapter!,
                        name: ch.attributes.title ?? undefined,
                    })),
            ),
        );
    }

    private toSourceTitle(m: DexManga): SourceTitle {
        const titles = m.attributes.title;
        const name = titles['en'] ?? titles['ja-ro'] ?? Object.values(titles)[0] ?? '';
        const altRu = m.attributes.altTitles.find((t) => t['ru'])?.['ru'];

        const coverRel = m.relationships.find((r) => r.type === 'cover_art');
        const coverFile = coverRel?.attributes?.fileName;
        const coverUrl = coverFile ? `${COVERS}/${m.id}/${coverFile}.256.jpg` : undefined;

        return {
            source: 'mangadex',
            id: m.id,
            slug: m.id,
            name,
            russianName: altRu,
            coverUrl,
            chaptersCount: m.attributes.lastChapter ? parseInt(m.attributes.lastChapter) : undefined,
            kind: m.attributes.status,
        };
    }
}
