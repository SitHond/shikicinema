import { Actions, ofType } from '@ngrx/effects';
import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    HostBinding,
    ViewEncapsulation,
    computed,
    effect,
    inject,
    input,
    signal,
} from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { of } from 'rxjs';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';

import { ControlPanelComponent } from '@app/modules/player/components/control-panel/control-panel.component';
import { CvhClient } from '@app/shared/services';
import { PlayerComponent } from '@app/modules/player/components/player/player.component';
import { PlayerSelectorComponent } from '@app/modules/player/components/player-selector';
import { VideoInfoInterface } from '@app/modules/player/types';
import { VideoKindEnum } from '@app/modules/player/types/video-kind.enum';
import {
    changeCurrentAnimeAction,
    changeCurrentEpisodeAction,
    findVideosAction,
    getAnimeInfoAction,
    watchAnimeAction,
    watchAnimeSuccessAction,
} from '@app/modules/player/store/actions';
import {
    filterVideosByDomains,
    getLastAiredEpisode,
    getMaxEpisode,
    getMaxEpisodeFromVideos,
    isEpisodeWatched,
} from '@app/modules/player/utils';
import { filterByEpisode } from '@app/shared/utils/filter-by-episode.function';
import { getDomain } from '@app/shared/utils/get-domain.function';
import { isEq } from '@app/shared/utils/is-eq.function';
import { isEqId } from '@app/shared/utils/is-eq-id.function';
import { selectDomainFilters } from '@app/store/settings/selectors/settings.selectors';
import {
    selectPlayerAnime,
    selectPlayerAnimeLoading,
    selectPlayerUserRate,
    selectPlayerVideos,
    selectPlayerVideosLoading,
} from '@app/modules/player/store/selectors/player.selectors';
import { updatePlayerPreferencesAction } from '@app/store/settings/actions/settings.actions';

