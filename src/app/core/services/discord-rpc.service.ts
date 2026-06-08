import { Injectable } from '@angular/core';

export interface DiscordActivity {
    details: string;
    state: string;
    timestamps?: { start: number };
    type?: number;
}

@Injectable({
    providedIn: 'root',
})
export class DiscordRpcService {
    private get chrome() {
        return (globalThis as any).chrome;
    }

    updateActivity(clientId: string, activity: DiscordActivity): void {
        if (this.chrome?.runtime?.sendMessage) {
            this.chrome.runtime.sendMessage({ discordActivity: { clientId, ...activity } });
        }
    }

    clearActivity(): void {
        if (this.chrome?.runtime?.sendMessage) {
            this.chrome.runtime.sendMessage({ discordActivity: null });
        }
    }
}
