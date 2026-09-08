import { CVH_UPLOADER, DELETED_UPLOADER, KODIK_UPLOADER } from '@app/shared/types/well-known-uploader-ids';
import { ShikivideosInterface, VideoProviderType } from '@app/shared/types/shikicinema/v1/shikivideos.interface';
import { ShikivideosKindType } from '@app/shared/types/shikicinema/v1/shikivideos-kind.type';
import { UploaderIdType } from '@app/shared/types/uploader-id.type';
import { VideoInfoInterface } from '@app/modules/player/types/video-info.interface';
import { VideoKindEnum } from '@app/modules/player/types/video-kind.enum';
import { VideoMapperFn } from '@app/shared/types/video-mapper.type';
import { VideoQualityEnum } from '@app/modules/player/types';

function mapShikicinemaKindToCommon(kind: ShikivideosKindType): VideoKindEnum {
    switch (kind) {
        case 'озвучка':
            return VideoKindEnum.DUBBING;
        case 'субтитры':
            return VideoKindEnum.SUBTITLES;
        case 'оригинал':
            return VideoKindEnum.ORIGINAL;
        default:
            return VideoKindEnum.DUBBING;
    }
}

function mapUploader(uploaderId: string | null): UploaderIdType {
    if (uploaderId === null) return DELETED_UPLOADER;
    if (uploaderId === 'kodik') return KODIK_UPLOADER;
    if (uploaderId === 'cvh') return CVH_UPLOADER;
    return uploaderId as UploaderIdType;
}

// Authors that are CDN names rather than real dubbing studios — shown as "ShikiPlayer"
const CDN_PROVIDER_AUTHORS = new Set(['kodik', 'cvh', '']);
const CDN_PROVIDERS = new Set<VideoProviderType>(['kodik', 'cvh']);

function mapAuthor(author: string, provider?: VideoProviderType): string {
    if (CDN_PROVIDER_AUTHORS.has(author?.toLowerCase?.() ?? '')) {
        return CDN_PROVIDERS.has(provider) ? 'ShikiPlayer' : author || '';
    }
    return author;
}

export function shikicinemaToVideo(raw: ShikivideosInterface): VideoInfoInterface {
    const { kind, uploader, quality, url_type: urlType, provider, author, ...others } = raw;

    return {
        ...others,
        author: mapAuthor(author, provider),
        kind: mapShikicinemaKindToCommon(kind),
        urlType: urlType ?? 'iframe',
        quality: quality as VideoQualityEnum,
        uploader: mapUploader(uploader),
        provider,
    };
}

export const shikicinemaVideoMapper: VideoMapperFn<ShikivideosInterface[]> =
    (videos) => videos?.map(shikicinemaToVideo);
