export type MangaSource = 'mangalib' | 'mangadex' | 'remanga' | 'readmanga';

export interface SourceTitle {
    source: MangaSource;
    id: string;
    slug: string;
    name: string;
    russianName?: string;
    coverUrl?: string;
    chaptersCount?: number;
    rating?: string;
    kind?: string;
}

export interface SourceChapter {
    id: string;
    index: number;
    volume: string;
    number: string;
    name?: string;
}

export interface ReaderPage {
    id: string;
    url: string;
}
