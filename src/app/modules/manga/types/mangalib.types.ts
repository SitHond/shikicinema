export interface MangaLibCover {
    default?: string;
    thumbnail?: string;
    md?: string;
}

export interface MangaLibTitle {
    id: number;
    name: string;
    rus_name: string;
    eng_name?: string;
    slug: string;
    slug_url: string;
    cover: MangaLibCover;
    chapters_count?: number;
    rating?: { average: string };
    status?: { label: string };
    type?: { label: string };
}

export interface MangaLibChapterBranch {
    id: number;
    branch_id: number | null;
    created_at: string;
}

export interface MangaLibChapter {
    id: number;
    volume: string;
    number: string;
    name?: string | null;
    index: number;
    branches: MangaLibChapterBranch[];
}

export interface MangaLibPage {
    slug: number;
    image: string;
    url: string;
    width?: number;
    height?: number;
}

export interface MangaLibSearchResponse {
    data: MangaLibTitle[];
}

export interface MangaLibChaptersResponse {
    data: Omit<MangaLibChapter, 'index'>[];
}

export interface MangaLibChapterResponse {
    data: {
        pages: MangaLibPage[];
    };
}
