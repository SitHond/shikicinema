import {
    ChangeDetectionStrategy,
    Component,
    HostListener,
    OnDestroy,
    ViewEncapsulation,
    computed,
    effect,
    inject,
    input,
    output,
    signal,
} from '@angular/core';
import { IonButton, IonIcon, IonSpinner, IonText } from '@ionic/angular/standalone';
import { Observable, catchError, of } from 'rxjs';

import { MangaDexService } from '@app/modules/manga/services/mangadex.service';
import { MangaImageCacheService } from '@app/modules/manga/services/manga-image-cache.service';
import { MangaLibService } from '@app/modules/manga/services/mangalib.service';
import { MangaSource, ReaderPage } from '@app/modules/manga/types/manga-source.types';
import { ReadMangaService } from '@app/modules/manga/services/readmanga.service';
import { RemangaService } from '@app/modules/manga/services/remanga.service';

@Component({
    selector: 'app-chapter-reader',
    templateUrl: './chapter-reader.component.html',
    styleUrl: './chapter-reader.component.scss',
    imports: [IonButton, IonIcon, IonSpinner, IonText],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    host: { class: 'chapter-reader' },
})
export class ChapterReaderComponent implements OnDestroy {
    private readonly mangalib = inject(MangaLibService);
    private readonly mangadex = inject(MangaDexService);
    private readonly remanga = inject(RemangaService);
    private readonly readmanga = inject(ReadMangaService);
    private readonly imageCache = inject(MangaImageCacheService);

    readonly source = input<MangaSource>('mangalib');
    readonly chapterId = input<string>('');
    // MangaLib-specific (also used as ReadManga fallback)
    readonly slug = input<string>('');
    readonly volume = input<string>('1');
    readonly number = input<string>('1');
    readonly isRead = input<boolean>(false);

    readonly markAsRead = output<void>();
    readonly prevChapter = output<void>();
    readonly nextChapter = output<void>();

    readonly pages = signal<ReaderPage[]>([]);
    readonly currentIndex = signal(0);
    readonly isLoading = signal(true);
    readonly isImageLoading = signal(false);
    readonly hasError = signal(false);
    readonly currentImageUrl = signal<string>('');

    private readonly sessionCache = new Map<string, string>();
    private readonly preloadInProgress = new Set<string>();

    readonly currentPage = computed(() => this.pages()[this.currentIndex()] ?? null);
    readonly total = computed(() => this.pages().length);
    readonly isFirst = computed(() => this.currentIndex() === 0);
    readonly isLast = computed(() => this.currentIndex() >= this.total() - 1);

    readonly loadEffect = effect(() => {
        const source = this.source();
        const chapterId = this.chapterId();
        const slug = this.slug();
        const volume = this.volume();
        const number = this.number();

        this.pages.set([]);
        this.currentIndex.set(0);
        this.isLoading.set(true);
        this.hasError.set(false);
        this.currentImageUrl.set('');
        this.sessionCache.clear();

        this.getPages$(source, chapterId, slug, volume, number).pipe(
            catchError(() => {
                this.hasError.set(true);
                return of([] as ReaderPage[]);
            }),
        ).subscribe((pages) => {
            if (!pages.length) this.hasError.set(true);
            this.pages.set(pages);
            this.isLoading.set(false);
        });
    }, { allowSignalWrites: true });

    readonly imageEffect = effect(() => {
        const page = this.currentPage();
        if (!page || this.isLoading()) return;

        const cached = this.sessionCache.get(page.id);
        if (cached) {
            this.currentImageUrl.set(cached);
            this.schedulePreload(this.currentIndex());
            return;
        }

        this.isImageLoading.set(true);
        const cacheKey = this.cacheKeyFor(page);

        this.imageCache.get(cacheKey).then((persisted) => {
            if (persisted) {
                this.sessionCache.set(page.id, persisted);
                if (this.currentPage()?.id === page.id) {
                    this.currentImageUrl.set(persisted);
                    this.schedulePreload(this.currentIndex());
                }
                this.isImageLoading.set(false);
                return;
            }
            this.fetchAndCache(page);
        });
    }, { allowSignalWrites: true });

