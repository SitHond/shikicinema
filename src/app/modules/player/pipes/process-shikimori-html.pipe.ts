import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Pipe, PipeTransform, inject } from '@angular/core';
import { Store } from '@ngrx/store';

import { Comment } from '@app/shared/types/shikimori/comment';
import { selectShikimoriDomain } from '@app/store/shikimori/selectors';


@Pipe({
    name: 'processShikimoriHtml',
    standalone: true,
    pure: true,
})
export class ProcessShikimoriHtmlPipe implements PipeTransform {
    private readonly _sanitizer = inject(DomSanitizer);
    private readonly store = inject(Store);

    private readonly SHIKIMORI_URL = this.store.selectSignal(selectShikimoriDomain);

    private readonly htmlReplacementMap: Array<[RegExp, string]> = [
        // спойлеры, картинки и т.п. имеют мусорные классы - объединяем в единый интерактивный
        [/(unprocessed)|(to-process)|(check-width)/ig, 'shc-interactive'],
    ];

    // убираем мусор из html комментария
    private _cleanUp(comment: Comment): string {
        let parsed = `${comment?.html_body}`;

        for (const [regex, replacement] of this.htmlReplacementMap) {
            parsed = parsed.replace(regex, replacement);
        }

        return parsed;
    }

    // то, что не смогли почистить меняем вручную на нужное
    private _preprocess(html: string): string {
        const { body: processedHtml } = new DOMParser().parseFromString(html, 'text/html');

        // всем img с относительным src добавляем домен шикимори
        for (const img of Array.from(processedHtml.querySelectorAll('img'))) {
            const src = img.getAttribute('src');

            if (src && !src.startsWith('http') && !src.startsWith('data:')) {
                const normalized = src.startsWith('/') ? src : `/${src}`;
                img.setAttribute('src', `${this.SHIKIMORI_URL()}${normalized}`);
            }
        }

        // вставки с видео заменяем с картинок на iframe'ы
        for (const video of Array.from(processedHtml.querySelectorAll('.video-link'))) {
            const parent = video.parentElement;
            let src: URL;

            try {
                src = new URL(video.getAttribute('data-href') ?? '');
            } catch {
                video.remove();
                continue;
            }

            if (!['https:', 'http:'].includes(src.protocol)) {
                video.remove();
                continue;
            }

            src.searchParams.delete('autoplay');
            src.searchParams.delete('autostart');

            parent.insertAdjacentHTML(
                'beforeend',
                `<iframe class="shc-iframe" src="${src.toString()}" allowfullscreen></iframe>`,
            );
            video.remove();
        }

        // Strip all inline event handlers from every element
        for (const el of Array.from(processedHtml.querySelectorAll('*'))) {
            for (const attr of Array.from(el.attributes)) {
                if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
            }
        }

        // Strip javascript: hrefs
        for (const a of Array.from(processedHtml.querySelectorAll('a[href]'))) {
            const href = a.getAttribute('href') ?? '';
            if (/^javascript:/i.test(href)) a.removeAttribute('href');
        }

        return processedHtml.innerHTML;
    }

    transform(comment: Comment): SafeHtml {
        const parsed = this._cleanUp(comment);
        const processed = this._preprocess(parsed);

        return this._sanitizer.bypassSecurityTrustHtml(processed);
    }
}
