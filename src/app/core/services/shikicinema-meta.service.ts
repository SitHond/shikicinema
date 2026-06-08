import { Injectable } from '@angular/core';


@Injectable({
    providedIn: 'root',
})
export class ShikicinemaMetaService {
    private readonly manifest = globalThis.chrome?.runtime?.getManifest?.();

    getAppVersion(): string {
        return this.manifest?.version || '0.9.11';
    }
}
