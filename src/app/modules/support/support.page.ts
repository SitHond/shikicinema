import {
    ChangeDetectionStrategy,
    Component,
    HostBinding,
    ViewEncapsulation,
    inject,
} from '@angular/core';
import {
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonContent,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
} from '@ionic/angular/standalone';
import { Store } from '@ngrx/store';
import { Title } from '@angular/platform-browser';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { selectShikimoriDomain } from '@app/store/shikimori/selectors';

@Component({
    selector: 'app-support',
    standalone: true,
    imports: [
        IonContent,
        IonCard,
        IonCardHeader,
        IonCardTitle,
        IonCardContent,
        IonList,
        IonItem,
        IonLabel,
        IonIcon,
        TranslocoPipe,
    ],
    templateUrl: 'support.page.html',
    styleUrl: 'support.page.scss',
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SupportPage {
    @HostBinding('class.support-page')
    protected supportPageClass = true;

    private readonly store = inject(Store);
    private readonly title = inject(Title);
    private readonly transloco = inject(TranslocoService);

    readonly shikimoriDomain = this.store.selectSignal(selectShikimoriDomain);

    readonly telegramUrl = 'https://t.me/shikiripcinema';

    get shikimoriClubUrl(): string {
        return `${this.shikimoriDomain()}/clubs/50043-shikirip-cinema`;
    }

    openUrl(url: string): void {
        window.open(url, '_blank');
    }
}
