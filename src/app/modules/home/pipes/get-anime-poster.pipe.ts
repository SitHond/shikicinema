import { DEFAULT_SHIKIMORI_DOMAIN_TOKEN } from '@app/core/providers/shikimori-domain';
import { Observable, combineLatest, map } from 'rxjs';
import {
    Pipe,
    PipeTransform,
    inject,
} from '@angular/core';
import { ResourceIdType } from '@app/shared/types';
import { Store } from '@ngrx/store';
import { selectRates } from '@app/modules/home/store/anime-rates';
import { selectRecentAnimes } from '@app/modules/home/store/recent-animes';
import { selectShikimoriDomain } from '@app/store/shikimori/selectors';

@Pipe({
    name: 'getAnimePoster',
    standalone: true,
    pure: true,
})
export class GetAnimePosterPipe implements PipeTransform {
    private readonly store = inject(Store);
    private readonly defaultShikimoriDomain = inject(DEFAULT_SHIKIMORI_DOMAIN_TOKEN);

    private readonly recent$ = this.store.select(selectRecentAnimes);
    private readonly rates$ = this.store.select(selectRates);
    private readonly domain$ = this.store.select(selectShikimoriDomain);

    private readonly allRates$ = combineLatest([this.recent$, this.rates$, this.domain$])
        .pipe(map(([recent, rates, domain]) => ({
            rates: [
                ...recent || [],
                ...rates || [],
            ],
            domain,
        })));

    transform(animeId: ResourceIdType, isHiResPref = true): Observable<string> {
        return this.allRates$.pipe(
            map(({ rates, domain }) => {
                const rate = rates?.find(({ anime }) => anime?.id === animeId);
                const image = isHiResPref
                    ? rate?.anime?.image?.original || rate?.anime?.image?.preview
                    : rate?.anime?.image?.preview || rate?.anime?.image?.x96;

                return this.toAbsoluteUrl(image, domain || this.defaultShikimoriDomain);
            }),
        );
    }

    private toAbsoluteUrl(imageUrl: string | undefined, domain: string): string {
        if (!imageUrl) {
            return `${domain}/assets/globals/missing_original.jpg`;
        }

        if (/^https?:\/\//.test(imageUrl)) {
            return imageUrl;
        }

        return `${domain}${imageUrl}`;
    }
}
