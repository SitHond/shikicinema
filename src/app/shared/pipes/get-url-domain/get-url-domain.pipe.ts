import { Pipe, PipeTransform } from '@angular/core';

import { getDomain } from '@app/shared/utils/get-domain.function';

const SHIKIPLAYER_RE = /kodik(?:player)?\.(?:info|biz|cc|com)|rutube\.ru|cdnvideohub\.com/;

@Pipe({
    name: 'getUrlDomain',
    pure: true,
    standalone: true,
})
export class GetUrlDomainPipe implements PipeTransform {
    transform(url: string | URL): string {
        const str = url instanceof URL ? url.href : url;
        if (SHIKIPLAYER_RE.test(str)) return 'ShikiPlayer';
        return getDomain(url);
    }
}
