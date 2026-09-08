import { Pipe, PipeTransform } from '@angular/core';

import { VideoInfoInterface } from '@app/modules/player/types';
import { cleanAuthorName } from '@app/shared/utils/clean-author-name.function';
import { normalizeAuthorKey } from '@app/shared/utils/normalize-author-key.function';

@Pipe({
    name: 'filterByAuthor',
    pure: true,
    standalone: true,
})
export class FilterByAuthorPipe implements PipeTransform {
    transform(videos: VideoInfoInterface[], targetAuthor: string, defaultAuthor: string): VideoInfoInterface[] {
        if (!targetAuthor || targetAuthor === defaultAuthor) {
            return videos?.filter(({ author }) => author === defaultAuthor || !author);
        }
        const targetKey = normalizeAuthorKey(targetAuthor);
        return videos?.filter(({ author }) =>
            normalizeAuthorKey(cleanAuthorName(author ?? '', '')) === targetKey,
        );
    }
}
