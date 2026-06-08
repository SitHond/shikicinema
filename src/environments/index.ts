import { EnvironmentProviders, Provider } from '@angular/core';

export type PlatformTargetType = 'web-extension' | 'native-app' | 'android';

export interface EnvironmentInterface {
    isProduction: boolean;
    target: PlatformTargetType;
    devtoolsProviders: (Provider | EnvironmentProviders)[];
    shikimori: {
        apiURI: string;
        apiURIs: string[];
        authClientId: string;
        episodeNotificationToken: string;
        redirectUri: string;
    };
    smarthard: {
        apiURI: string;
        apiURIs: string[];
        authClientId: string;
    };
}
