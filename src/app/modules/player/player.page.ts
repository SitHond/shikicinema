import { Actions, ofType } from '@ngrx/effects';
import { AsyncPipe } from '@angular/common';
import { BreakpointObserver } from '@angular/cdk/layout';
import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    ElementRef,
    HostBinding,
    OnInit,
    ViewEncapsulation,
    computed,
    effect,
    inject,
    input,
    signal,
    viewChild,
} from '@angular/core';
import {
    IonButton,
    IonContent,
    IonIcon,
    IonText,
    ModalController,
    Platform,
    ToastController,
} from '@ionic/angular/standalone';
import { Observable, of, switchMap, timer } from 'rxjs';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { Title } from '@angular/platform-browser';
import { TranslocoService } from '@jsverse/transloco';
import {
    catchError,
    debounceTime,
    map,
    take,
    tap,
} from 'rxjs/operators';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';

import { AnimeBriefInfoInterface } from '@app/shared/types/shikimori/anime-brief-info.interface';
import { Comment } from '@app/shared/types/shikimori/comment';
import { CommentsComponent } from '@app/modules/player/components/comments/comments.component';
import { ControlPanelComponent } from '@app/modules/player/components/control-panel/control-panel.component';
import { CvhClient } from '@app/shared/services';
import { DiscordPresenceService } from '@app/shared/services/discord-presence.service';
import { FooterComponent } from '@app/shared/components/footer/footer.component';
import { FranchisePanelComponent } from '@app/modules/player/components/franchise-panel/franchise-panel.component';
import { GetShikimoriPagePipe } from '@app/shared/pipes/get-shikimori-page/get-shikimori-page.pipe';
import {
    KODIK_URL_RE,
    ResolvedStream,
    ShikicinemaApiService,
    SubmitReportParams,
} from '@app/shared/services/shikicinema-api.service';
import { PlayerComponent } from '@app/modules/player/components/player/player.component';
import { PlayerSelectorComponent } from '@app/modules/player/components/player-selector';
import { ReportModalComponent } from '@app/modules/player/components/report-modal/report-modal.component';
import { ResourceIdType } from '@app/shared/types/resource-id.type';
import { ShikimoriAnimeLinkPipe } from '@app/shared/pipes/shikimori-anime-link/shikimori-anime-link.pipe';
import { SidePanelComponent } from '@app/modules/player/components/side-panel/side-panel.component';
import { SkeletonBlockComponent } from '@app/shared/components/skeleton-block/skeleton-block.component';
import { SwipeDirective } from '@app/shared/directives/swipe.directive';
import { UserCommentFormComponent } from '@app/modules/player/components/user-comment-form/user-comment-form.component';
import { VideoInfoInterface } from '@app/modules/player/types';
import { VideoKindEnum } from '@app/modules/player/types/video-kind.enum';
import { WatchPartyService } from '@app/modules/watch-party/watch-party.service';
import { authShikimoriAction } from '@app/store/auth/actions/auth.actions';
import {
    changeCurrentAnimeAction,
    changeCurrentEpisodeAction,
    deleteCommentAction,
    editCommentAction,
    editCommentSuccessAction,
    findVideosAction,
    getAnimeInfoAction,
    getRelatedAnimesAction,
    sendCommentAction,
    setIsShownAllAction,
    watchAnimeAction,
    watchAnimeSuccessAction,
} from '@app/modules/player/store/actions';
import { filterByEpisode } from '@app/shared/utils/filter-by-episode.function';
import {
    filterVideosByDomains,
    getLastAiredEpisode,
    getMaxEpisode,
    getMaxEpisodeFromVideos,
    isEpisodeWatched,
} from '@app/modules/player/utils';
import { getAnimeName } from '@app/shared/utils/get-anime-name.function';
import { getDomain } from '@app/shared/utils/get-domain.function';
import { isEq } from '@app/shared/utils/is-eq.function';
import { isEqId } from '@app/shared/utils/is-eq-id.function';
import {
    selectDomainFilters,
    selectPlayerKindDisplayMode,
    selectPlayerMode,
    selectShowAdultContent,
    selectShowEpisodeCount,
} from '@app/store/settings/selectors/settings.selectors';
import { selectIsAuthenticated } from '@app/store/auth/selectors/auth.selectors';
import {
    selectPlayerAnime,
    selectPlayerAnimeLoading,
    selectPlayerComments,
    selectPlayerIsCommentsLoading,
    selectPlayerIsCommentsPartiallyLoading,
    selectPlayerIsContentRestricted,
    selectPlayerIsShownAllComments,
    selectPlayerRelatedAnimes,
    selectPlayerTopic,
    selectPlayerUserRate,
    selectPlayerVideos,
    selectPlayerVideosLoading,
} from '@app/modules/player/store/selectors/player.selectors';
import { selectShikimoriDomain } from '@app/store/shikimori/selectors/shikimori.selectors';
import {
    togglePlayerModeAction,
    updatePlayerPreferencesAction,
} from '@app/store/settings/actions/settings.actions';
import { visitAnimePageAction } from '@app/modules/home/store/recent-animes/actions';


