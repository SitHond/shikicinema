import AuthStoreInterface from '@app/store/auth/types/auth-store.interface';
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
    exhaustMap,
    filter,
    first,
    map,
    skip,
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
import {
    selectShikicinemaTokenProcessing,
    selectShikicinemaUploadToken,
} from '@app/store/shikicinema/selectors/shikicinema.selectors';
import { throwError } from 'rxjs';

export const shikicinemaApiInterceptor: HttpInterceptorFn = (request, next) => {
    const persistenceService = inject(PersistenceService);
    const actions$ = inject(Actions);
    const store = inject(Store);

    const isShikicinemaApi = request?.url?.startsWith(environment.smarthard.apiURI);
    const isPostRequest = request?.method === 'POST';

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

        // ждём новые токены Шикимори для обновления upload token и повторяем запрос
        const domain: string =
            persistenceService.getItem<{ shikimoriDomain: string }>('shikimori')?.shikimoriDomain || '';

        return actions$.pipe(
            ofType(
                authShikimoriSuccessAction,
                authShikimoriRefreshSuccessAction,
            ),
            tap(({ credentials: shikimoriToken }) =>
                store.dispatch(getUploadTokenAction({ shikimoriToken, shikimoriDomain: domain }))),
            switchMap(() => store.select(selectShikicinemaTokenProcessing).pipe(
                skip(1),
                filter((isProcessing) => !isProcessing),
            )),
            switchMap(() => store.select(selectShikicinemaUploadToken).pipe(
                filter(({ access_token: token, expires }) => isFreshToken(token, expires)),
            )),
            map((uploadToken) => attachAccessToken(request, uploadToken.access_token)),
            exhaustMap(next),
        );
    }

    // пропускаем запросы не для загрузки видео
    if (!isShikicinemaApi || !isPostRequest) {
        return next(request);
    }

    const { uploadToken } = persistenceService.getItem<ShikicinemaStoreInterface>('shikicinema');
    const shikimoriToken = persistenceService.getItem<AuthStoreInterface>('auth');
    const shikimoriDomain: string =
        persistenceService.getItem<{ shikimoriDomain: string }>('shikimori')?.shikimoriDomain || '';

    if (isFreshToken(uploadToken?.access_token, uploadToken?.expires)) {
        // если есть свежий upload token прикрепляем
        request = attachAccessToken(request, uploadToken.access_token);
    } else if (isFreshToken(shikimoriToken?.shikimoriBearerToken, shikimoriToken?.accessExpireTimeMs)) {
        // если нет, но есть свежий токен Шикимори, то обновляем и прикрепляем
        store.dispatch(getUploadTokenAction({ shikimoriToken, shikimoriDomain }));

        return actions$.pipe(
            ofType(getUploadTokenSuccessAction, getUploadTokenFailureAction),
            first(),
            switchMap((action) => {
                if (action.type === getUploadTokenSuccessAction.type) {
                    const successAction = action as ReturnType<typeof getUploadTokenSuccessAction>;
                    const req = attachAccessToken(request, successAction.uploadToken.access_token);

                    return next(req);
                }

                // upload token не получен (токен Шикимори отозван/истёк) — обновляем Шикимори
                return refreshShikimoriTokens(request, next);
            }),
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

