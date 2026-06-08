import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Injectable } from '@angular/core';
import {
    catchError,
    exhaustMap,
    map,
    switchMap,
} from 'rxjs/operators';
import { concatLatestFrom } from '@ngrx/operators';
import { createEffect, ofType } from '@ngrx/effects';
import { from, of } from 'rxjs';

import { AuthEffects } from '@app/store/auth/effects/auth.effects';
import {
    authShikimoriAction,
    authShikimoriFailureAction,
    authShikimoriSuccessAction,
} from '@app/store/auth/actions/auth.actions';
import { environment } from '@app-env/environment';
import { selectShikimoriDomain } from '@app/store/shikimori/selectors';

const ANDROID_REDIRECT_URI = 'me.sithond.shikicinema://oauth/shikimori';

@Injectable()
export class AuthAndroidEffects extends AuthEffects {
    readonly shikimoriClientId = environment.shikimori.authClientId;
    readonly shikimoriDomain$ = this.store.select(selectShikimoriDomain);

    override oauthShikimori$ = createEffect(() => this.actions$.pipe(
        ofType(authShikimoriAction),
        concatLatestFrom(() => this.shikimoriDomain$),
        exhaustMap(([, shikimoriDomain]) => {
            const codeUrl = new URL(`${shikimoriDomain}/oauth/authorize`);

            codeUrl.searchParams.set('client_id', this.shikimoriClientId);
            codeUrl.searchParams.set('redirect_uri', ANDROID_REDIRECT_URI);
            codeUrl.searchParams.set('response_type', 'code');

            return from(Browser.open({ url: codeUrl.toString() })).pipe(
                switchMap(() => from(
                    new Promise<string>((resolve, reject) => {
                        App.addListener('appUrlOpen', (event) => {
                            const url = new URL(event.url);
                            const code = url.searchParams.get('code');
                            const error = url.searchParams.get('error');

                            Browser.close();

                            if (error || !code) {
                                reject(new Error(error || 'oauth-code-missing'));
                            } else {
                                resolve(code);
                            }
                        });
                    }),
                )),
                switchMap((code) => this.shikimoriClient.getNewToken(code, ANDROID_REDIRECT_URI)),
                map((credentials) => authShikimoriSuccessAction({ credentials })),
                catchError((errors) => of(authShikimoriFailureAction({ errors }))),
            );
        }),
    ));
}
