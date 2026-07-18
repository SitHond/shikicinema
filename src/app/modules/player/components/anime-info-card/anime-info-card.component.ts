import {
    ChangeDetectionStrategy,
    Component,
    ViewEncapsulation,
    computed,
    input,
} from '@angular/core';
import { DatePipe, DecimalPipe, UpperCasePipe } from '@angular/common';
import { IonSkeletonText } from '@ionic/angular/standalone';
import { TranslocoPipe } from '@jsverse/transloco';

import { AnimeBriefInfoInterface } from '@app/shared/types/shikimori/anime-brief-info.interface';

@Component({
    selector: 'app-anime-info-card',
    templateUrl: './anime-info-card.component.html',
    styleUrl: './anime-info-card.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    imports: [DatePipe, DecimalPipe, UpperCasePipe, TranslocoPipe, IonSkeletonText],
})
export class AnimeInfoCardComponent {
    readonly anime = input<AnimeBriefInfoInterface | null>(null);
    readonly shikimoriDomain = input<string>('https://shikimori.one');
    readonly isLoading = input(false);

    readonly posterUrl = computed(() => {
        const anime = this.anime();
        if (!anime?.image?.preview) return null;
        return `${this.shikimoriDomain()}${anime.image.preview}`;
    });

    readonly score = computed(() => {
        const s = parseFloat(this.anime()?.score);
        return isNaN(s) ? null : s;
    });

    readonly scoreColor = computed(() => {
        const s = this.score();
        if (s === null) return 'medium';
        if (s >= 7.5) return 'success';
        if (s >= 5) return 'warning';
        return 'danger';
    });

    readonly episodesLabel = computed(() => {
        const anime = this.anime();
        if (!anime) return null;
        const aired = anime.episodes_aired;
        const total = anime.episodes;
        if (total) return aired && aired < total ? `${aired} / ${total}` : `${total}`;
        return aired ? `${aired}` : null;
    });
}
