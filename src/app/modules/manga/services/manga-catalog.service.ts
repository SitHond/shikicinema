import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { MangaSource } from '@app/modules/manga/types/manga-source.types';

export interface MangaCatalogEntry {
    id: number;
    source: MangaSource;
    slug: string;
    name: string;
    cover_url: string;
    added_by: string;
    shikimori_id: string;
    created_at: string;
}

export interface MangaCatalogResponse {
    items: MangaCatalogEntry[];
    total: number;
}

const API = 'https://api.sithond.com/api/manga/sources';

const SOURCE_DOMAINS: Record<string, MangaSource> = {
    'mangalib.me': 'mangalib',
    'lib.social': 'mangalib',
    'cdnlibs.org': 'mangalib',
    'readmanga.io': 'readmanga',
    'readmanga.live': 'readmanga',
    'readmanga.me': 'readmanga',
    'remanga.org': 'remanga',
};

export interface ParsedMangaUrl {
    source: MangaSource;
    slug: string;
}

export function parseMangaUrl(raw: string): ParsedMangaUrl | null {
    try {
        const u = new URL(raw.trim().replace(/^\/\//, 'https://'));
        const host = u.hostname.replace(/^www\./, '');
        const path = u.pathname;

        const source = Object.entries(SOURCE_DOMAINS).find(([d]) => host === d || host.endsWith('.' + d))?.[1];
        if (!source) return null;

        if (source === 'mangalib') {
            const m = path.match(/\/(?:[a-z]{2}\/)?manga\/([^/?#]+)/);
            return m ? { source, slug: m[1] } : null;
        }
        if (source === 'readmanga') {
            const parts = path.split('/').filter(Boolean);
            return parts[0] ? { source, slug: parts[0] } : null;
        }
        if (source === 'remanga') {
            const m = path.match(/\/manga\/([^/?#]+)/);
            return m ? { source, slug: m[1] } : null;
        }
        return null;
    } catch {
        return null;
    }
}

@Injectable({ providedIn: 'root' })
export class MangaCatalogService {
    private readonly http = inject(HttpClient);

    list(
        params: { source?: MangaSource; shikimori_id?: string; limit?: number; offset?: number } = {},
    ): Observable<MangaCatalogResponse> {
        const qp: Record<string, string> = {};
        if (params.source) qp['source'] = params.source;
        if (params.shikimori_id) qp['shikimori_id'] = params.shikimori_id;
        if (params.limit) qp['limit'] = String(params.limit);
        if (params.offset) qp['offset'] = String(params.offset);
        return this.http.get<MangaCatalogResponse>(API, { params: qp });
    }

    add(entry: {
        source: MangaSource; slug: string; name: string;
        cover_url: string; added_by: string; shikimori_id?: string;
    }): Observable<MangaCatalogEntry> {
        return this.http.post<MangaCatalogEntry>(API, entry);
    }
}
