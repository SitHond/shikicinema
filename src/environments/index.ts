import { EnvironmentProviders, Provider } from '@angular/core';

export type PlatformTargetType = 'web-extension';

export interface EnvironmentInterface {
    isProduction: boolean;
    target: PlatformTargetType;
    appVersion: string;
    devtoolsProviders: (Provider | EnvironmentProviders)[];
    shikimori: {
        apiURI: string;
        apiURIs: string[];
        authClientId: string;
        authClientSecret: string;
        episodeNotificationToken: string;
        redirectUri: string;
    };
    smarthard: {
        apiURI: string;
        apiURIs: string[];
        authClientId: string;
    };
}
