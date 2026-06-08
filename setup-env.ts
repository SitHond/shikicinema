import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

function env(name: string, fallback = ''): string {
    return process.env[name] ?? fallback;
}

function uniqueUris(uris: string[]): string[] {
    return uris.filter((uri, index, allUris) => uri && allUris.indexOf(uri) === index);
}

function tsStringArray(values: string[]): string {
    return `[${values.map((value) => `'${value}'`).join(', ')}]`;
}

function shikimoriApiURIs(): string[] {
    return uniqueUris([
        env('SHIKIMORI_API_URI', 'https://shikimori.rip/api'),
        env('SHIKIMORI_FALLBACK_API_URI', 'https://shikimori.fi/api'),
    ]);
}

function smarthardApiURIs(): string[] {
    return uniqueUris([
        env('SMARTHARD_API_URI', 'https://api.sithond.com'),
        env('SMARTHARD_FALLBACK_API_URI', 'https://smarthard.net'),
    ]);
}

const target = env('PLATFORM_TARGET', 'web-extension');
const shikimoriApis = shikimoriApiURIs();
const smarthardApis = smarthardApiURIs();
const shikimoriRedirectUri = env('SHIKIMORI_REDIRECT_URI', 'urn:ietf:wg:oauth:2.0:oob');

const devtoolsImport = isProduction
    ? ''
    : `import { provideStoreDevtools } from '@ngrx/store-devtools';\n\n`;

const devtoolsProviders = isProduction
    ? `devtoolsProviders: [],`
    : `devtoolsProviders: [provideStoreDevtools({ name: 'Shikicinema State Devtools', maxAge: 100 })],`;

const envFileContent = `${devtoolsImport}import { EnvironmentInterface } from '@app-root/environments';

export const environment: EnvironmentInterface = {
    isProduction: ${isProduction},
    target: '${target}',
    ${devtoolsProviders}
    shikimori: {
        apiURI: '${shikimoriApis[0]}',
        apiURIs: ${tsStringArray(shikimoriApis)},
        authClientId: '${env('SHIKIMORI_CLIENT_ID')}',
        episodeNotificationToken: '${env('SHIKIMORI_EPISODE_NOTIFICATION_TOKEN')}',
        redirectUri: '${shikimoriRedirectUri}',
    },
    smarthard: {
        apiURI: '${smarthardApis[0]}',
        apiURIs: ${tsStringArray(smarthardApis)},
        authClientId: '${env('SMARTHARD_CLIENT_ID')}',
    },
};\n`;

function errorHandler(err: NodeJS.ErrnoException | null): void {
    if (err) {
        console.error(err);
    } else {
        console.log('Environment file generated');
    }
}

fs.writeFile(
    path.resolve('src', 'environments', 'environment.ts'),
    envFileContent,
    errorHandler,
);

fs.writeFile(
    path.resolve('src', 'environments', 'environment.prod.ts'),
    envFileContent,
    errorHandler,
);
