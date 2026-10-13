import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Injectable, inject } from '@angular/core';
import {
    catchError,
    map,
    mergeMap,
    switchMap,
    timeout,
} from 'rxjs/operators';
import { merge, of } from 'rxjs';

import { DEFAULT_SHIKIMORI_DOMAIN_TOKEN, SHIKIMORI_DOMAINS } from '@app/core/providers/shikimori-domain';
import { ShikicinemaApiService } from '@app/shared/services/shikicinema-api.service';
import { ShikimoriClient } from '@app/shared/services/shikimori-client.service';
import { ShikimoriDomainsService } from '@app/core/services/shikimori-domain.service';
import {
    detectShikimoriDomainAction,
    detectShikimoriDomainFailureAction,
    detectShikimoriDomainSuccessAction,
    fetchShikimoriDomainsListAction,
    findAnimeAction,
    findAnimeFailureAction,
    findAnimeSuccessAction,
    getCurrentUserAction,
    getCurrentUserFailureAction,
    getCurrentUserSuccessAction,
    updateShikimoriDomainAction,
    updateShikimoriDomainsListAction,
} from '@app/store/shikimori/actions';

@Injectable()
export class ShikimoriEffects {
    private readonly actions$ = inject(Actions);
    private readonly shikimoriClient = inject(ShikimoriClient);
    private readonly shikimoriDomainsService = inject(ShikimoriDomainsService);
    private readonly shikicinemaApi = inject(ShikicinemaApiService);
    private readonly defaultShikimoriDomain = inject(DEFAULT_SHIKIMORI_DOMAIN_TOKEN);

    getCurrentUserEffect$ = createEffect(() => this.actions$.pipe(
        ofType(getCurrentUserAction),
        switchMap(() => this.shikimoriClient.getCurrentUser().pipe(
            map((currentUser) => getCurrentUserSuccessAction({ currentUser })),
            catchError((err) => of(getCurrentUserFailureAction(err))),
        )),
    ));

    findAnimeEffect$ = createEffect(() => this.actions$.pipe(
        ofType(findAnimeAction),
        switchMap(({ searchStr }) => this.shikimoriClient.findAnimes({ search: searchStr, limit: 16 }).pipe(
            map((animes) => findAnimeSuccessAction({ animes })),
            catchError((errors) => of(findAnimeFailureAction({ errors }))),
        )),
    ));

    fetchShikimoriDomainsListEffect$ = createEffect(() => this.actions$.pipe(
        ofType(fetchShikimoriDomainsListAction),
        switchMap(() => this.shikicinemaApi.getShikimoriDomains().pipe(
            map((domains) => updateShikimoriDomainsListAction({ domains })),
            catchError(() => of(updateShikimoriDomainsListAction({ domains: SHIKIMORI_DOMAINS }))),
        )),
    ));

    detectShikimoriDomainEffect$ = createEffect(() => this.actions$.pipe(
        ofType(detectShikimoriDomainAction),
        switchMap(() => this.shikicinemaApi.getShikimoriDomains().pipe(
            catchError(() => of(SHIKIMORI_DOMAINS)),
        )),
        mergeMap((domains) => merge(
            of(updateShikimoriDomainsListAction({ domains })),
            this.shikimoriDomainsService.detect(...domains).pipe(
                timeout({ first: 10_000 }),
                map((domain) => detectShikimoriDomainSuccessAction({ domain })),
                catchError(() => of(detectShikimoriDomainFailureAction())),
            ),
        )),
    ));

    detectShikimoriDomainSuccessEffect$ = createEffect(() => this.actions$.pipe(
        ofType(detectShikimoriDomainSuccessAction),
        map(({ domain }) => updateShikimoriDomainAction({ domain })),
    ));

    detectShikimoriDomainFailureEffect$ = createEffect(() => this.actions$.pipe(
        ofType(detectShikimoriDomainFailureAction),
        map(() => updateShikimoriDomainAction({ domain: this.defaultShikimoriDomain })),
    ));
}
