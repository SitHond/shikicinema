import Hls from 'hls.js';
import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    DestroyRef,
    ElementRef,
    OnChanges,
    OnDestroy,
    SimpleChanges,
    ViewEncapsulation,
    computed,
    inject,
    input,
    output,
    signal,
    viewChild,
} from '@angular/core';
import { IonButton, IonIcon, IonSpinner, IonText } from '@ionic/angular/standalone';
import { catchError } from 'rxjs/operators';
import { of, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { CvhClient } from '@app/shared/services/cvh-client.service';
import { CvhPlaylistResponse } from '@app/shared/types/cvh';
import { WatchPartyService } from '@app/modules/watch-party/watch-party.service';

type PlayerState = 'idle' | 'loading' | 'ready' | 'error';

@Component({
    selector: 'app-wp-video-player',
    templateUrl: './wp-video-player.component.html',
    styleUrl: './wp-video-player.component.scss',
    imports: [IonButton, IonIcon, IonSpinner, IonText],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    host: { class: 'wp-video-player' },
})
export class WpVideoPlayerComponent implements AfterViewInit, OnChanges, OnDestroy {
    private readonly cvh = inject(CvhClient);
    readonly wp = inject(WatchPartyService);
    private readonly destroyRef = inject(DestroyRef);

    readonly animeId = input<string | null>(null);
    readonly episode = input<number | null>(null);
    readonly vkId = input<string | null>(null);
    readonly playing = input(false);
    readonly seekTo = input<number | null>(null);

    readonly timeUpdate = output<number>();

    private readonly videoEl = viewChild<ElementRef<HTMLVideoElement>>('videoEl');
    private hls: Hls | null = null;

    readonly state = signal<PlayerState>('idle');
    readonly errorMessage = signal<string | null>(null);
    readonly currentTime = signal(0);
    readonly duration = signal(0);
    readonly isUserSeeking = signal(false);
    readonly volume = signal(1);

    readonly progressPct = computed(() => {
        const d = this.duration();
        return d > 0 ? this.currentTime() / d * 100 : 0;
    });

    readonly formattedTime = computed(() => `${this.fmt(this.currentTime())} / ${this.fmt(this.duration())}`);

    readonly isVideoPaused = computed(() => this.videoEl()?.nativeElement?.paused ?? true);

    ngAfterViewInit(): void {
        this.loadStream();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if ((changes['vkId'] || changes['animeId'] || changes['episode']) && this.videoEl()) {
            this.loadStream();
        }
        if (changes['playing'] && !changes['playing'].firstChange) {
            this.applyPlayState(this.playing());
        }
        if (changes['seekTo'] && this.seekTo() !== null) {
            this.applySeek(this.seekTo()!);
        }
    }

    ngOnDestroy(): void {
        this.destroyHls();
    }

    onVideoTimeUpdate(): void {
        const v = this.videoEl()?.nativeElement;
        if (!v || this.isUserSeeking()) return;
        this.currentTime.set(v.currentTime);
        this.timeUpdate.emit(v.currentTime);
    }

    onVideoLoaded(): void {
        const v = this.videoEl()?.nativeElement;
        if (v) this.duration.set(v.duration);
        this.state.set('ready');
        if (this.playing()) v?.play();
    }

    onVideoError(): void {
        this.state.set('error');
        this.errorMessage.set('Ошибка воспроизведения');
    }

    togglePlay(): void {
        const v = this.videoEl()?.nativeElement;
        if (!v || this.state() !== 'ready') return;
        if (v.paused) {
            v.play();
            this.wp.syncVideo(true, v.currentTime);
        } else {
            v.pause();
            this.wp.syncVideo(false, v.currentTime);
        }
    }

    onSeekBarInput(event: Event): void {
        this.isUserSeeking.set(true);
        const pct = Number((event.target as HTMLInputElement).value);
        this.currentTime.set(pct / 100 * this.duration());
    }

    onSeekBarChange(event: Event): void {
        const pct = Number((event.target as HTMLInputElement).value);
        const time = pct / 100 * this.duration();
        const v = this.videoEl()?.nativeElement;
        if (v) v.currentTime = time;
        this.isUserSeeking.set(false);
        this.wp.syncVideo(!v?.paused, time);
    }

    onVolumeChange(event: Event): void {
        const vol = Number((event.target as HTMLInputElement).value);
        const v = this.videoEl()?.nativeElement;
        if (v) v.volume = vol;
        this.volume.set(vol);
    }

    prevEpisode(): void {
        const ep = this.episode();
        if (ep && ep > 1) this.wp.changeEpisode(ep - 1);
    }

    nextEpisode(): void {
        const ep = this.episode();
        if (ep) this.wp.changeEpisode(ep + 1);
    }

    toggleFullscreen(): void {
        const v = this.videoEl()?.nativeElement;
        if (!v) return;
        if (document.fullscreenElement) {
            void document.exitFullscreen();
        } else {
            void v.requestFullscreen();
        }
    }

    private applyPlayState(playing: boolean): void {
        const v = this.videoEl()?.nativeElement;
        if (!v || this.state() !== 'ready') return;
        if (playing && v.paused) void v.play();
        else if (!playing && !v.paused) v.pause();
    }

    private applySeek(time: number): void {
        const v = this.videoEl()?.nativeElement;
        if (v && this.state() === 'ready') v.currentTime = time;
    }

    private loadStream(): void {
        const vkId = this.vkId();
        const id = this.animeId();
        const ep = this.episode();

        // If vkId is provided directly — use it (host picked specific source)
        if (vkId) {
            this.state.set('loading');
            this.errorMessage.set(null);
            this.destroyHls();
            this.cvh.resolveVideoUrl(vkId).pipe(
                catchError((err) => {
                    this.state.set('error');
                    this.errorMessage.set(err.message || 'Источник не найден');
                    return of(null as string | null);
                }),
                takeUntilDestroyed(this.destroyRef),
            ).subscribe((url) => {
                if (url) this.attachStream(url);
            });
            return;
        }

        if (!id || ep === null) return;

        this.state.set('loading');
        this.errorMessage.set(null);
        this.destroyHls();

        this.cvh.findAnimes(id).pipe(
            switchMap((playlist: CvhPlaylistResponse) => {
                const item = playlist.items.find((i) => i.episode === ep && i.season === 1);
                if (!item) throw new Error('Источник не найден в CVH для этого эпизода');
                return this.cvh.resolveVideoUrl(item.vkId);
            }),
            catchError((err) => {
                this.state.set('error');
                this.errorMessage.set(err.message || 'Источник не найден');
                return of(null as string | null);
            }),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe((url) => {
            if (url) this.attachStream(url);
        });
    }

    private attachStream(url: string): void {
        const v = this.videoEl()?.nativeElement;
        if (!v) return;

        if (url.includes('.m3u8')) {
            if (Hls.isSupported()) {
                this.hls = new Hls();
                this.hls.loadSource(url);
                this.hls.attachMedia(v);
                this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    this.state.set('ready');
                    if (this.playing()) void v.play();
                });
                this.hls.on(Hls.Events.ERROR, (_, data) => {
                    if (data.fatal) {
                        this.state.set('error');
                        this.errorMessage.set('HLS ошибка');
                    }
                });
            } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
                v.src = url;
            } else {
                this.state.set('error');
                this.errorMessage.set('HLS не поддерживается');
            }
        } else {
            v.src = url;
        }
    }

    private destroyHls(): void {
        this.hls?.destroy();
        this.hls = null;
        const v = this.videoEl()?.nativeElement;
        if (v) {
            v.pause(); v.src = '';
        }
        this.state.set('idle');
        this.currentTime.set(0);
        this.duration.set(0);
    }

    private fmt(sec: number): string {
        const h = Math.floor(sec / 3600);
        const m = Math.floor(sec % 3600 / 60);
        const s = Math.floor(sec % 60);
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
}
