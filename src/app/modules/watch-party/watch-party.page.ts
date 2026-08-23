import {
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    OnInit,
    ViewEncapsulation,
    computed,
    effect,
    inject,
    signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
    IonButton,
    IonContent,
    IonIcon,
    IonInput,
    IonSpinner,
    IonText,
    ToastController,
} from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { CvhClient } from '@app/shared/services/cvh-client.service';
import { CvhPlaylistItem } from '@app/shared/types/cvh';
import { ShikimoriClient } from '@app/shared/services/shikimori-client.service';
import { UserRateTargetEnum } from '@app/shared/types/shikimori/user-rate-target.enum';
import { WatchPartyService } from '@app/modules/watch-party/watch-party.service';
import { WpVideoPlayerComponent } from '@app/modules/watch-party/components/wp-video-player/wp-video-player.component';
import { selectShikimoriCurrentUser } from '@app/store/shikimori/selectors/shikimori.selectors';

type WatchedState = 'idle' | 'loading' | 'done';

@Component({
    selector: 'app-watch-party-page',
    templateUrl: './watch-party.page.html',
    styleUrl: './watch-party.page.scss',
    imports: [IonContent, IonButton, IonIcon, IonInput, IonSpinner, IonText, FormsModule, WpVideoPlayerComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    host: { class: 'watch-party-page' },
})
export class WatchPartyPage implements OnInit {
    readonly wp = inject(WatchPartyService);
    private readonly router = inject(Router);
    private readonly toast = inject(ToastController);
    private readonly cvh = inject(CvhClient);
    private readonly shikimori = inject(ShikimoriClient);
    private readonly store = inject(Store);
    private readonly destroyRef = inject(DestroyRef);

    readonly joinCode = signal('');
    readonly roomIdVisible = signal(false);
    readonly seekTime = signal<number | null>(null);
    readonly availableSources = signal<CvhPlaylistItem[]>([]);
    readonly sourcesLoading = signal(false);
    readonly watchedState = signal<WatchedState>('idle');
    readonly avatars = signal<Record<string, string>>({});
    private readonly fetchedNicknames = new Set<string>();

    readonly inviteLink = computed(() => {
        const id = this.wp.roomId();
        if (!id) return '';
        return `${window.location.origin}${window.location.pathname}#/watch-party?room=${id}`;
    });

    constructor() {
        // Apply seek from any participant's sync event (server excludes the sender so no self-loop)
        effect(() => {
            const ev = this.wp.lastSyncEvent();
            if (!ev) return;
            if (ev.currentTime !== undefined) {
                this.seekTime.set(ev.currentTime);
            }
        });

        // Load available sources when host sets animeId+episode
        effect(() => {
            const state = this.wp.videoState();
            if (!this.wp.isHost() || !state?.animeId || state.episode === null) return;
            this.sourcesLoading.set(true);
            this.cvh.findAnimes(state.animeId).subscribe((playlist) => {
                const sources = playlist.items.filter((i) => i.episode === state.episode && i.season === 1);
                this.availableSources.set(sources);
                this.sourcesLoading.set(false);
                if (!state.vkId && sources.length > 0) {
                    this.wp.selectSource(sources[0].vkId);
                }
            });
        });

        // Reset "watched" button when episode changes
        effect(() => {
            void this.wp.videoState()?.episode;
            this.watchedState.set('idle');
        });

        // Load avatars for new participants
        effect(() => {
            const participants = this.wp.participants();
            for (const p of participants) {
                if (this.fetchedNicknames.has(p.nickname)) continue;
                this.fetchedNicknames.add(p.nickname);
                this.shikimori.getUserBriefInfo(p.nickname)
                    .pipe(takeUntilDestroyed(this.destroyRef))
                    .subscribe((info) => {
                        this.avatars.update((prev) => ({ ...prev, [p.nickname]: info.image?.x64 ?? info.avatar }));
                    });
            }
        });
    }

    ngOnInit(): void {
        const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
        const roomParam = params.get('room');

        this.wp.connect();

        if (roomParam) {
            this.joinCode.set(roomParam);
            this.wp.joinRoom(roomParam);
        }
    }

    onCreateRoom(): void {
        this.wp.createRoom();
    }

    onJoinRoom(): void {
        const code = this.joinCode().trim().toUpperCase();
        if (!code) return;
        this.wp.joinRoom(code);
    }

    onLeaveRoom(): void {
        this.wp.leaveRoom();
    }

    async onCopyLink(): Promise<void> {
        await navigator.clipboard.writeText(this.inviteLink());
        const t = await this.toast.create({
            message: 'Ссылка скопирована!', duration: 1500, color: 'success', position: 'bottom',
        });
        await t.present();
    }

    onBrowseAnime(): void {
        void this.router.navigate(['/home']);
    }

    onSelectSource(vkId: string): void {
        this.wp.selectSource(vkId);
    }

    onKick(participantId: string): void {
        this.wp.kickParticipant(participantId);
    }

    onBan(participantId: string): void {
        this.wp.banParticipant(participantId);
    }

    onOpenAnime(): void {
        const url = this.wp.videoState()?.animeUrl;
        if (!url) return;
        if (url.startsWith('#/')) {
            void this.router.navigateByUrl(url.slice(1));
        } else {
            void this.router.navigate(['/external'], {
                queryParams: { link: btoa(url) },
                skipLocationChange: true,
            });
        }
    }

    markWatched(): void {
        const state = this.wp.videoState();
        if (!state?.animeId || state.episode === null) return;

        const user = this.store.selectSignal(selectShikimoriCurrentUser)();
        if (!user?.id) return;

        const animeId = Number(state.animeId);
        const episode = state.episode;

        this.watchedState.set('loading');

        this.shikimori.getUserRate(user.id, animeId, UserRateTargetEnum.ANIME).pipe(
            switchMap((rates) => {
                const rate = rates[0];
                const newEpisodes = Math.max(rate?.episodes ?? 0, episode);
                if (rate) {
                    return this.shikimori.updateUserRate({ id: rate.id, episodes: newEpisodes, status: 'watching' });
                }
                return this.shikimori.createUserRate({
                    user_id: user.id,
                    target_id: animeId,
                    target_type: UserRateTargetEnum.ANIME,
                    status: 'watching',
                    episodes: newEpisodes,
                });
            }),
        ).subscribe({
            next: async () => {
                this.watchedState.set('done');
                const t = await this.toast.create({
                    message: 'Серия отмечена!', duration: 1500, color: 'success', position: 'bottom',
                });
                await t.present();
            },
            error: () => this.watchedState.set('idle'),
        });
    }
}
