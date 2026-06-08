import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { ShikicinemaMetaService } from '@app/core/services/shikicinema-meta.service';
import { environment } from '@app-env/environment';

export const shikicinemaVersionInterceptor: HttpInterceptorFn = (req, next) => {
    const shikicinemaMeta = inject(ShikicinemaMetaService);
    const version = shikicinemaMeta.getAppVersion();
    const isShikicinemaApi = environment.smarthard.apiURIs.some((apiURI) => req.url.startsWith(apiURI));

    const modifiedReq = isShikicinemaApi
        ? req.clone({ setHeaders: { 'X-Shikicinema': version } })
        : req;

    return next(modifiedReq);
};