@Component({
    selector: 'app-player-page',
    templateUrl: './player.page.html',
    styleUrl: './player.page.scss',
    imports: [
        AsyncPipe,
        PlayerComponent,
        PlayerSelectorComponent,
        SkeletonBlockComponent,
        ControlPanelComponent,
        SwipeDirective,
        CommentsComponent,
        UserCommentFormComponent,
        ShikimoriAnimeLinkPipe,
        GetShikimoriPagePipe,
        FranchisePanelComponent,
        SidePanelComponent,
        IonText,
        IonContent,
        IonButton,
        IonIcon,
        FooterComponent,
    ],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayerPage implements OnInit {
    @HostBinding('class.player-page')
    protected playerPageClass = true;

    private readonly store = inject(Store);
    private readonly router = inject(Router);
    private readonly title = inject(Title);
    private readonly platform = inject(Platform);
    private readonly breakpointObserver = inject(BreakpointObserver);
    private readonly actions$ = inject(Actions);
    private readonly transloco = inject(TranslocoService);
    private readonly modalController = inject(ModalController);
    private readonly toastController = inject(ToastController);
    private readonly destroyRef = inject(DestroyRef);
    private readonly cvhClient = inject(CvhClient);
    private readonly shikicinemaApi = inject(ShikicinemaApiService);
    readonly discord = inject(DiscordPresenceService);

    readonly wp = inject(WatchPartyService);

    readonly animeId = input.required<string>();
    readonly episode = input.required<string>();

    private readonly userCommentFormEl = viewChild('userCommentForm', { read: ElementRef });

    readonly playerMode = this.store.selectSignal(selectPlayerMode);
    readonly playerKindDisplayMode = this.store.selectSignal(selectPlayerKindDisplayMode);
    readonly isUserAuthorized = this.store.selectSignal(selectIsAuthenticated);
    readonly domainFilters = this.store.selectSignal(selectDomainFilters);
    readonly shikimoriDomain = this.store.selectSignal(selectShikimoriDomain);
    readonly showAdultContent = this.store.selectSignal(selectShowAdultContent);
    readonly showEpisodeCount = this.store.selectSignal(selectShowEpisodeCount);

    readonly isMediaMatch = toSignal(this.breakpointObserver.observe([
        '(max-width: 1199.98px)',
    ]).pipe(map(({ matches }) => matches)));

    readonly isSmallScreen = computed(
        () => this.isMediaMatch() || this.playerMode() === 'full',
        { equal: isEq },
    );

    readonly isPanelsMinified = computed(() => this.isOrientationPortrait() || this.isSmallScreen());
    readonly userSelectedLanguage = toSignal(this.transloco.langChanges$);

    animeIdQ = computed(() => this.animeId(), { equal: isEq });
    episodeQ = computed(() => Number(this.episode()), { equal: isEq });

    isVideosLoading = computed(() => this.store.selectSignal(selectPlayerVideosLoading(this.animeIdQ()))());
    videos = computed(() => this.store.selectSignal(selectPlayerVideos(this.animeIdQ()))());
    isAnimeLoading = computed(() => this.store.selectSignal(selectPlayerAnimeLoading(this.animeIdQ()))());
    anime = computed(() => this.store.selectSignal(selectPlayerAnime(this.animeIdQ()))(), { equal: isEqId });
    relatedAnimes = computed(() => this.store.selectSignal(selectPlayerRelatedAnimes(this.animeIdQ()))());
    userRate = computed(() => this.store.selectSignal(selectPlayerUserRate(this.animeIdQ()))());
    comments = computed(() => this.store.selectSignal(selectPlayerComments(this.animeIdQ(), this.episodeQ()))());
    topic = computed(() => this.store.selectSignal(selectPlayerTopic(this.animeIdQ(), this.episodeQ()))());
    isShownAllComments = computed(() => this.store.selectSignal(
        selectPlayerIsShownAllComments(this.animeIdQ(), this.episodeQ()),
    )());
    isCommentsLoading = computed(() => this.store.selectSignal(
        selectPlayerIsCommentsLoading(this.animeIdQ(), this.episodeQ()),
    )());
    isCommentsPartiallyLoading = computed(() => this.store.selectSignal(
        selectPlayerIsCommentsPartiallyLoading(this.animeIdQ(), this.episodeQ()),
    )());

    lastAiredEpisode = computed(() => getLastAiredEpisode(this.anime()));
    maxVideosEpisode = computed(() => getMaxEpisodeFromVideos(this.videos()));
    maxEpisode = computed(() => getMaxEpisode(this.anime(), this.maxVideosEpisode()));
    animeName = computed(() => getAnimeName(this.anime(), this.userSelectedLanguage()));
    isAdultRestricted = computed(
        () => !this.isAnimeLoading() && this.anime()?.rating === 'rx' && !this.showAdultContent(),
    );
    isContentRestricted = toSignal(
        toObservable(this.animeIdQ).pipe(
            switchMap((animeId) => this.store.select(selectPlayerIsContentRestricted(animeId))),
        ),
        { initialValue: false },
    );
    isWatched = computed(() => isEpisodeWatched(this.episodeQ(), this.userRate()));
    isRewatching = computed(() => this.userRate()?.status === 'rewatching');

    isDomainFilterOn = signal(true);
    episodeVideosUnfiltered = computed(() => filterByEpisode(this.videos(), this.episodeQ()));
    episodeVideosFiltered = computed(() => filterVideosByDomains(this.episodeVideosUnfiltered(), this.domainFilters()));
    episodeVideos = computed(() => this.isDomainFilterOn()
        ? this.episodeVideosFiltered()
        : this.episodeVideosUnfiltered(),
    );
    hasUnfilteredVideos = computed(() => this.episodeVideosUnfiltered()?.length > 0 && this.isDomainFilterOn());

    nextEpisodeAt = computed(() => {
        const nextEpisodeAt = this.anime()?.next_episode_at;
        const isCurrentEpisodeNotAired = this.episodeQ() > this.lastAiredEpisode();

        return isCurrentEpisodeNotAired ? nextEpisodeAt : null;
    });

    currentVideo = signal<VideoInfoInterface>(null);
    currentKind = signal<VideoKindEnum>(null);
    isOrientationPortrait = signal<boolean>(false);

    readonly resolvedSource = toSignal(
        toObservable(this.currentVideo).pipe(
            switchMap((video): Observable<ResolvedStream | null> => {
                if (!video?.url) return of(null);

                const CVH_BASE = 'https://cdnvideohub.com/video/';

                if (video.urlType === 'video' && video.url.startsWith(CVH_BASE)) {
                    const vkId = video.url.slice(CVH_BASE.length);

                    return this.cvhClient.resolveVideoUrl(vkId).pipe(
                        map((url) => ({ url, urlType: 'video' as const })),
                        catchError(() => of({ url: null, urlType: 'video' as const })),
                    );
                }

                if (KODIK_URL_RE.test(video.url)) {
                    return this.shikicinemaApi.resolveKodikToStream(video.url);
                }

                if (/rutube\.ru\//.test(video.url)) {
                    return this.shikicinemaApi.resolveRutubeToStream(video.url);
                }

                return of({ url: video.url, urlType: video.urlType ?? 'iframe' });
            }),
        ),
        { initialValue: null as ResolvedStream | null },
    );

    readonly timingKey = computed(() => {
        const video = this.currentVideo();
        if (!video) return null;
        return `${this.animeIdQ()}:${this.episodeQ()}:${video.author}:${video.kind}`;
    });

    editComment = signal<Comment>(null);
    highlightComment = signal<ResourceIdType>(null);

    readonly animeChangeEffect = effect(() => {
        const animeId = this.animeIdQ();

        this.store.dispatch(findVideosAction({ animeId }));
        this.store.dispatch(getAnimeInfoAction({ animeId }));
        this.store.dispatch(getRelatedAnimesAction({ animeId }));
        this.store.dispatch(changeCurrentAnimeAction({ animeId }));
    });

    readonly animeOrEpisodeChangeEffect = effect(() => {
        const anime = this.anime();
        const episode = this.episodeQ();

        if (anime?.name) {
            this.changeTitle(anime, episode);

            this.store.dispatch(visitAnimePageAction({ anime, episode }));
            this.store.dispatch(changeCurrentAnimeAction({ animeId: anime.id }));
            this.store.dispatch(changeCurrentEpisodeAction({ episode }));
        }

        // Reset presence on episode change — play event will re-arm it
        this.discord.clear();
    });

    ngOnInit(): void {
        this.actions$.pipe(
            ofType(watchAnimeSuccessAction),
            tap(({ userRate }) => this.onEpisodeChange(userRate.episodes + 1)),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe();

        this.platform.resize
            .pipe(
                debounceTime(100),
                tap(() => this.onResize()),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe();

        this.onResize();
    }

    private onResize(): void {
        this.isOrientationPortrait.set(this.platform.isPortrait());
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

    changeTitle(anime: AnimeBriefInfoInterface, episode: number): void {
        // TODO: добавить селектор из настроек предпочтений названия аниме, а не просто по языку пользователя
        const animeName = this.animeName();
        const isSeries = getLastAiredEpisode(anime) > 1;
        const translationKey = isSeries
            ? 'PLAYER_MODULE.PLAYER_PAGE.PAGE_TITLE.SERIES'
            : 'PLAYER_MODULE.PLAYER_PAGE.PAGE_TITLE.MOVIE';
        const title = this.transloco.translate(translationKey, { title: animeName, episode });

        this.title.setTitle(title);
    }

    onVideoChange(video: VideoInfoInterface, isShouldUpdatePref = true): void {
        this.currentVideo.set(video);
        this.currentKind.set(video.kind);

        if (isShouldUpdatePref) {
            void this.updateUserPreferences();
        }
    }

    onPlayerPlay(): void {
        const anime = this.anime();
        const animeName = this.animeName();
        if (!anime || !animeName) return;

        this.discord.play({
            animeId: anime.id,
            animeName: anime.name,
            animeNameRu: anime.russian || undefined,
            episode: this.episodeQ(),
            totalEpisodes: this.maxEpisode() || undefined,
            posterPath: anime.image?.original || undefined,
            startedAt: Date.now(),
        });
    }

    onPlayerPause(): void {
        this.discord.pause();
    }

    onPlayerStall(): void {
        const current = this.currentVideo();
        if (!current || current.urlType !== 'video') return;

        const videos = this.episodeVideos();
        const candidates = videos?.filter((v) =>
            v.urlType === 'video' &&
            v.author === current.author &&
            v.kind === current.kind &&
            v.url !== current.url,
        );

        if (candidates?.length) {
            this.onVideoChange(candidates[0], false);
        }
    }

    onKindChange(kind: VideoKindEnum): void {
        this.currentKind.set(kind);
    }

    onEpisodeChange(episode: number): void {
        const animeId = this.animeIdQ();
        const maxEpisodes = this.maxEpisode();
        // сброс видео для корректной работы заглушек выхода серий
        this.currentVideo.set(null);

        if (episode <= maxEpisodes && episode > 0) {
            void this.router.navigate(['/player', animeId, episode]);
        }
    }

    // TODO: для модалок нужно придумать какой-то сервис - слишком много бойлерплейта
    async onOpenVideoSelectorModal(): Promise<void> {
        const prevVideo = this.currentVideo();

        const componentProps = {
            animeId: this.animeIdQ,
            videos: this.videos,
            episodeVideos: this.episodeVideos,
            kindDisplayMode: this.playerKindDisplayMode,
            isDomainFilterOn: this.isDomainFilterOn,
            hasUnfilteredVideos: this.hasUnfilteredVideos,
            selectedKind: this.currentKind,
            selectedVideo: this.currentVideo,
            lastAiredEpisode: this.lastAiredEpisode,
            showEpisodeCount: this.showEpisodeCount,
        };
        const { VideoSelectorModalComponent } = await import('@app/modules/player/components/video-selector-modal');

        const isSmall = this.isSmallScreen();
        const modal = await this.modalController.create({
            component: VideoSelectorModalComponent,
            componentProps,
            ...isSmall ? {
                breakpoints: [0, 0.65, 0.92],
                initialBreakpoint: 0.92,
                handle: true,
            } : {},
        });

        modal.present();

        const { role } = await modal.onDidDismiss<VideoInfoInterface>();

        if (role === 'cancel') {
            this.onVideoChange(prevVideo);
        }
    }

    onWatch(episode: number, isUnwatch = false): void {
        const anime = this.anime();
        const userRate = this.userRate();
        const isRewarch = this.isRewatching() || userRate?.status === 'completed';
        const isLastEpisodeWatched = userRate?.episodes >= this.maxEpisode();
        const watchedEpisode = isLastEpisodeWatched
            ? episode
            : isUnwatch ? episode - 1 : episode;

        this.store.dispatch(watchAnimeAction({ animeId: anime.id, episode: watchedEpisode, isRewarch }));

        if (!isUnwatch && this.isUserAuthorized()) {
            const provider = this.currentVideo()?.provider ?? null;
            this.shikicinemaApi.logWatch(Number(this.animeIdQ()), episode, provider).subscribe();
            try {
                const prev = parseInt(localStorage.getItem('sc_episodes') || '0', 10) || 0;
                localStorage.setItem('sc_episodes', String(prev + 1));
            } catch (_err: unknown) {
                return;
            }
        }

        void this.updateUserPreferences();
    }

    onShowMoreComments(): void {
        const animeId = this.animeIdQ();
        const episode = this.episodeQ();
        const isShownAll = true;

        this.store.dispatch(setIsShownAllAction({ animeId, episode, isShownAll }));
    }

    onCommentSend(commentText: string): void {
        const animeId = this.animeIdQ();
        const episode = this.episodeQ();

        this.store.dispatch(sendCommentAction({ animeId, episode, commentText }));
    }

    togglePlayerMode(): void {
        this.store.dispatch(togglePlayerModeAction());
    }

    onCommentLogin(): void {
        this.store.dispatch(authShikimoriAction());
    }

    onCommentEdit(comment: Comment): void {
        const userCommentFormEl: HTMLElement = this.userCommentFormEl()?.nativeElement;

        this.editComment.set(comment);

        if (userCommentFormEl) {
            /*
                TODO: зарепортить в ionic, либо проверить воспризведение после обновы

                баг Ionic'а:
                промотка, без ожидания завершения анимации закрытия ion-popover ~100мс,
                будет отмыватываться обратно к месту с открытием поповера
            */
            timer(200)
                .pipe(
                    take(1),
                    tap(() => userCommentFormEl.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                        inline: 'center',
                    })),
                    takeUntilDestroyed(this.destroyRef),
                )
                .subscribe();
        }
    }

    onCommentSendEdited(comment: Comment): void {
        const animeId = this.animeIdQ();
        const episode = this.episodeQ();

        this.store.dispatch(editCommentAction({
            animeId,
            episode,
            comment,
        }));

        this.actions$.pipe(
            ofType(editCommentSuccessAction),
            take(1),
            tap(() => this.editComment.set(null)),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe();
    }

    onCommentDelete(comment: Comment): void {
        const animeId = this.animeIdQ();
        const episode = this.episodeQ();

        this.store.dispatch(deleteCommentAction({
            animeId,
            episode,
            comment,
        }));
    }

    onHighlightComment(commentId: ResourceIdType): void {
        this.highlightComment.set(commentId);

        // сбрасываем, чтобы повторная подсветка работала
        timer(1000).pipe(
            take(1),
            tap(() => this.highlightComment.set(null)),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe();
    }

    onCancelCommentEdit(): void {
        this.editComment.set(null);
    }

    setDomainFilters(isEnabled: boolean): void {
        this.isDomainFilterOn.set(isEnabled);
    }

    onShareToWatchParty(): void {
        const id = this.animeId();
        const ep = Number(this.episode()) || 1;
        const CVH_BASE = 'https://cdnvideohub.com/video/';

        const videoUrl = this.currentVideo()?.url ?? '';
        const vkId = videoUrl.startsWith(CVH_BASE) ? videoUrl.slice(CVH_BASE.length) : undefined;
        const kodikUrl = !vkId && KODIK_URL_RE.test(videoUrl) ? videoUrl : undefined;
        this.wp.shareAnime(id, ep, this.animeName(), `#/player/${id}/${ep}`, vkId, kodikUrl);
    }

    async onReport(): Promise<void> {
        const modal = await this.modalController.create({
            component: ReportModalComponent,
            componentProps: {
                animeId: this.animeId(),
                episode: this.episodeQ(),
                videoId: this.currentVideo()?.id ?? null,
                type: 'anime',
            },
            breakpoints: [0, 1],
            initialBreakpoint: 1,
        });

        await modal.present();
        const { data, role } = await modal.onWillDismiss<SubmitReportParams>();
        if (role !== 'submit' || !data) return;

        this.shikicinemaApi.submitReport(data).subscribe(async ({ ok }) => {
            const toast = await this.toastController.create({
                message: ok ? 'Жалоба отправлена' : 'Не удалось отправить жалобу',
                color: ok ? 'success' : 'danger',
                duration: 2000,
            });
            await toast.present();
        });
    }
}
