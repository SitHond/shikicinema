import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
    ChangeDetectionStrategy,
    Component,
    ViewEncapsulation,
    computed,
    inject,
    signal,
} from '@angular/core';
import { IonButton, IonContent, IonIcon, ToastController } from '@ionic/angular/standalone';

import { ChapterReaderComponent } from '@app/modules/manga/components/chapter-reader/chapter-reader.component';
import { MangaSource } from '@app/modules/manga/types/manga-source.types';
import { ShikimoriClient } from '@app/shared/services';

interface ChapterNavState {
    rateId: number | null;
    chapters: number;
    chapterIndex: number;
    source: MangaSource;
    chapterId: string;
    slug: string;
    volume: string;
    number: string;
}

@Component({
    selector: 'app-manga-chapter-page',
    templateUrl: './manga-chapter.page.html',
    styleUrl: './manga-chapter.page.scss',
    imports: [IonContent, IonButton, IonIcon, RouterLink, ChapterReaderComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    host: { class: 'manga-chapter-page' },
})
export class MangaChapterPage {
    private readonly route = inject(ActivatedRoute);
    private readonly router = inject(Router);
    private readonly shikimori = inject(ShikimoriClient);
    private readonly toast = inject(ToastController);

    readonly mangaId = this.route.snapshot.params['mangaId'] as string;

    private readonly navState = history.state as ChapterNavState | undefined;

    readonly source: MangaSource = this.navState?.source ?? 'mangalib';
    readonly chapterId = this.navState?.chapterId ?? '';
    readonly slug = this.navState?.slug ?? '';
    readonly volume = this.navState?.volume ?? '1';
    readonly number = this.navState?.number ?? '1';

    readonly rateId = signal<number | null>(this.navState?.rateId ?? null);
    readonly readChapters = signal<number>(this.navState?.chapters ?? 0);
    readonly chapterIndex = signal<number>(this.navState?.chapterIndex ?? 0);
    readonly isMarked = signal(false);

    readonly isRead = computed(
        () => this.isMarked() || this.chapterIndex() <= this.readChapters(),
    );

    onMarkAsRead(): void {
        const rateId = this.rateId();
        if (!rateId) return;

        const newCount = Math.max(this.readChapters(), this.chapterIndex());

        this.shikimori.updateUserRate({ id: rateId, chapters: newCount } as any)
            .subscribe({
                next: () => {
                    this.isMarked.set(true);
                    this.readChapters.set(newCount);
                    this.showToast(`Отмечено: ${newCount} гл.`);
                },
                error: () => this.showToast('Не удалось отметить главу', 'danger'),
            });
    }

    onNextChapter(): void {
        void this.router.navigate(['/manga', this.mangaId]);
    }

    onPrevChapter(): void {
        void this.router.navigate(['/manga', this.mangaId]);
    }

    private async showToast(message: string, color = 'success'): Promise<void> {
        const t = await this.toast.create({ message, duration: 2000, color, position: 'bottom' });
        await t.present();
    }
}
