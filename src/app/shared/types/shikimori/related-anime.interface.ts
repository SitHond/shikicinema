import { AnimeBriefInfoInterface } from '@app/shared/types/shikimori/anime-brief-info.interface';

export interface RelatedAnimeInterface {
    relation: string;
    relation_text: string;
    anime: AnimeBriefInfoInterface | null;
    manga: null;
}
