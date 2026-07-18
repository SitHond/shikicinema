import {
    ChangeDetectionStrategy,
    Component,
    computed,
    inject,
    input,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { compareAsc } from 'date-fns';

import { RelatedAnimeInterface } from '@app/shared/types/shikimori/related-anime.interface';

const EXCLUDED_RELATIONS = new Set(['Character']);

@Component({
    selector: 'app-franchise-panel',
    templateUrl: './franchise-panel.component.html',
    styleUrls: ['./franchise-panel.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        RouterLink,
    ],
    host: {
        'class': 'franchise-panel',
    },
})
export class FranchisePanelComponent {
    private readonly router = inject(Router);

    readonly related = input.required<RelatedAnimeInterface[]>();

    readonly sortedItems = computed(() =>
        this.related()
            .filter((item) => item.anime && !EXCLUDED_RELATIONS.has(item.relation))
            .sort((a, b) => {
                if (a.relation === 'Sequel') return -1;
                if (b.relation === 'Sequel') return 1;
                if (a.relation === 'Prequel') return 1;
                if (b.relation === 'Prequel') return -1;

                return compareAsc(a.anime?.aired_on, b.anime?.aired_on);
            }),
    );

    onNavigate(link: string): void {
        this.router.navigateByUrl(link);
    }
}
