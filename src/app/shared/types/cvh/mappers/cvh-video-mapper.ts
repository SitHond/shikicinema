import { CVH_UPLOADER } from '@app/shared/types/cvh/cvh-uploader.symbol';
import { CvhPlaylistResponse } from '@app/shared/types/cvh/cvh-playlist-response.interface';
import { VideoKindEnum } from '@app/modules/player/types/video-kind.enum';
import { VideoMapperFn } from '@app/shared/types/video-mapper.type';
import { VideoQualityEnum } from '@app/modules/player/types/video-quality.enum';

export const cvhVideoMapper: VideoMapperFn<CvhPlaylistResponse> = ({ items }) => items
    .filter((item) => item.season === 1)
    .map((item) => ({
        episode: item.episode,
        url: `https://cdnvideohub.com/video/${item.vkId}`,
        urlType: 'video' as const,
        uploader: CVH_UPLOADER,
        kind: VideoKindEnum.DUBBING,
        author: item.voiceStudio || null,
        quality: VideoQualityEnum.WEB,
        language: 'ru',
    }));
