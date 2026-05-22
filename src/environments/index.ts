export type PlatformTargetType = 'web-extension' | 'native-app';

export interface EnvironmentInterface {
    isProduction: boolean;
    target: PlatformTargetType;
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
        authClientSecret: string;
    };
    kodik: {
        apiURI: string;
        authToken: string;
    };
}
