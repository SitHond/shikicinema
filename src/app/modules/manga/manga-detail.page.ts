import { ActivatedRoute, RouterLink } from '@angular/router';
import {
    ChangeDetectionStrategy,
    Component,
    OnInit,
    ViewEncapsulation,
    computed,
    inject,
    signal,
} from '@angular/core';
import { IonButton, IonContent, IonIcon, IonInput, IonProgressBar, IonText } from '@ionic/angular/standalone';
import { RepeatPipe } from 'ngxtension/repeat-pipe';
import { Store } from '@ngrx/store';
import { Title } from '@angular/platform-browser';
import { UpperCasePipe } from '@angular/common';
import { catchError, combineLatest, map, of } from 'rxjs';

import { MangaCatalogService, ParsedMangaUrl, parseMangaUrl } from '@app/modules/manga/services/manga-catalog.service';
import { MangaDexService } from '@app/modules/manga/services/mangadex.service';
import { MangaLibChapter, MangaLibTitle } from '@app/modules/manga/types/mangalib.types';
import { MangaLibService } from '@app/modules/manga/services/mangalib.service';
import { MangaSource, SourceChapter, SourceTitle } from '@app/modules/manga/types/manga-source.types';
import { ReadMangaService } from '@app/modules/manga/services/readmanga.service';
import { RemangaService } from '@app/modules/manga/services/remanga.service';
import { ShikimoriClient } from '@app/shared/services';
import { SkeletonBlockComponent } from '@app/shared/components/skeleton-block/skeleton-block.component';
import { UserMangaRate } from '@app/shared/types/shikimori';
import { UserRateTargetEnum } from '@app/shared/types/shikimori/user-rate-target.enum';
import {
    selectShikimoriCurrentUserId,
    selectShikimoriCurrentUserNickname,
} from '@app/store/shikimori/selectors/shikimori.selectors';

const SOURCE_LABELS: Record<MangaSource, string> = {
    mangalib: 'MangaLib',
    mangadex: 'MangaDex',
    remanga: 'Remanga',
    readmanga: 'ReadManga',
};

