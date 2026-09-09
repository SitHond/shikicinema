import Hls from 'hls.js';
import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    DestroyRef,
    ElementRef,
    NgZone,
    OnDestroy,
    ViewEncapsulation,
    computed,
    effect,
    inject,
    input,
    output,
    signal,
    viewChild,
} from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { Subject, fromEvent } from 'rxjs';
import { debounceTime, tap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

const TIMING_PREFIX = 'sp:t:';
const TIMING_SAVE_EVERY_S = 5;
const TIMING_MIN_S = 5;
const TIMING_NEAR_END_S = 10;
const QUALITIES = ['1080', '720', '480', '360'] as const;
const ANISKIP_URL = 'https://api.aniskip.com/v2/skip-times';

interface SkipInterval {
    start: number;
    end: number;
    type: 'op' | 'ed';
}

@Component({
    selector: 'app-shiki-player',
    templateUrl: './shiki-player.component.html',
    styleUrl: './shiki-player.component.scss',
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: true,
    imports: [IonIcon],
})
export class ShikiPlayerComponent implements OnDestroy {
    private readonly destroyRef = inject(DestroyRef);

    src = input<string>();
    streams = input<Record<string, string>>();
    timingKey = input<string>();
    canPlay = output<void>();
    stall = output<void>();
    played = output<void>();
    paused = output<void>();

    readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('videoEl');
    readonly containerRef = viewChild<ElementRef<HTMLDivElement>>('containerEl');
    readonly progressRef = viewChild<ElementRef<HTMLDivElement>>('progressEl');
    readonly volumeBarRef = viewChild<ElementRef<HTMLDivElement>>('volumeBarEl');
    readonly skipBtnRef = viewChild<ElementRef<HTMLButtonElement>>('skipBtnEl');
    readonly skipLabelRef = viewChild<ElementRef<HTMLSpanElement>>('skipLabelEl');

    readonly isPlaying = signal(false);
    readonly isBuffering = signal(true);
    readonly hasError = signal(false);
    readonly errorMsg = signal<string | null>(null);
    readonly isMuted = signal(false);
    readonly isFullscreen = signal(false);
    readonly showControls = signal(true);
    readonly showPlayBurst = signal(false);
    readonly currentTime = signal(0);
    readonly duration = signal(0);
    readonly progress = signal(0);
    readonly buffered = signal(0);
    readonly volume = signal(this.readVolumePref());
    readonly isPip = signal(false);
    readonly speed = signal(1);
    readonly showVolumeSlider = signal(false);
    readonly showSpeedMenu = signal(false);
    readonly showQualityMenu = signal(false);
    readonly currentQuality = signal<string>(null);
    readonly skipIntervals = signal<SkipInterval[]>([]);

    // Derived from streams input (no currentQuality dependency to avoid effect loops)
    readonly qualities = computed(() =>
        QUALITIES.filter((q) => !!this.streams()?.[q]),
    );

    readonly autoSkip = signal<boolean>(this.readAutoSkipPref());

    private currentSkipInterval: SkipInterval | null = null;

    private readonly parsedTimingKey = computed(() => {
        const key = this.timingKey();
        if (!key) return { animeId: null as string | null, episode: null as number | null };
        const parts = key.split(':');
        return { animeId: parts[0] ?? null, episode: parts[1] ? Number(parts[1]) : null };
    });

    // Used in template only (not in effects)
    readonly effectiveSrc = computed(() => {
        const s = this.streams();
        const q = this.currentQuality();
        return s && q && s[q] ? s[q] : this.src() ?? null;
    });

    readonly timeDisplay = computed(() => {
        const fmt = (s: number) => {
            const h = Math.floor(s / 3600);
            const m = Math.floor(s % 3600 / 60);
            const sec = Math.floor(s % 60);
            return h > 0
                ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
                : `${m}:${String(sec).padStart(2, '0')}`;
        };
        return `${fmt(this.currentTime())} / ${fmt(this.duration())}`;
    });

    readonly speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

    private readonly zone = inject(NgZone);
    private readonly cdr = inject(ChangeDetectorRef);

    private hls: Hls | null = null;
    private lastSavedTime = -999;
    private controlsHideTimer: ReturnType<typeof setTimeout> | null = null;
    private playBurstTimer: ReturnType<typeof setTimeout> | null = null;
    private stallCheckTimer: ReturnType<typeof setTimeout> | null = null;
    private clickTimer: ReturnType<typeof setTimeout> | null = null;
    private isDragging = false;
    private activity$ = new Subject<void>();

    private readonly skipFetchEffect = effect(() => {
        const { animeId, episode } = this.parsedTimingKey();
        if (!animeId || !episode) {
            this.skipIntervals.set([]); return;
        }
        void this.fetchSkipTimes(animeId, episode);
    }, { allowSignalWrites: true });

    // Watches ONLY external inputs: src + streams. currentQuality is NOT read here.
    private readonly srcEffect = effect(() => {
        const streams = this.streams();
        const plainSrc = this.src();

        let urlToLoad: string | null = null;

        if (streams) {
            const savedQ = this.readQualityPref();
            const avail = QUALITIES.filter((q) => !!streams[q]);
            const q = savedQ && streams[savedQ] ? savedQ : avail[0] ?? null;
            this.currentQuality.set(q);
            urlToLoad = q ? streams[q] : null;
        } else {
            this.currentQuality.set(null);
            urlToLoad = plainSrc ?? null;
        }

        if (urlToLoad) this.loadUrl(urlToLoad);
    }, { allowSignalWrites: true });

    constructor() {
        this.activity$.pipe(
            tap(() => this.showControls.set(true)),
            debounceTime(3000),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe(() => {
            if (this.isPlaying()) this.showControls.set(false);
        });

        fromEvent<KeyboardEvent>(document, 'keydown').pipe(
            takeUntilDestroyed(this.destroyRef),
        ).subscribe((e) => this.onKeydown(e));

        fromEvent(document, 'fullscreenchange').pipe(
            takeUntilDestroyed(this.destroyRef),
        ).subscribe(() => {
            this.isFullscreen.set(!!document.fullscreenElement);
        });

        fromEvent<MouseEvent>(document, 'mousemove').pipe(
            takeUntilDestroyed(this.destroyRef),
        ).subscribe((e) => this.onDocumentMouseMove(e));

        fromEvent<TouchEvent>(document, 'touchmove').pipe(
            takeUntilDestroyed(this.destroyRef),
        ).subscribe((e) => this.onDocumentTouchMove(e));

        fromEvent(document, 'mouseup').pipe(
            takeUntilDestroyed(this.destroyRef),
        ).subscribe(() => {
            this.isDragging = false;
        });

        fromEvent(document, 'touchend').pipe(
            takeUntilDestroyed(this.destroyRef),
        ).subscribe(() => {
            this.isDragging = false;
        });

        fromEvent(document, 'enterpictureinpicture').pipe(
            takeUntilDestroyed(this.destroyRef),
        ).subscribe(() => this.isPip.set(true));

        fromEvent(document, 'leavepictureinpicture').pipe(
            takeUntilDestroyed(this.destroyRef),
        ).subscribe(() => this.isPip.set(false));
    }

    ngOnDestroy(): void {
        this.destroyHls();
        if (this.controlsHideTimer) clearTimeout(this.controlsHideTimer);
        if (this.playBurstTimer) clearTimeout(this.playBurstTimer);
        if (this.stallCheckTimer) clearTimeout(this.stallCheckTimer);
        if (this.clickTimer) clearTimeout(this.clickTimer);
    }

    // ── Source loading ───────────────────────────────────────────────────────────

    private loadUrl(url: string, seekTo?: number): void {
        if (this.stallCheckTimer) {
            clearTimeout(this.stallCheckTimer); this.stallCheckTimer = null;
        }
        this.isBuffering.set(true);
        this.hasError.set(false);
        this.errorMsg.set(null);
        this.isPlaying.set(false);
        this.progress.set(0);
        this.buffered.set(0);
        this.currentTime.set(0);
        this.duration.set(0);
        this.lastSavedTime = -999;
        const v = this.videoRef()?.nativeElement;
        if (v) this.attachToVideo(v, url, seekTo);
    }

    private attachToVideo(video: HTMLVideoElement, url: string, seekTo?: number): void {
        this.destroyHls();
        if (url.includes('.m3u8') && Hls.isSupported()) {
            this.hls = new Hls({ enableWorker: true, lowLatencyMode: false });
            this.hls.loadSource(url);
            this.hls.attachMedia(video);
            if (seekTo !== null && seekTo > 0) {
                this.hls.once(Hls.Events.MANIFEST_PARSED, () => {
                    video.currentTime = seekTo;
                });
            }
            this.hls.on(Hls.Events.ERROR, (_, data) => {
                if (!data.fatal) return;
                this.zone.run(() => {
                    this.isBuffering.set(false);
                    this.hasError.set(true);
                    this.errorMsg.set('Поток недоступен');
                    this.stall.emit();
                });
            });
        } else {
            video.src = url;
            if (seekTo !== null && seekTo > 0) video.currentTime = seekTo;
            video.load();
        }
    }

    private destroyHls(): void {
        if (this.hls) {
            this.hls.destroy(); this.hls = null;
        }
    }

    // ── Video events ─────────────────────────────────────────────────────────────

    onCanPlay(): void {
        this.isBuffering.set(false);
        this.duration.set(this.videoRef()?.nativeElement?.duration ?? 0);
        this.canPlay.emit();
    }

    onLoadedMetadata(): void {
        const v = this.videoRef()?.nativeElement;
        if (!v) return;
        v.volume = this.volume();
        this.duration.set(v.duration);
        const saved = this.readTiming();
        if (saved !== null && saved > TIMING_MIN_S && saved < v.duration - TIMING_NEAR_END_S) {
            v.currentTime = saved;
        }
    }

    onWaiting(): void {
        this.isBuffering.set(true);
        // Запускаем таймер зависания только если видео уже играло — не при начальной загрузке
        if (this.isPlaying() || this.currentTime() > 0) {
            if (this.stallCheckTimer) clearTimeout(this.stallCheckTimer);
            this.stallCheckTimer = setTimeout(() => {
                this.stallCheckTimer = null;
                this.stall.emit();
            }, 10_000);
        }
    }

    onPlaying(): void {
        this.isBuffering.set(false);
        this.isPlaying.set(true);
        if (this.stallCheckTimer) {
            clearTimeout(this.stallCheckTimer); this.stallCheckTimer = null;
        }
        this.played.emit();
    }

    onTimeUpdate(): void {
        const v = this.videoRef()?.nativeElement;
        if (!v) return;
        const t = v.currentTime;
        this.currentTime.set(t);
        if (v.duration) this.progress.set(t / v.duration * 100);
        this.maybeSaveTiming(t, v.duration);
        const intervals = this.skipIntervals();
        const inSkip = intervals.find((s) => t >= s.start && t < s.end) ?? null;
        this.updateSkipButton(inSkip);
        if (inSkip && this.autoSkip()) {
            v.currentTime = inSkip.end;
        }
    }

    onProgress(): void {
        const v = this.videoRef()?.nativeElement;
        if (!v || !v.buffered.length) return;
        const end = v.buffered.end(v.buffered.length - 1);
        this.buffered.set(end / v.duration * 100);
    }

    onEnded(): void {
        this.isPlaying.set(false);
        this.showControls.set(true);
        this.clearTiming();
    }

    // ── Controls ─────────────────────────────────────────────────────────────────

    onContainerClick(e: MouseEvent): void {
        if ((e.target as HTMLElement).closest('.vp__controls')) return;
        if (this.clickTimer) {
            // Second click within 250ms — cancel, dblclick handler will fire
            clearTimeout(this.clickTimer);
            this.clickTimer = null;
            return;
        }
        this.clickTimer = setTimeout(() => {
            this.clickTimer = null;
            this.togglePlay();
            this.showPlayBurst.set(true);
            if (this.playBurstTimer) clearTimeout(this.playBurstTimer);
            this.playBurstTimer = setTimeout(() => this.showPlayBurst.set(false), 600);
        }, 250);
    }

    onContainerKeyDown(e: KeyboardEvent): void {
        if (e.code === 'Space' || e.code === 'Enter') {
            e.preventDefault();
            this.togglePlay();
        }
        const v = this.videoRef()?.nativeElement;
        if (e.code === 'ArrowRight' && v) v.currentTime += 5;
        if (e.code === 'ArrowLeft' && v) v.currentTime -= 5;
    }

    onContainerDblClick(e: MouseEvent): void {
        if ((e.target as HTMLElement).closest('.vp__controls')) return;
        if (this.clickTimer) {
            clearTimeout(this.clickTimer); this.clickTimer = null;
        }
        this.toggleFullscreen();
    }

    onMouseMove(): void {
        this.activity$.next();
    }

    togglePlay(): void {
        const v = this.videoRef()?.nativeElement;
        if (!v) return;
        if (v.paused) {
            v.play(); this.isPlaying.set(true);
        } else {
            v.pause(); this.isPlaying.set(false); this.showControls.set(true); this.paused.emit();
        }
        this.activity$.next();
    }

    toggleMute(): void {
        const v = this.videoRef()?.nativeElement;
        if (!v) return;
        v.muted = !v.muted;
        this.isMuted.set(v.muted);
    }

    onVolumeBarClick(e: MouseEvent): void {
        const bar = this.volumeBarRef()?.nativeElement;
        if (!bar) return;
        const rect = bar.getBoundingClientRect();
        this.setVolume(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
    }

    setVolume(ratio: number): void {
        const v = this.videoRef()?.nativeElement;
        if (!v) return;
        v.volume = ratio;
        v.muted = ratio === 0;
        this.volume.set(ratio);
        this.isMuted.set(ratio === 0);
        try {
            localStorage.setItem('sp:volume', String(ratio));
        } catch { }
    }

    onProgressMouseDown(e: MouseEvent): void {
        e.preventDefault();
        const bar = this.progressRef()?.nativeElement;
        const v = this.videoRef()?.nativeElement;
        if (!bar || !v || !v.duration) return;
        this.isDragging = true;
        const rect = bar.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        v.currentTime = ratio * v.duration;
        this.progress.set(ratio * 100);
    }

    onProgressTouchStart(e: TouchEvent): void {
        const bar = this.progressRef()?.nativeElement;
        const v = this.videoRef()?.nativeElement;
        if (!bar || !v || !v.duration || !e.touches[0]) return;
        this.isDragging = true;
        const rect = bar.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.touches[0].clientX - rect.left) / rect.width));
        v.currentTime = ratio * v.duration;
        this.progress.set(ratio * 100);
    }

    private onDocumentMouseMove(e: MouseEvent): void {
        if (!this.isDragging) return;
        const bar = this.progressRef()?.nativeElement;
        const v = this.videoRef()?.nativeElement;
        if (!bar || !v || !v.duration) return;
        const rect = bar.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        v.currentTime = ratio * v.duration;
        this.progress.set(ratio * 100);
    }

    private onDocumentTouchMove(e: TouchEvent): void {
        if (!this.isDragging || !e.touches[0]) return;
        const bar = this.progressRef()?.nativeElement;
        const v = this.videoRef()?.nativeElement;
        if (!bar || !v || !v.duration) return;
        const rect = bar.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.touches[0].clientX - rect.left) / rect.width));
        v.currentTime = ratio * v.duration;
        this.progress.set(ratio * 100);
    }

    togglePip(): void {
        const v = this.videoRef()?.nativeElement;
        if (!v) return;
        if (document.pictureInPictureElement) {
            document.exitPictureInPicture().catch((_err: unknown) => undefined);
        } else {
            const el = v as HTMLVideoElement & { requestPictureInPicture?: () => Promise<void> };
            if (el.requestPictureInPicture) {
                el.requestPictureInPicture().catch((_err: unknown) => undefined);
            }
        }
    }

    setSpeed(s: number): void {
        const v = this.videoRef()?.nativeElement;
        if (!v) return;
        v.playbackRate = s;
        this.speed.set(s);
        this.showSpeedMenu.set(false);
    }

    setQuality(q: string): void {
        this.showQualityMenu.set(false);
        if (q === this.currentQuality()) return;
        const streams = this.streams();
        if (!streams?.[q]) return;
        const v = this.videoRef()?.nativeElement;
        const savedTime = v ? v.currentTime : 0;
        this.currentQuality.set(q);
        this.loadUrl(streams[q], savedTime > TIMING_MIN_S ? savedTime : 0);
        this.writeQualityPref(q);
    }

    toggleFullscreen(): void {
        const el = this.containerRef()?.nativeElement;
        if (!el) return;
        if (!document.fullscreenElement) el.requestFullscreen();
        else document.exitFullscreen();
    }

    skip(seconds: number): void {
        const v = this.videoRef()?.nativeElement;
        if (!v) return;
        v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + seconds));
    }

    // ── Skip opening / ending ────────────────────────────────────────────────────

    skipToEnd(): void {
        const v = this.videoRef()?.nativeElement;
        if (!this.currentSkipInterval || !v) return;
        v.currentTime = this.currentSkipInterval.end;
    }

    private updateSkipButton(inSkip: SkipInterval | null): void {
        const btn = this.skipBtnRef()?.nativeElement;
        const lbl = this.skipLabelRef()?.nativeElement;
        if (!btn) return;
        if (inSkip) {
            if (lbl) lbl.textContent = inSkip.type === 'op' ? 'Пропустить опенинг' : 'Пропустить эндинг';
            btn.style.display = 'flex';
        } else {
            btn.style.display = 'none';
        }
        this.currentSkipInterval = inSkip;
    }

    private async fetchSkipTimes(animeId: string, episode: number): Promise<void> {
        try {
            const url = `${ANISKIP_URL}/${animeId}/${episode}?types[]=op&types[]=ed&episodeLength=0`;
            const resp = await this.zone.runOutsideAngular(() =>
                fetch(url, { signal: AbortSignal.timeout(8000) }),
            );
            if (!resp.ok) {
                this.zone.run(() => this.skipIntervals.set([])); return;
            }
            const data = await resp.json();
            const intervals: SkipInterval[] = data.found && Array.isArray(data.results)
                ? data.results.map((r: { interval: { start_time: number; end_time: number }; skip_type: string }) => ({
                    start: r.interval.start_time,
                    end: r.interval.end_time,
                    type: r.skip_type as 'op' | 'ed',
                }))
                : [];
            this.zone.run(() => {
                this.skipIntervals.set(intervals);
                this.cdr.markForCheck();
            });
        } catch {
            this.zone.run(() => this.skipIntervals.set([]));
        }
    }

    // ── Timing ───────────────────────────────────────────────────────────────────

    private timingKey_(): string | null {
        const k = this.timingKey();
        return k ? TIMING_PREFIX + k : null;
    }

    private readTiming(): number | null {
        const k = this.timingKey_();
        if (!k) return null;
        try {
            const v = localStorage.getItem(k); return v !== null ? parseFloat(v) : null;
        } catch {
            return null;
        }
    }

    private maybeSaveTiming(t: number, dur: number): void {
        if (!this.timingKey_()) return;
        if (t < TIMING_MIN_S) return;
        if (dur > 0 && t > dur - TIMING_NEAR_END_S) return;
        if (t - this.lastSavedTime < TIMING_SAVE_EVERY_S) return;
        this.lastSavedTime = t;
        try {
            localStorage.setItem(this.timingKey_(), String(t));
        } catch { }
    }

    private clearTiming(): void {
        const k = this.timingKey_();
        if (k) {
            try {
                localStorage.removeItem(k);
            } catch { }
        }
    }

    // ── Auto-skip preference ──────────────────────────────────────────────────────

    private readVolumePref(): number {
        try {
            const v = parseFloat(localStorage.getItem('sp:volume') ?? '1');
            return isNaN(v) ? 1 : Math.max(0, Math.min(1, v));
        } catch {
            return 1;
        }
    }

    private readAutoSkipPref(): boolean {
        try {
            return localStorage.getItem('sp:autoskip') === '1';
        } catch {
            return false;
        }
    }

    toggleAutoSkip(): void {
        const next = !this.autoSkip();
        this.autoSkip.set(next);
        try {
            localStorage.setItem('sp:autoskip', next ? '1' : '0');
        } catch { }
    }

    // ── Quality preference ────────────────────────────────────────────────────────

    private readQualityPref(): string | null {
        try {
            return localStorage.getItem('sp:quality') || null;
        } catch {
            return null;
        }
    }

    private writeQualityPref(q: string): void {
        try {
            localStorage.setItem('sp:quality', q);
        } catch { }
    }

    // ── Keyboard ──────────────────────────────────────────────────────────────────

    private onKeydown(e: KeyboardEvent): void {
        const active = document.activeElement?.tagName;
        if (active === 'INPUT' || active === 'TEXTAREA') return;
        if (!this.videoRef()?.nativeElement) return;

        switch (e.code) {
            case 'Space': e.preventDefault(); this.togglePlay(); break;
            case 'ArrowRight': e.preventDefault(); this.skip(5); break;
            case 'ArrowLeft': e.preventDefault(); this.skip(-5); break;
            case 'ArrowUp': e.preventDefault(); this.setVolume(Math.min(1, this.volume() + 0.1)); break;
            case 'ArrowDown': e.preventDefault(); this.setVolume(Math.max(0, this.volume() - 0.1)); break;
            case 'KeyM': this.toggleMute(); break;
            case 'KeyF': this.toggleFullscreen(); break;
            case 'KeyP': this.togglePip(); break;
        }
        this.activity$.next();
    }
}
