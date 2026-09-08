import {
    ChangeDetectionStrategy,
    Component,
    ViewEncapsulation,
    computed,
    inject,
    signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { IonButton, IonContent, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { Title } from '@angular/platform-browser';

import { ShikicinemaApiService, WatchHistoryStats } from '@app/shared/services/shikicinema-api.service';

const MONTH_NAMES = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const DOW_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export interface BarItem { label: string; value: number; pct: number; }
export interface PieSlice { provider: string; count: number; color: string; pct: number; offset: number; }

const PROVIDER_COLORS = [
    '#e53935', '#1e88e5', '#43a047', '#fb8c00', '#8e24aa',
    '#00acc1', '#f4511e', '#3949ab', '#00897b', '#c0ca33',
];

@Component({
    selector: 'app-stats',
    templateUrl: './stats.page.html',
    styleUrls: ['./stats.page.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    standalone: true,
    imports: [IonContent, IonButton, IonIcon, IonSpinner, DecimalPipe],
    host: { class: 'stats-page' },
})
export class StatsPage {
    private readonly api = inject(ShikicinemaApiService);
    private readonly router = inject(Router);
    private readonly title = inject(Title);

    readonly isLoading = signal(true);
    readonly error = signal<string | null>(null);
    readonly stats = signal<WatchHistoryStats | null>(null);

    readonly summary = computed(() => this.stats()?.summary ?? null);

    readonly monthBars = computed((): BarItem[] => {
        const byMonth = this.stats()?.by_month ?? [];
        if (!byMonth.length) return this.buildEmptyMonths();
        const map = new Map(byMonth.map((m) => [m.month, m.count]));
        const now = new Date();
        const items: BarItem[] = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            items.push({ label: MONTH_NAMES[d.getMonth()], value: map.get(key) ?? 0, pct: 0 });
        }
        const max = Math.max(...items.map((i) => i.value), 1);
        return items.map((i) => ({ ...i, pct: i.value / max * 100 }));
    });

    readonly dowBars = computed((): BarItem[] => {
        const byDow = this.stats()?.by_weekday ?? [];
        const map = new Map(byDow.map((d) => [d.dow, d.count]));
        const items = DOW_NAMES.map((label, dow) => ({ label, value: map.get(dow) ?? 0, pct: 0 }));
        const max = Math.max(...items.map((i) => i.value), 1);
        return items.map((i) => ({ ...i, pct: i.value / max * 100 }));
    });

    readonly pieSlices = computed((): PieSlice[] => {
        const byProvider = this.stats()?.by_provider ?? [];
        if (!byProvider.length) return [];
        const total = byProvider.reduce((s, p) => s + p.count, 0);
        const circumference = 2 * Math.PI * 40;
        let offset = 0;
        return byProvider.map((p, i) => {
            const pct = p.count / total * 100;
            const color = PROVIDER_COLORS[i % PROVIDER_COLORS.length];
            const slice: PieSlice = { provider: p.provider, count: p.count, color, pct, offset };
            offset += pct / 100 * circumference;
            return slice;
        });
    });

    readonly circumference = 2 * Math.PI * 40;

    constructor() {
        this.title.setTitle('Статистика — ShikiRIP Cinema');
        this.loadStats();
    }

    private loadStats(): void {
        this.isLoading.set(true);
        this.error.set(null);
        this.api.getWatchHistory().subscribe((result) => {
            this.isLoading.set(false);
            if (!result.ok) {
                const reason = (result as { ok: false; reason?: string }).reason;
                this.error.set(reason === 'collection_disabled' ? 'collection_disabled' : 'error');
                return;
            }
            this.stats.set(result as WatchHistoryStats);
        });
    }

    goBack(): void {
        this.router.navigate(['/settings']);
    }

    providerLabel(p: string): string {
        const map: Record<string, string> = { kodik: 'Kodik', rutube: 'Rutube', smarthard: 'SmartHard' };
        return map[p] ?? p;
    }

    firstWatchedYear(): string | null {
        const d = this.stats()?.summary?.first_watched_at;
        return d ? new Date(d).getFullYear().toString() : null;
    }

    private buildEmptyMonths(): BarItem[] {
        const now = new Date();
        return Array.from({ length: 12 }, (_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
            return { label: MONTH_NAMES[d.getMonth()], value: 0, pct: 0 };
        });
    }
}
