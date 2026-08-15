import {
    ChangeDetectionStrategy,
    Component,
    ViewEncapsulation,
    computed,
    inject,
} from '@angular/core';
import { Store } from '@ngrx/store';

import { environment } from '@app-env/environment';
import { selectShikimoriDomain } from '@app/store/shikimori/selectors';

@Component({
    selector: 'app-footer',
    standalone: true,
    templateUrl: './footer.component.html',
    styleUrl: './footer.component.scss',
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
    private readonly _store = inject(Store);
    private readonly _domain = this._store.selectSignal(selectShikimoriDomain);

    readonly version = environment.appVersion;
    readonly shikimoriClubUrl = computed(() => `${this._domain()}/clubs/50043-shikirip-cinema`);
}
