import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

import { ReaderPage, SourceChapter, SourceTitle } from '@app/modules/manga/types/manga-source.types';

const API = 'https://api.remanga.org/api';
const IMG = 'https://remanga.org';

interface RemangaTitle {
    id: number;
    slug: string;
    rus_name: string;
    en_name: string;
    img: { thumbnail: string; mid?: string; high?: string };
    count_chapters: number;
    avg_rating: string;
    type: string;
}

interface RemangaChapter {
    id: number;
    index: number;
    tome: number;
    chapter: string;
    name: string | null;
}

interface RemangaPage {
    link: string;
    id: number;
}

@Injectable({ providedIn: 'root' })
export class RemangaService {
    private readonly http = inject(HttpClient);

    search(query: string): Observable<SourceTitle[]> {
        return this.http.get<{ content: RemangaTitle[] }>(`${API}/titles/`, {
            params: { query, count: '20' },
        }).pipe(
            map((res) => (res.content ?? []).map((t) => this.toSourceTitle(t))),
            catchError(() => of([])),
        );
    }

    getChapters(slug: string): Observable<SourceChapter[]> {
        return this.http.get<{ content: RemangaChapter[] }>(`${API}/titles/${slug}/chapters/`, {
            params: { page: '1', count: '5000' },
        }).pipe(
            map((res) =>
                (res.content ?? []).map((ch, i) => ({
                    id: String(ch.id),
                    index: i + 1,
                    volume: String(ch.tome ?? 1),
                    number: ch.chapter,
                    name: ch.name ?? undefined,
                })),
            ),
            catchError(() => of([])),
        );
    }

    getPages(chapterId: string): Observable<ReaderPage[]> {
        return this.http.get<{ content: { pages: RemangaPage[][] } }>(`${API}/titles/chapters/${chapterId}/`).pipe(
            map((res) => {
                const branches = res.content?.pages ?? [];
                // Pick the first branch with the most pages
                const pages = branches.reduce(
                    (best, branch) => branch.length > best.length ? branch : best,
                    [] as RemangaPage[],
                );
                return pages.map((p, i) => ({
                    id: String(p.id ?? i),
                    url: p.link.startsWith('http') ? p.link : `${IMG}${p.link}`,
                }));
            }),
        );
    }

    private toSourceTitle(t: RemangaTitle): SourceTitle {
        const cover = t.img?.high ?? t.img?.mid ?? t.img?.thumbnail ?? '';
        return {
            source: 'remanga',
            id: String(t.id),
            slug: t.slug,
            name: t.en_name || t.rus_name,
            russianName: t.rus_name,
            coverUrl: cover.startsWith('http') ? cover : `${IMG}${cover}`,
            chaptersCount: t.count_chapters,
            rating: t.avg_rating,
            kind: t.type,
        };
    }
}
