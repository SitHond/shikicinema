import { Browser } from '@capacitor/browser';
import { Injectable } from '@angular/core';

import { PlatformApi } from '@app/shared/types/platform/platform-api';

@Injectable()
export class PlatformApiAndroidService implements PlatformApi {
    openInBrowser(url: string | URL): void {
        const openUrl = url instanceof URL ? url.toString() : url;

        Browser.open({ url: openUrl });
    }
}
