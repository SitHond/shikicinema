import { ShikivideosKindType } from '@app/shared/types/shikicinema/v1/shikivideos-kind.type';

export type VideoProviderType = 'shikirip' | 'smarthard' | 'kodik' | 'cvh';

export interface ShikivideosInterface {
    id: number;
    url: string;
    url_type?: 'iframe' | 'video';
    anime_id: number;
    episode: number;
    kind: ShikivideosKindType;
    language: string;
    quality: string;
    author: string;
    uploader: string;
    watches_count: number;
    anime_english?: string;
    anime_russian?: string;
    provider?: VideoProviderType;
}