@Component({
    selector: 'app-manga-detail-page',
    templateUrl: './manga-detail.page.html',
    styleUrl: './manga-detail.page.scss',
    imports: [
        IonContent, IonButton, IonIcon, IonInput, IonProgressBar, IonText,
        RouterLink, SkeletonBlockComponent, RepeatPipe, UpperCasePipe,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    host: { class: 'manga-detail-page' },
})
export class MangaDetailPage implements OnInit {
    private readonly route = inject(ActivatedRoute);
    private readonly store = inject(Store);
    private readonly shikimori = inject(ShikimoriClient);
    private readonly mangalib = inject(MangaLibService);
    private readonly mangadex = inject(MangaDexService);
    private readonly remanga = inject(RemangaService);
    private readonly readmanga = inject(ReadMangaService);
    private readonly catalog = inject(MangaCatalogService);
    private readonly titleService = inject(Title);

    readonly mangaId = this.route.snapshot.params['mangaId'] as string;

    private readonly currentUserId = this.store.selectSignal(selectShikimoriCurrentUserId);
    private readonly currentUserNickname = this.store.selectSignal(selectShikimoriCurrentUserNickname);

    readonly rate = signal<UserMangaRate | null>((history.state as any)?.rate ?? null);
    readonly activeTitle = signal<SourceTitle | null>(null);
    readonly chapters = signal<SourceChapter[]>([]);

    readonly isLoadingRate = signal(!this.rate());
    readonly isLoadingChapters = signal(false);
    readonly noSourceResult = signal(false);
    readonly sourceLabel = signal<string>('');

    readonly manualUrlInput = signal('');
    readonly manualUrlError = signal('');
    readonly manualUrlLoading = signal(false);

    readonly mangaName = computed(() => {
        const r = this.rate();
        return r ? r.manga.russian || r.manga.name : '';
    });

    readonly readChaptersCount = computed(() => this.rate()?.chapters ?? 0);

    readonly totalChapters = computed(
        () => this.activeTitle()?.chaptersCount ?? this.rate()?.manga.chapters ?? 0,
    );

    ngOnInit(): void {
        // Direct source route: mangaId = "src~mangalib~slug"
        const srcMatch = this.mangaId.match(/^src~(mangalib|readmanga|remanga)~(.+)$/);
        if (srcMatch) {
            const [, source, slug] = srcMatch as [string, MangaSource, string];
            this.titleService.setTitle(`${slug}`);
            this.isLoadingRate.set(false);
            this.loadDirectSource(source, slug);
            return;
        }

        const rate = this.rate();
        if (rate) {
            this.titleService.setTitle(rate.manga.russian || rate.manga.name);
            this.loadSource(rate.manga.name, rate.manga.russian);
            return;
        }

        const userId = this.currentUserId();
        if (!userId || !this.mangaId) {
            this.isLoadingRate.set(false);
            return;
        }

        this.shikimori
            .getUserRate(userId, this.mangaId, UserRateTargetEnum.MANGA)
            .pipe(catchError(() => of([])))
            .subscribe((rates) => {
                const found = (rates as unknown as UserMangaRate[])[0] ?? null;
                this.rate.set(found);
                this.isLoadingRate.set(false);

                if (found) {
                    this.titleService.setTitle(found.manga.russian || found.manga.name);
                    this.loadSource(found.manga.name, found.manga.russian);
                }
            });
    }

    onSubmitManualUrl(): void {
        const url = this.manualUrlInput().trim();
        if (!url || this.manualUrlLoading()) return;

        const parsed = parseMangaUrl(url);
        if (!parsed || parsed.source !== 'mangalib') {
            this.manualUrlError.set('Вставьте ссылку с MangaLib (mangalib.me или lib.social).');
            return;
        }

        const expectedRu = this.rate()?.manga.russian || '';
        const expectedEn = this.rate()?.manga.name || '';
        if (!expectedRu && !expectedEn) {
            this.applyManualSource(parsed);
            return;
        }

        // All known names for this manga from Shikimori (Russian + English)
        const expectedNames = [expectedRu, expectedEn].filter(Boolean);
        const anyNameMatches = (foundNames: string[]) =>
            foundNames.some((found) => expectedNames.some((exp) => this.mangaNamesMatch(exp, found)));

        // Fast path: slug text directly encodes the manga name (e.g. "soul_eater" → "soul eater" = "Soul Eater")
        const slugText = parsed.slug.replace(/^\d+--/, '').replace(/[-_]/g, ' ');
        const slugNorm = this.normalize(slugText);
        if (expectedNames.some((n) => this.normalize(n) === slugNorm)) {
            this.applyManualSource(parsed);
            return;
        }

        this.manualUrlLoading.set(true);
        this.manualUrlError.set('');

        this.mangalib.getMangaBySlug(parsed.slug).pipe(
            catchError(() => of(null)),
        ).subscribe((title) => {
            if (title) {
                this.manualUrlLoading.set(false);
                const foundNames = [title.rus_name, title.name].filter(Boolean);
                if (anyNameMatches(foundNames)) {
                    this.applyManualSource(parsed);
                } else {
                    this.manualUrlError.set(`Манга не совпадает: по ссылке найдено «${title.rus_name || title.name}»`);
                }
                return;
            }

            // getMangaBySlug returned 404 (new slug format) — verify via search
            // Search 1: by Russian name → slug match
            this.mangalib.search(expectedRu || expectedEn).pipe(catchError(() => of([]))).subscribe((byName) => {
                const matchedByName = byName.find((t) => this.slugsMatch(parsed.slug, t.slug_url));
                if (matchedByName) {
                    this.manualUrlLoading.set(false);
                    this.applyManualSource(parsed);
                    return;
                }

                // Search 2: by slug text → slug match or name match (handles ru/en mismatch)
                const slugText = parsed.slug.replace(/^\d+--/, '').replace(/[-_]/g, ' ');
                this.mangalib.search(slugText).pipe(catchError(() => of([]))).subscribe((bySlug) => {
                    this.manualUrlLoading.set(false);

                    // 2a: exact slug match → verify name
                    const matchedBySlug = bySlug.find((t) => this.slugsMatch(parsed.slug, t.slug_url));
                    if (matchedBySlug) {
                        const foundNames = [matchedBySlug.rus_name, matchedBySlug.name].filter(Boolean);
                        if (anyNameMatches(foundNames)) {
                            this.applyManualSource(parsed);
                        } else {
                            const foundName = matchedBySlug.rus_name || matchedBySlug.name;
                            this.manualUrlError.set(`Манга не совпадает: по ссылке найдено «${foundName}»`);
                        }
                        return;
                    }

                    // 2b: no exact slug match — check if any result's name matches (ru or en)
                    const nameMatched = bySlug.find((t) => {
                        const foundNames = [t.rus_name, t.name].filter(Boolean);
                        return anyNameMatches(foundNames);
                    });
                    if (nameMatched) {
                        this.applyManualSource(parsed);
                        return;
                    }

                    if (bySlug.length > 0) {
                        this.manualUrlError.set('Манга не совпадает: указанная ссылка ведёт на другую мангу.');
                    } else {
                        this.manualUrlError.set('Не удалось проверить ссылку. Попробуйте позже.');
                    }
                });
            });
        });
    }

    private applyManualSource(parsed: ParsedMangaUrl): void {
        this.manualUrlError.set('');
        this.noSourceResult.set(false);
        const name = this.rate()?.manga.russian || this.rate()?.manga.name || parsed.slug;
        const rawCover = this.rate()?.manga.image?.original ?? '';
        const cover = rawCover.startsWith('http') ? rawCover : rawCover ? `https://shikimori.rip${rawCover}` : '';
        this.catalog.add({
            source: parsed.source,
            slug: parsed.slug,
            name,
            cover_url: cover,
            added_by: this.currentUserNickname() ?? 'Аноним',
            shikimori_id: this.mangaId.startsWith('src~') ? '' : this.mangaId,
        }).pipe(catchError(() => of(null))).subscribe();
        this.loadDirectSource(parsed.source, parsed.slug);
    }

    // Handles "255--soul_eater" vs "soul-eater": strips numeric prefix, normalizes _ to -
    private slugsMatch(provided: string, result: string): boolean {
        const norm = (s: string) => s.replace(/_/g, '-').toLowerCase();
        const np = norm(provided);
        const nr = norm(result);
        if (np === nr) return true;
        const textPart = np.replace(/^\d+--/, '');
        return textPart === nr;
    }

    private mangaNamesMatch(a: string, b: string): boolean {
        const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
        const na = norm(a);
        const nb = norm(b);
        if (na === nb || na.includes(nb) || nb.includes(na)) return true;
        const wordsA = new Set(na.split(' ').filter((w) => w.length > 2));
        const wordsB = new Set(nb.split(' ').filter((w) => w.length > 2));
        if (!wordsA.size || !wordsB.size) return false;
        let common = 0;
        for (const w of wordsA) if (wordsB.has(w)) common++;
        return common / Math.max(wordsA.size, wordsB.size) >= 0.5;
    }

    isChapterRead(ch: SourceChapter): boolean {
        return ch.index <= this.readChaptersCount();
    }

    chapterLabel(ch: SourceChapter): string {
        const vol = ch.volume ? `Том ${ch.volume} ` : '';
        const num = `Глава ${ch.number}`;
        return ch.name ? `${vol}${num} — ${ch.name}` : `${vol}${num}`;
    }

    coverUrl(): string {
        const titleCover = this.activeTitle()?.coverUrl;
        if (titleCover) return titleCover;
        const rateImg = this.rate()?.manga.image?.original ?? '';
        if (rateImg) return rateImg.startsWith('http') ? rateImg : `https://shikimori.rip${rateImg}`;
        return '';
    }

    // ── Direct source (no Shikimori) ───────────────────────────────────────────

    private loadDirectSource(source: MangaSource, slug: string): void {
        this.isLoadingChapters.set(true);
        this.noSourceResult.set(false);
        this.sourceLabel.set(SOURCE_LABELS[source]);

        if (source === 'mangalib') {
            combineLatest([
                this.mangalib.getMangaBySlug(slug).pipe(catchError(() => of(null))),
                this.mangalib.getChapters(slug).pipe(catchError(() => of([]))),
            ]).subscribe(([title, chapters]) => {
                if (!chapters.length) {
                    this.onNoResult(); return;
                }
                if (title) {
                    this.titleService.setTitle(title.rus_name || title.name);
                    this.setMangaLibResult(title, chapters);
                } else {
                    this.setResult(
                        { source: 'mangalib', id: slug, slug, name: slug },
                        this.mlChaptersToSource(chapters),
                    );
                }
            });
            return;
        }
        if (source === 'remanga') {
            this.remanga.getChapters(slug).pipe(catchError(() => of([]))).subscribe((chapters) => {
                if (chapters.length) {
                    this.setResult({ source: 'remanga', id: slug, slug, name: slug }, chapters);
                } else {
                    this.onNoResult();
                }
            });
            return;
        }
        if (source === 'readmanga') {
            this.readmanga.getChapters(slug).pipe(catchError(() => of([]))).subscribe((chapters) => {
                if (chapters.length) {
                    this.setResult({ source: 'readmanga', id: slug, slug, name: slug }, chapters);
                } else {
                    this.onNoResult();
                }
            });
            return;
        }
        this.onNoResult();
    }

    // ── Source loading ─────────────────────────────────────────────────────────

    private loadSource(englishName: string, russianName?: string): void {
        this.isLoadingChapters.set(true);
        this.noSourceResult.set(false);

        // Step 0: check community catalog cache
        this.catalog.list({ shikimori_id: this.mangaId, limit: 1 }).pipe(
            catchError(() => of({ items: [], total: 0 })),
        ).subscribe((res) => {
            if (res.items.length) {
                const entry = res.items[0];
                this.loadDirectSource(entry.source, entry.slug);
                return;
            }
            this.doLoadSource(englishName, russianName);
        });
    }

    private doLoadSource(englishName: string, russianName?: string): void {
        // Step 1: try Shikimori external links first (fastest path)
        this.shikimori.getMangaExternalLinks(this.mangaId).pipe(
            catchError(() => of([])),
        ).subscribe((links) => {
            const mangalibSlug = this.extractSlug(links, ['mangalib', 'cdnlibs'], '/manga/');
            if (mangalibSlug) {
                this.loadMangaLibBySlug(mangalibSlug, englishName, russianName);
                return;
            }

            const remangaSlug = this.extractSlug(links, ['remanga.org'], '/manga/');
            if (remangaSlug) {
                this.loadRemangaBySlug(remangaSlug, englishName, russianName);
                return;
            }

            const mangadexId = this.extractSlug(links, ['mangadex.org'], '/title/');
            if (mangadexId) {
                this.loadMangaDexById(mangadexId, englishName, russianName);
                return;
            }

            // Step 2: search fallback chain
            const candidates = this.buildSearchCandidates(englishName, russianName);
            this.tryMangaLibSearch(candidates, 0, () =>
                this.tryRemangaSearch(candidates, 0, () =>
                    this.tryMangaDexSearch(candidates, 0, () =>
                        this.tryReadMangaSearch(candidates, 0, () =>
                            this.onNoResult(),
                        ),
                    ),
                ),
            );
        });
    }

    // ── MangaLib ───────────────────────────────────────────────────────────────

    private loadMangaLibBySlug(slug: string, en: string, ru?: string): void {
        combineLatest([
            this.mangalib.getMangaBySlug(slug).pipe(catchError(() => of(null))),
            this.mangalib.getChapters(slug).pipe(catchError(() => of([]))),
        ]).subscribe(([title, chapters]) => {
            if (chapters.length) {
                if (title) {
                    this.setMangaLibResult(title, chapters);
                } else {
                    this.setResult(
                        { source: 'mangalib', id: slug, slug, name: en, russianName: ru },
                        this.mlChaptersToSource(chapters),
                    );
                }
            } else {
                this.tryMangaLibSearch(this.buildSearchCandidates(en, ru), 0, () => this.onNoResult());
            }
        });
    }

    private tryMangaLibSearch(candidates: string[], index: number, onFail: () => void): void {
        if (index >= candidates.length) {
            onFail(); return;
        }

        const query = candidates[index];
        this.mangalib.search(query).pipe(
            map((titles) => this.findBestMatch(
                titles,
                query,
                (t) => [t.name, t.rus_name, t.eng_name].filter(Boolean) as string[],
            )),
            catchError(() => of(null)),
        ).subscribe((found) => {
            if (found) {
                this.mangalib.getChapters(found.slug_url).pipe(
                    catchError(() => of([])),
                ).subscribe((chapters) => this.setMangaLibResult(found, chapters));
            } else {
                this.tryMangaLibSearch(candidates, index + 1, onFail);
            }
        });
    }

    private mlChaptersToSource(chapters: MangaLibChapter[]): SourceChapter[] {
        return chapters.map((ch) => ({
            id: String(ch.id),
            index: ch.index,
            volume: ch.volume,
            number: ch.number,
            name: ch.name ?? undefined,
        }));
    }

    private setMangaLibResult(title: MangaLibTitle, chapters: MangaLibChapter[]): void {
        const mlImg = title.cover?.default ?? title.cover?.thumbnail ?? '';
        const sourceTitle: SourceTitle = {
            source: 'mangalib',
            id: String(title.id),
            slug: title.slug_url,
            name: title.name,
            russianName: title.rus_name,
            coverUrl: mlImg ? this.mangalib.absoluteImageUrl(mlImg) : undefined,
            chaptersCount: title.chapters_count,
            rating: title.rating?.average,
            kind: title.type?.label,
        };
        this.setResult(sourceTitle, this.mlChaptersToSource(chapters));
    }

    // ── Remanga ────────────────────────────────────────────────────────────────

    private loadRemangaBySlug(slug: string, en: string, ru?: string): void {
        this.remanga.getChapters(slug).pipe(catchError(() => of([]))).subscribe((chapters) => {
            if (chapters.length) {
                this.setResult(
                    { source: 'remanga', id: slug, slug, name: en, russianName: ru },
                    chapters,
                );
            } else {
                this.tryRemangaSearch(this.buildSearchCandidates(en, ru), 0, () => this.onNoResult());
            }
        });
    }

    private tryRemangaSearch(candidates: string[], index: number, onFail: () => void): void {
        if (index >= candidates.length) {
            onFail(); return;
        }

        const query = candidates[index];
        this.remanga.search(query).pipe(catchError(() => of([]))).subscribe((titles) => {
            const found = this.findBestMatch(
                titles,
                query,
                (t) => [t.name, t.russianName].filter(Boolean) as string[],
            );
            if (found) {
                this.remanga.getChapters(found.slug).pipe(
                    catchError(() => of([])),
                ).subscribe((chapters) => {
                    if (chapters.length) {
                        this.setResult(found, chapters);
                    } else {
                        this.tryRemangaSearch(candidates, index + 1, onFail);
                    }
                });
            } else {
                this.tryRemangaSearch(candidates, index + 1, onFail);
            }
        });
    }

    // ── MangaDex ───────────────────────────────────────────────────────────────

    private loadMangaDexById(id: string, en: string, ru?: string): void {
        this.mangadex.getChapters(id).pipe(catchError(() => of([]))).subscribe((chapters) => {
            if (chapters.length) {
                this.setResult(
                    { source: 'mangadex', id, slug: id, name: en, russianName: ru },
                    chapters,
                );
            } else {
                this.tryMangaDexSearch(this.buildSearchCandidates(en, ru), 0, () => this.onNoResult());
            }
        });
    }

    private tryMangaDexSearch(candidates: string[], index: number, onFail: () => void): void {
        if (index >= candidates.length) {
            onFail(); return;
        }

        const query = candidates[index];
        this.mangadex.search(query).pipe(catchError(() => of([]))).subscribe((titles) => {
            const found = this.findBestMatch(
                titles,
                query,
                (t) => [t.name, t.russianName].filter(Boolean) as string[],
            );
            if (found) {
                this.mangadex.getChapters(found.id).pipe(
                    catchError(() => of([])),
                ).subscribe((chapters) => {
                    if (chapters.length) {
                        this.setResult(found, chapters);
                    } else {
                        this.tryMangaDexSearch(candidates, index + 1, onFail);
                    }
                });
            } else {
                this.tryMangaDexSearch(candidates, index + 1, onFail);
            }
        });
    }

    // ── ReadManga ──────────────────────────────────────────────────────────────

    private tryReadMangaSearch(candidates: string[], index: number, onFail: () => void): void {
        if (index >= candidates.length) {
            onFail(); return;
        }

        const query = candidates[index];
        this.readmanga.search(query).pipe(catchError(() => of([]))).subscribe((titles) => {
            const found = this.findBestMatch(
                titles,
                query,
                (t) => [t.name, t.russianName].filter(Boolean) as string[],
            );
            if (found) {
                this.readmanga.getChapters(found.slug).pipe(
                    catchError(() => of([])),
                ).subscribe((chapters) => {
                    if (chapters.length) {
                        this.setResult(found, chapters);
                    } else {
                        this.tryReadMangaSearch(candidates, index + 1, onFail);
                    }
                });
            } else {
                this.tryReadMangaSearch(candidates, index + 1, onFail);
            }
        });
    }

    // ── Shared helpers ─────────────────────────────────────────────────────────

    private setResult(title: SourceTitle, chapters: SourceChapter[]): void {
        this.activeTitle.set(title);
        this.chapters.set(chapters);
        this.sourceLabel.set(SOURCE_LABELS[title.source]);
        this.isLoadingChapters.set(false);

        // Cache to DB for other users (only for Shikimori-linked manga, not direct src~ routes)
        if (this.mangaId && !this.mangaId.startsWith('src~')) {
            const name = this.rate()?.manga.russian || this.rate()?.manga.name || title.name;
            const cover = this.coverUrl();
            this.catalog.add({
                source: title.source,
                slug: title.slug,
                name,
                cover_url: cover,
                added_by: this.currentUserNickname() ?? '',
                shikimori_id: this.mangaId,
            }).pipe(catchError(() => of(null))).subscribe();
        }
    }

    private onNoResult(): void {
        this.noSourceResult.set(true);
        this.isLoadingChapters.set(false);
    }

    private extractSlug(links: { url: string }[], domains: string[], pathPrefix: string): string | null {
        const link = links.find((l) => domains.some((d) => l.url.includes(d)));
        if (!link) return null;
        const match = link.url.match(new RegExp(pathPrefix.replace('/', '\\/') + '([^/?#]+)'));
        return match?.[1] ?? null;
    }

    private buildSearchCandidates(englishName: string, russianName?: string): string[] {
        const candidates: string[] = [];
        const add = (s: string | undefined) => {
            const t = s?.trim();
            if (t && !candidates.includes(t)) candidates.push(t);
        };

        if (russianName) add(russianName);
        add(englishName);
        if (russianName) add(russianName.replace(/\s+\d+$/, '').trim());
        add(englishName.replace(/\s+\d+$/, '').trim());
        if (russianName) add(russianName.replace(/[:\-–].*$/, '').trim());
        add(englishName.replace(/[:\-–].*$/, '').trim());
        add(englishName.split(' ').slice(0, 3).join(' '));

        return candidates;
    }

    private findBestMatch<T>(items: T[], query: string, getNames: (item: T) => string[]): T | null {
        if (!items.length) return null;

        const q = this.normalize(query);
        const namesOf = (item: T) => getNames(item).map((n) => this.normalize(n));

        const exact = items.find((t) => namesOf(t).some((n) => n === q));
        if (exact) return exact;

        const starts = items.find((t) => namesOf(t).some((n) => n.startsWith(q)));
        if (starts) return starts;

        const contains = items.find((t) => namesOf(t).some((n) => n.includes(q)));
        if (contains) return contains;

        const reverse = items.find((t) => namesOf(t).some((n) => n.length > 3 && q.includes(n)));
        return reverse ?? null;
    }

    private normalize(s: string): string {
        return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
    }
}