@Component({
    selector: 'app-embed-page',
    templateUrl: './embed.page.html',
    styleUrl: './embed.page.scss',
    imports: [
        IonContent,
        PlayerComponent,
        PlayerSelectorComponent,
        ControlPanelComponent,
    ],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmbedPage {
    @HostBinding('class.embed-page')
    protected embedPageClass = true;

    private readonly store = inject(Store);
    private readonly router = inject(Router);
    private readonly actions$ = inject(Actions);
    private readonly destroyRef = inject(DestroyRef);
    private readonly cvhClient = inject(CvhClient);

    readonly animeId = input.required<string>();
    readonly episode = input.required<string>();

    readonly domainFilters = this.store.selectSignal(selectDomainFilters);

    animeIdQ = computed(() => this.animeId(), { equal: isEq });
    episodeQ = computed(() => Number(this.episode()), { equal: isEq });

    isVideosLoading = computed(() => this.store.selectSignal(selectPlayerVideosLoading(this.animeIdQ()))());
    videos = computed(() => this.store.selectSignal(selectPlayerVideos(this.animeIdQ()))());
    isAnimeLoading = computed(() => this.store.selectSignal(selectPlayerAnimeLoading(this.animeIdQ()))());
    anime = computed(() => this.store.selectSignal(selectPlayerAnime(this.animeIdQ()))(), { equal: isEqId });
    userRate = computed(() => this.store.selectSignal(selectPlayerUserRate(this.animeIdQ()))());

    lastAiredEpisode = computed(() => getLastAiredEpisode(this.anime()));
    maxVideosEpisode = computed(() => getMaxEpisodeFromVideos(this.videos()));
    maxEpisode = computed(() => getMaxEpisode(this.anime(), this.maxVideosEpisode()));
    isWatched = computed(() => isEpisodeWatched(this.episodeQ(), this.userRate()));
    isRewatching = computed(() => this.userRate()?.status === 'rewatching');

    isDomainFilterOn = signal(true);
    episodeVideosUnfiltered = computed(() => filterByEpisode(this.videos(), this.episodeQ()));
    episodeVideosFiltered = computed(
        () => filterVideosByDomains(this.episodeVideosUnfiltered(), this.domainFilters()),
    );
    episodeVideos = computed(() => this.isDomainFilterOn()
        ? this.episodeVideosFiltered()
        : this.episodeVideosUnfiltered(),
    );

    nextEpisodeAt = computed(() => {
        const nextEpisodeAt = this.anime()?.next_episode_at;
        const isCurrentEpisodeNotAired = this.episodeQ() > this.lastAiredEpisode();

        return isCurrentEpisodeNotAired ? nextEpisodeAt : null;
    });

    currentVideo = signal<VideoInfoInterface>(null);
    currentKind = signal<VideoKindEnum>(null);

    readonly resolvedSource = toSignal(
        toObservable(this.currentVideo).pipe(
            switchMap((video) => {
                if (!video?.url) return of(null as string | null);

                const CVH_BASE = 'https://cdnvideohub.com/video/';

                if (video.urlType === 'video' && video.url.startsWith(CVH_BASE)) {
                    const vkId = video.url.slice(CVH_BASE.length);

                    return this.cvhClient.resolveVideoUrl(vkId).pipe(
                        catchError(() => of(null as string | null)),
                    );
                }

                return of(video.url);
            }),
        ),
        { initialValue: null as string | null },
    );

    readonly animeChangeEffect = effect(() => {
        const animeId = this.animeIdQ();

        this.store.dispatch(findVideosAction({ animeId }));
        this.store.dispatch(getAnimeInfoAction({ animeId }));
        this.store.dispatch(changeCurrentAnimeAction({ animeId }));
    });

    readonly animeOrEpisodeChangeEffect = effect(() => {
        const anime = this.anime();
        const episode = this.episodeQ();

        if (anime?.name) {
            this.store.dispatch(changeCurrentAnimeAction({ animeId: anime.id }));
            this.store.dispatch(changeCurrentEpisodeAction({ episode }));
        }
    });

    constructor() {
        this.actions$.pipe(
            ofType(watchAnimeSuccessAction),
            tap(({ userRate }) => this.onEpisodeChange(userRate.episodes + 1)),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe();
    }

    onVideoChange(video: VideoInfoInterface, isShouldUpdatePref = true): void {
        this.currentVideo.set(video);
        this.currentKind.set(video.kind);

        if (isShouldUpdatePref) {
            this.updateUserPreferences();
        }
    }

    onKindChange(kind: VideoKindEnum): void {
        this.currentKind.set(kind);
    }

    onEpisodeChange(episode: number): void {
        const animeId = this.animeIdQ();
        const maxEpisodes = this.maxEpisode();

        this.currentVideo.set(null);

        if (episode <= maxEpisodes && episode > 0) {
            void this.router.navigate(['/player/embed', animeId, episode]);
        }
    }

    onWatch(episode: number, isUnwatch = false): void {
        const anime = this.anime();
        const userRate = this.userRate();
        const isRewarch = this.isRewatching() || userRate?.status === 'completed';
        const isLastEpisodeWatched = userRate?.episodes >= this.maxEpisode();
        const watchedEpisode = isLastEpisodeWatched ? episode : isUnwatch ? episode - 1 : episode;

        this.store.dispatch(watchAnimeAction({ animeId: anime.id, episode: watchedEpisode, isRewarch }));
        this.updateUserPreferences();
    }

    setDomainFilters(isEnabled: boolean): void {
        this.isDomainFilterOn.set(isEnabled);
    }

    private updateUserPreferences(): void {
        const currentVideo = this.currentVideo();

        if (currentVideo) {
            const anime = this.anime();
            const { author, kind, url } = currentVideo;
            const domain = getDomain(url);

            this.store.dispatch(updatePlayerPreferencesAction({ animeId: anime.id, author, kind, domain }));
        }
    }
}
