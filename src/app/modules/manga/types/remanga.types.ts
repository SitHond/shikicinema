export interface RemangaImage {
    high: string;
    mid: string;
    low: string;
}

export interface RemangaTitle {
    id: number;
    dir: string;
    rus_name: string;
    en_name: string;
    another_name: string;
    img: RemangaImage;
    count_chapters: number;
    avg_rating: string;
    status: { id: number; name: string };
    type: { id: number; name: string };
}

export interface RemangaChapter {
    id: number;
    tome: number;
    chapter: string;
    name: string;
    index: number;
    is_paid: boolean;
    pub_date: string;
    branches_count?: number;
}

export interface RemangaPage {
    id: number;
    link: string;
    height: number;
    width: number;
    count_pages: number;
}

export interface RemangaChapterContent {
    id: number;
    tome: number;
    chapter: string;
    name: string;
    pages: RemangaPage[][];
}

export interface RemangaSearchResponse {
    msg: string;
    content: RemangaTitle[];
    props: { page: number; total_pages: number };
}

export interface RemangaChaptersResponse {
    msg: string;
    content: RemangaChapter[];
    props: { count: number; page: number };
}

export interface RemangaChapterResponse {
    msg: string;
    content: RemangaChapterContent;
}
