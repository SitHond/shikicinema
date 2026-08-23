import * as usedIcons from '@app/core/used-icons.config';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import {
    ChangeDetectionStrategy,
    Component,
    DOCUMENT,
    DestroyRef,
    OnInit,
    Renderer2,
    ViewEncapsulation,
    inject,
    signal,
} from '@angular/core';
import { DEFAULT_SHIKIMORI_DOMAIN, SHIKIMORI_DOMAINS } from '@app/core/providers/shikimori-domain';
import { HeaderComponent } from '@app/core/components/header/header.component';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { PersistenceService } from '@app/shared/services';
import { Store } from '@ngrx/store';
import { TranslocoService, getBrowserLang } from '@jsverse/transloco';
import { addHours, compareAsc } from 'date-fns';
import { addIcons } from 'ionicons';
import { cacheHealthCheckUpAction, resetCacheAction } from '@app/store/cache/actions';
import { combineLatest, firstValueFrom } from 'rxjs';
import {
    debounceTime,
    distinctUntilChanged,
    filter,
    map,
    take,
    tap,
} from 'rxjs/operators';
import { detectShikimoriDomainAction, updateShikimoriDomainAction } from '@app/store/shikimori/actions';
import { environment } from '@app-env/environment';
import { getCurrentUserAction } from '@app/store/shikimori/actions/get-current-user.action';
import { selectCacheLastCheckUp } from '@app/store/cache/selectors/cache.selectors';
import { selectCustomTheme, selectLanguage, selectTheme } from '@app/store/settings/selectors/settings.selectors';
import { selectShikimoriDomain } from '@app/store/shikimori/selectors';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { updateLanguageAction, visitPageAction } from '@app/store/settings/actions/settings.actions';

