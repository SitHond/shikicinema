import { InjectionToken } from '@angular/core';

import { PlatformApi } from '@app/shared/types/platform/platform-api';
import { PlatformApiWebExtensionService } from '@app/shared/services/platform-api/platform-api.web-extension.service';

export const PLATFORM_API_TOKEN = new InjectionToken<PlatformApi>('SHIKICINEMA_PLATFORM_API');

export const platformApiFactory = (): PlatformApi => new PlatformApiWebExtensionService();
