import {
    ChangeDetectionStrategy,
    Component,
    ViewEncapsulation,
    effect,
    inject,
    signal,
} from '@angular/core';
import { DEFAULT_SHIKIMORI_DOMAIN } from '@app/core/providers/shikimori-domain/default-shikimori-domain.token';
import { DatePipe, UpperCasePipe } from '@angular/common';
import { ImageCardComponent } from '@app/shared/components/image-card/image-card.component';
import {
    IonButton,
    IonContent,
    IonIcon,
    IonText,
} from '@ionic/angular/standalone';
import { RepeatPipe } from 'ngxtension/repeat-pipe';
import { RouterLink } from '@angular/router';
import { ShikimoriClient } from '@app/shared/services';
import { SkeletonBlockComponent } from '@app/shared/components/skeleton-block/skeleton-block.component';
import { Store } from '@ngrx/store';
import { Title } from '@angular/platform-browser';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { UserMangaRate, UserRateStatusType } from '@app/shared/types/shikimori';
import { catchError, finalize, of } from 'rxjs';
import { selectShikimoriCurrentUserId } from '@app/store/shikimori/selectors/shikimori.selectors';
import { selectShikimoriDomain } from '@app/store/shikimori/selectors';
import { toBase64 } from '@app/shared/utils/base64-utils';
import { trackById } from '@app/shared/utils/common-ngfor-tracking';

@Component({
    selector: 'app-manga-page',
    templateUrl: './manga.page.html',
    styleUrl: './manga.page.scss',
    imports: [
        DatePipe,
        UpperCasePipe,
        IonButton,
        IonContent,
        IonIcon,
        IonText,
        RouterLink,
        TranslocoPipe,
        RepeatPipe,
        ImageCardComponent,
        SkeletonBlockComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    host: {
        class: 'manga-page',
    },
})
export class MangaPage {
    private readonly store = inject(Store);
    private readonly shikimori = inject(ShikimoriClient);
    private readonly title = inject(Title);
    private readonly transloco = inject(TranslocoService);

    readonly trackById = trackById;
    readonly currentUserId = this.store.selectSignal(selectShikimoriCurrentUserId);
    readonly shikimoriDomain = this.store.selectSignal(selectShikimoriDomain);

    readonly rates = signal<UserMangaRate[]>([]);
    readonly isLoading = signal(true);
    readonly hasError = signal(false);
    readonly hiddenGridMap = new Map<UserRateStatusType, boolean>();

    readonly statuses: UserRateStatusType[] = [
        'watching',
        'planned',
        'completed',
        'on_hold',
        'dropped',
        'rewatching',
    ];

    readonly loadMangaRatesEffect = effect(() => {
        const userId = this.currentUserId();

        if (!userId) {
            this.rates.set([]);
            this.isLoading.set(false);
            return;
        }

        this.isLoading.set(true);
        this.hasError.set(false);

        this.shikimori.getUserMangaRates(userId, { limit: 5000 }).pipe(
            catchError(() => {
                this.hasError.set(true);
                return of([] as UserMangaRate[]);
            }),
            finalize(() => this.isLoading.set(false)),
        ).subscribe((rates) => this.rates.set(rates));
    });

    readonly setTitleEffect = effect(() => {
        this.title.setTitle(this.transloco.translate('MANGA_MODULE.MANGA_PAGE.PAGE_TITLE'));
    });

    ratesByStatus(status: UserRateStatusType): UserMangaRate[] {
        return this.rates()
            .filter((rate) => rate.status === status)
            .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
    }

    isSectionHidden(status: UserRateStatusType): boolean {
        return !this.isLoading() && !this.ratesByStatus(status).length;
    }

    toggleHiddenGridStatus(status: UserRateStatusType): void {
        this.hiddenGridMap.set(status, !this.hiddenGridMap.get(status));
    }

    getHiddenGridStatus(status: UserRateStatusType): boolean {
        return this.hiddenGridMap.get(status) || false;
    }

    mangaName(rate: UserMangaRate): string {
        return rate.manga.russian || rate.manga.name;
    }

    mangaImage(rate: UserMangaRate): string {
        return this.toAbsoluteShikimoriUrl(rate.manga.image?.preview || rate.manga.image?.original) || '';
    }

    mangaExternalLink(rate: UserMangaRate): string {
        const url = this.toAbsoluteShikimoriUrl(rate.manga.url) ||
            this.shikimoriDomain() ||
            DEFAULT_SHIKIMORI_DOMAIN;

        return toBase64(url);
    }

    remangaSearchLink(rate: UserMangaRate): string {
        const query = encodeURIComponent(this.mangaName(rate));

        return toBase64(`https://remanga.org/search?query=${query}`);
    }

    private toAbsoluteShikimoriUrl(url?: string): string | undefined {
        if (!url) {
            return undefined;
        }

        if (/^https?:\/\//.test(url)) {
            return url;
        }

        const domain = this.shikimoriDomain() || DEFAULT_SHIKIMORI_DOMAIN;

        return `${domain}${url.startsWith('/') ? '' : '/'}${url}`;
    }
}