@Component({
    selector: 'app-root',
    templateUrl: 'app.component.html',
    styleUrls: ['app.component.scss'],
    imports: [
        IonRouterOutlet,
        IonApp,
        HeaderComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
})
export class AppComponent implements OnInit {
    readonly version = environment.appVersion;
    readonly isEmbedMode = signal(false);

    private readonly document = inject(DOCUMENT);
    private readonly store = inject(Store);

    private readonly renderer = inject(Renderer2);
    private readonly transloco = inject(TranslocoService);
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);
    private readonly persistenceService = inject(PersistenceService);
    private readonly destroyRef = inject(DestroyRef);

    constructor() {
        addIcons(usedIcons);

        this.router.events.pipe(
            filter((event) => event instanceof NavigationEnd),
            tap<NavigationEnd>(({ url }) => this.isEmbedMode.set(url.includes('/player/embed/'))),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe();
    }

    readonly isCustomThemeHardDisable$ = this.route.queryParams.pipe(
        map((params) => Boolean(params?.['customTheme'])),
    );

    ngOnInit(): void {
        this.initTheme();
        this.initLocale();
        this.initUser();
        this.initOnNavigation();
        this.initCacheHealthCheckUp();
        this.initShikimoriDomainAvailability();
    }

    initLocale(): void {
        this.store.select(selectLanguage).pipe(
            tap((storedLanguage) => {
                const availableLangs = this.transloco.getAvailableLangs() as string[];
                const browserLang = getBrowserLang();
                const defaultLang = availableLangs.includes(browserLang)
                    ? browserLang
                    : 'en';
                const language = storedLanguage || defaultLang;

                this.renderer.setAttribute(this.document.documentElement, 'lang', language);
                this.store.dispatch(updateLanguageAction({ language }));
            }),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe();
    }

    initTheme(): void {
        const darkThemeClass = 'ion-palette-dark';
        const shikimoriThemeClass = 'shikimori-theme';
        const userCustomStyleId = 'user-custom-theme';
        const headEl = this.document.head;

        combineLatest([
            this.store.select(selectTheme),
            this.isCustomThemeHardDisable$,
        ]).pipe(
            distinctUntilChanged(),
            tap(async ([theme, isCustomThemeDisabled]) => {
                const customTheme = await firstValueFrom(this.store.select(selectCustomTheme));
                const htmlEl = this.document.documentElement;

                if (theme === 'shikimori-dark') {
                    this.renderer.addClass(htmlEl, darkThemeClass);
                    this.renderer.addClass(htmlEl, shikimoriThemeClass);
                } else if (theme === 'shikimori-light') {
                    this.renderer.removeClass(htmlEl, darkThemeClass);
                    this.renderer.addClass(htmlEl, shikimoriThemeClass);
                } else {
                    this.renderer.removeClass(htmlEl, shikimoriThemeClass);
                    if (!theme || theme === 'dark' || theme === 'custom') {
                        this.renderer.addClass(htmlEl, darkThemeClass);
                    } else {
                        this.renderer.removeClass(htmlEl, darkThemeClass);
                    }
                }

                if (theme === 'custom' && !isCustomThemeDisabled) {
                    const styleEl: HTMLStyleElement = this.renderer.createElement('style');

                    this.renderer.setAttribute(styleEl, 'id', userCustomStyleId);
                    this.renderer.appendChild(headEl, styleEl);
                    styleEl.innerHTML = customTheme;
                } else {
                    const styleEl = this.document.querySelector(`#${userCustomStyleId}`);

                    if (styleEl) {
                        this.renderer.removeChild(headEl, styleEl);
                    }
                }
            }),
            takeUntilDestroyed(this.destroyRef),
        ).subscribe();

        combineLatest([
            this.store.select(selectCustomTheme),
            this.isCustomThemeHardDisable$,
        ])
            .pipe(
                filter(([_, isDisabled]) => !isDisabled),
                debounceTime(500),
                tap(([customTheme, _]) => {
                    const styleEl = this.document.querySelector(`#${userCustomStyleId}`);

                    if (styleEl) {
                        styleEl.innerHTML = customTheme;
                    }
                }),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe();
    }

    initUser(): void {
        this.store.dispatch(getCurrentUserAction());
    }

    initOnNavigation(): void {
        this.router.events
            .pipe(
                takeUntilDestroyed(this.destroyRef),
                filter((event) => event instanceof NavigationEnd),
                filter<NavigationEnd>(({ url }) => url !== '/settings'),
                tap<NavigationEnd>(({ url }) => this.store.dispatch(visitPageAction({ url }))),
            )
            .subscribe();
    }

    async initCacheHealthCheckUp(): Promise<void> {
        const CRITICAL_USAGE_RATIO = 0.95;

        const HOURS_PER_CHECKS = 12;
        const NOW = new Date();

        const lastCheckUpTime = await firstValueFrom(this.store.select(selectCacheLastCheckUp));
        const plannedCheckUpTime = addHours(lastCheckUpTime, HOURS_PER_CHECKS);
        const isDueTime = compareAsc(NOW, plannedCheckUpTime) > 0;

        const usedCacheRatio = this.persistenceService.getCacheBytes() / this.persistenceService.getMaxByxes();
        const isCritical = usedCacheRatio > CRITICAL_USAGE_RATIO;

        if (isCritical) {
            console.warn('[Cache] Critical usage');

            this.store.dispatch(resetCacheAction());
        } else if (isDueTime) {
            console.info('[Cache] Performing check up');

            this.store.dispatch(cacheHealthCheckUpAction());
        } else {
            const usagePercent = (usedCacheRatio * 100).toFixed(2);

            console.info(`[Cache] Healthy, usage ratio ${usagePercent}%`);
        }
    }

    initShikimoriDomainAvailability(): void {
        this.store.select(selectShikimoriDomain)
            .pipe(
                take(1),
                tap((domain) => {
                    if (!domain) {
                        this.store.dispatch(detectShikimoriDomainAction());
                        return;
                    }

                    if (!SHIKIMORI_DOMAINS.includes(domain)) {
                        this.store.dispatch(updateShikimoriDomainAction({ domain: DEFAULT_SHIKIMORI_DOMAIN }));
                    }
                }),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe();
    }
}
