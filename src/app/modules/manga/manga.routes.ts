import { Routes } from '@angular/router';

import { MangaChapterPage } from '@app/modules/manga/manga-chapter.page';
import { MangaDetailPage } from '@app/modules/manga/manga-detail.page';
import { MangaPage } from '@app/modules/manga/manga.page';

export const MANGA_ROUTES: Routes = [
    {
        path: '',
        component: MangaPage,
    },
    {
        path: ':mangaId',
        component: MangaDetailPage,
    },
    {
        path: ':mangaId/chapter/:chapterId',
        component: MangaChapterPage,
    },
];
