import AuthStoreInterface, { ShikimoriCredentials } from '@app/store/auth/types/auth-store.interface';
import { Actions, ofType } from '@ngrx/effects';
import {
    HttpErrorResponse,
    HttpHandlerFn,
    HttpInterceptorFn,
    HttpRequest,
} from '@angular/common/http';
import { PersistenceService } from '@app/shared/services/persistence.service';
import { ShikicinemaStoreInterface } from '@app/store/shikicinema/types/shikicinema-store.interface';
import { Store } from '@ngrx/store';
import { attachAccessToken } from '@app/shared/utils/attach-access-token.function';
import {
    authShikimoriAction,
    authShikimoriRefreshAction,
    authShikimoriRefreshSuccessAction,
    authShikimoriSuccessAction,
} from '@app/store/auth/actions/auth.actions';
import {
    catchError,
    filter,
    first,
    switchMap,
    tap,
} from 'rxjs/operators';
import { environment } from '@app-env/environment';
import {
    getUploadTokenAction,
    getUploadTokenFailureAction,
    getUploadTokenSuccessAction,
} from '@app/store/shikicinema/actions/get-upload-token.action';
import { inject } from '@angular/core';
import { isFreshToken } from '@app/shared/utils/is-fresh-token.function';
import { selectShikimoriDomain } from '@app/store/shikimori/selectors';
import { throwError } from 'rxjs';

export const shikicinemaApiInterceptor: HttpInterceptorFn = (request, next) => {
    const persistenceService = inject(PersistenceService);
    const actions$ = inject(Actions);
    const store = inject(Store);

    const isShikicinemaApi = request?.url?.startsWith(environment.smarthard.apiURI);
    const isTokenRequest = request?.url?.includes('/oauth/token');

    function waitForUploadToken(
        shikimoriToken: ShikimoriCredentials,
        request: HttpRequest<unknown>,
        next: HttpHandlerFn,
    ) {
        return store.select(selectShikimoriDomain).pipe(
            filter(Boolean),
            first(),
            tap((shikimoriDomain) =>
                store.dispatch(getUploadTokenAction({ shikimoriToken, shikimoriDomain }))),
            switchMap(() => actions$.pipe(
                ofType(getUploadTokenSuccessAction, getUploadTokenFailureAction),
                first(),
            )),
            switchMap((tokenAction) => {
                if (tokenAction.type !== getUploadTokenSuccessAction.type) {
                    return throwError(() => new Error('Failed to obtain upload token'));
                }
                const success = tokenAction as ReturnType<typeof getUploadTokenSuccessAction>;
                const req = attachAccessToken(request, success.uploadToken.access_token);

                return next(req);
            }),
        );
    }

    function refreshShikimoriTokens(request: HttpRequest<unknown>, next: HttpHandlerFn) {
        const {
            shikimoriRefreshToken,
            refreshExpireTimeMs,
        } = persistenceService.getItem<AuthStoreInterface>('auth');

        // можем обновить токен Шикимори
        if (isFreshToken(shikimoriRefreshToken, refreshExpireTimeMs)) {
            store.dispatch(authShikimoriRefreshAction({ refreshToken: shikimoriRefreshToken }));
        } else {
            store.dispatch(authShikimoriAction());
        }

        return actions$.pipe(
            ofType(
                authShikimoriSuccessAction,
                authShikimoriRefreshSuccessAction,
            ),
            first(),
            switchMap(({ credentials: shikimoriToken }) =>
                waitForUploadToken(shikimoriToken, request, next),
            ),
        );
    }

    if (!isShikicinemaApi || isTokenRequest) {
        return next(request);
    }

    const { uploadToken } = persistenceService.getItem<ShikicinemaStoreInterface>('shikicinema');
    const shikimoriToken = persistenceService.getItem<AuthStoreInterface>('auth');

    if (isFreshToken(uploadToken?.access_token, uploadToken?.expires)) {
        // если есть свежий upload token прикрепляем
        request = attachAccessToken(request, uploadToken.access_token);
    } else if (
        request.method === 'POST' &&
        isFreshToken(shikimoriToken?.shikimoriBearerToken, shikimoriToken?.accessExpireTimeMs)
    ) {
        // pre-fetch upload token только для POST (загрузка видео)
        return waitForUploadToken(shikimoriToken, request, next).pipe(
            catchError(() => refreshShikimoriTokens(request, next)),
        );
    }

    return next(request).pipe(
        catchError((error) => {
            if (error instanceof HttpErrorResponse && error.status === 401) {
                return refreshShikimoriTokens(request, next);
            }

            return throwError(() => error);
        }),
    );
};
