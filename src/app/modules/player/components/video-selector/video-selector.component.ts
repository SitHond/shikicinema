import {
    ChangeDetectionStrategy,
    Component,
    HostBinding,
    ViewEncapsulation,
    afterEveryRender,
    computed,
    inject,
    input,
    output,
} from '@angular/core';
import {
    IonAccordionGroup,
    IonButton,
    IonIcon,
    IonText,
} from '@ionic/angular/standalone';
import { NgScrollbar } from 'ngx-scrollbar';
import { SignalSet } from 'ngxtension/collections';
import { Subject, map, merge, of, switchMap } from 'rxjs';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';

import { AuthorRating, DubbingRatingService } from '@app/core/services/dubbing-rating.service';
import { FilterByAuthorPipe } from '@app/shared/pipes/filter-by-author/filter-by-author.pipe';
import { IncludesPipe } from '@app/shared/pipes/includes/includes.pipe';
import { PlayerKindDisplayMode } from '@app/store/settings/types/player-kind-display-mode.type';
import { ResourceIdType } from '@app/shared/types';
import { VideoInfoInterface } from '@app/modules/player/types';
import { VideoSelectorItemComponent } from '@app/modules/player/components/video-selector-item';
import { cleanAuthorName } from '@app/shared/utils/clean-author-name.function';


@Component({
    selector: 'app-video-selector',
    standalone: true,
    imports: [
        IonAccordionGroup,
        IonButton,
        IonIcon,
        IonText,
        FilterByAuthorPipe,
        IncludesPipe,
        NgScrollbar,
        TranslocoPipe,
        VideoSelectorItemComponent,
    ],
    templateUrl: './video-selector.component.html',
    styleUrl: './video-selector.component.scss',
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoSelectorComponent {
    @HostBinding('class.video-selector')
    protected videoSelectorClass = true;

    private readonly transloco = inject(TranslocoService);
    private readonly _dubbingRating = inject(DubbingRatingService);

    readonly defaultAuthorName = toSignal<string>(this.transloco.selectTranslate('GLOBAL.VIDEO.AUTHORS.DEFAULT_NAME'));
    readonly isAuthenticated = toSignal(this._dubbingRating.isAuthenticated$, { initialValue: false });

    animeId = input<ResourceIdType>();
    selected = input<VideoInfoInterface>();
    videos = input<VideoInfoInterface[]>();
    kindDisplayMode = input<PlayerKindDisplayMode>();
    warnAvailability = input<string[]>([]);
    hasUnfilteredVideos = input<boolean>(false);

    selection = output<VideoInfoInterface>();
    disableFilters = output<void>();

    private readonly _openedByDefaultAuthors = new SignalSet<string>();
    private readonly _refresh$ = new Subject<void>();

    private readonly _ratingsMap = toSignal(
        toObservable(this.animeId).pipe(
            switchMap((id) => !id ? of(new Map<string, AuthorRating>()) : merge(of(null), this._refresh$).pipe(
                switchMap(() => this._dubbingRating.getRatings(id)),
                map((list) => new Map(list.map((r) => [r.author, r]))),
            )),
        ),
        { initialValue: new Map<string, AuthorRating>() },
    );

    readonly openedAuthors = computed(() => [...this._openedByDefaultAuthors])

    readonly authors = computed(() => {
        const defaultAuthorName = this.defaultAuthorName();
        const authors = this.videos()
            ?.map(({ author }) => author)
            ?.map((author) => cleanAuthorName(author, defaultAuthorName))
            ?.sort();

        return new Set(authors);
    });

    constructor() {
        afterEveryRender({
            mixedReadWrite: () => {
                if (this.selected()) {
                    this.videos()
                    const defaultAuthorName = this.defaultAuthorName();
                    const cleaned = cleanAuthorName(this.selected().author, defaultAuthorName);

                    this._openedByDefaultAuthors.add(cleaned);
                }
            },
        })
    }

    getRating(author: string): AuthorRating | null {
        return this._ratingsMap()?.get(author) ?? null;
    }

    onVote(author: string, vote: 1 | -1): void {
        const id = this.animeId();
        if (!id) return;
        const current = this._ratingsMap()?.get(author);
        const obs = current?.user_vote === vote
            ? this._dubbingRating.removeVote(id, author)
            : this._dubbingRating.vote(id, author, vote);
        obs.subscribe((ok) => {
            if (ok) this._refresh$.next();
        });
    }

    onSelectionChange(selectedVideo: VideoInfoInterface): void {
        this.selection.emit(selectedVideo);
    }

    onAuthorSectionToggle(author: string): void {
        const isClosingClick = this._openedByDefaultAuthors.has(author);

        if (isClosingClick) {
            this._openedByDefaultAuthors.delete(author);
        } else {
            this._openedByDefaultAuthors.add(author);
        }
    }
}