    private getPages$(
        source: MangaSource,
        chapterId: string,
        slug: string,
        volume: string,
        number: string,
    ): Observable<ReaderPage[]> {
        switch (source) {
            case 'mangadex':
                return this.mangadex.getPages(chapterId);
            case 'remanga':
                return this.remanga.getPages(chapterId);
            case 'readmanga':
                return this.readmanga.getPages(slug, volume, number);
            default:
                return this.mangalib.getChapterPages(slug, volume, number).pipe(
                    catchError(() => of([])),
                    // map MangaLibPage → ReaderPage
                    (obs) => new Observable<ReaderPage[]>((subscriber) =>
                        obs.subscribe({
                            next: (pages) => subscriber.next(
                                pages.map((p) => ({
                                    id: String(p.slug),
                                    url: this.mangalib.absoluteImageUrl(p.url || p.image),
                                })),
                            ),
                            error: (e) => subscriber.error(e),
                            complete: () => subscriber.complete(),
                        }),
                    ),
                );
        }
    }

    private fetchAndCache(page: ReaderPage): void {
        const msg = this.proxyMessage(page.url);

        chrome.runtime.sendMessage(msg, (response: { ok: boolean; dataUrl?: string; error?: string }) => {
            if (response?.ok && response.dataUrl) {
                const dataUrl = response.dataUrl;
                this.sessionCache.set(page.id, dataUrl);

                if (this.currentPage()?.id === page.id) {
                    this.currentImageUrl.set(dataUrl);
                    this.schedulePreload(this.currentIndex());
                }

                this.imageCache
                    .set(this.cacheKeyFor(page), dataUrl)
                    .catch(() => undefined);
            } else {
                console.error('[manga] fetch failed:', response?.error ?? chrome.runtime.lastError?.message);
            }
            this.isImageLoading.set(false);
        });
    }

    private schedulePreload(fromIndex: number): void {
        const pages = this.pages();
        for (let i = fromIndex + 1; i <= fromIndex + 2 && i < pages.length; i++) {
            this.preloadPage(pages[i]);
        }
    }

    private preloadPage(page: ReaderPage): void {
        if (this.sessionCache.has(page.id) || this.preloadInProgress.has(page.id)) return;

        this.preloadInProgress.add(page.id);
        const cacheKey = this.cacheKeyFor(page);

        this.imageCache.get(cacheKey).then((persisted) => {
            if (persisted) {
                this.sessionCache.set(page.id, persisted);
                this.preloadInProgress.delete(page.id);
                return;
            }

            chrome.runtime.sendMessage(
                this.proxyMessage(page.url),
                (response: { ok: boolean; dataUrl?: string }) => {
                    this.preloadInProgress.delete(page.id);
                    if (response?.ok && response.dataUrl) {
                        this.sessionCache.set(page.id, response.dataUrl);
                        this.imageCache.set(cacheKey, response.dataUrl).catch(() => undefined);
                    }
                },
            );
        });
    }

    private proxyMessage(url: string): object {
        const source = this.source();
        if (source === 'mangalib') return { type: 'PROXY_IMAGE', url };
        const headers: Record<string, string> = {};
        if (source === 'remanga') headers['Referer'] = 'https://remanga.org';
        if (source === 'readmanga') headers['Referer'] = 'https://readmanga.live';
        return { type: 'FETCH_IMAGE', url, headers };
    }

    private cacheKeyFor(page: ReaderPage): string {
        const src = this.source();
        if (src === 'mangalib') {
            return `mangalib/${this.slug()}/v${this.volume()}/c${this.number()}/${page.id}`;
        }
        return `${src}/${this.chapterId() || this.slug()}/${page.id}`;
    }

    ngOnDestroy(): void {
        this.sessionCache.clear();
        this.preloadInProgress.clear();
    }

    @HostListener('window:keydown', ['$event'])
    onKey(e: KeyboardEvent): void {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') this.next();
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') this.prev();
    }

    next(): void {
        if (!this.isLast()) this.currentIndex.update((i) => i + 1);
    }

    prev(): void {
        if (!this.isFirst()) this.currentIndex.update((i) => i - 1);
    }
}
