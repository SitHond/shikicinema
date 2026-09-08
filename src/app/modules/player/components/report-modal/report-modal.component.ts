import {
    ChangeDetectionStrategy,
    Component,
    inject,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonInput,
    IonItem,
    IonLabel,
    IonNote,
    IonSelect,
    IonSelectOption,
    IonTextarea,
    IonTitle,
    IonToolbar,
    ModalController,
} from '@ionic/angular/standalone';
import { map } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';

import { ReportCategory, SubmitReportParams } from '@app/shared/services/shikicinema-api.service';

@Component({
    selector: 'app-report-modal',
    templateUrl: 'report-modal.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: true,
    imports: [
        ReactiveFormsModule,
        IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
        IonContent, IonItem, IonLabel, IonSelect, IonSelectOption,
        IonTextarea, IonInput, IonNote,
    ],
})
export class ReportModalComponent {
    // set via componentProps by ModalController
    animeId!: string;
    episode?: number;
    videoId: number | null = null;
    type: 'anime' | 'manga' = 'anime';

    private readonly modalController = inject(ModalController);

    readonly categories: { value: ReportCategory; label: string }[] = [
        { value: 'broken_link', label: 'Битая ссылка' },
        { value: 'wrong_episode', label: 'Неверный эпизод' },
        { value: 'wrong_dub', label: 'Неверная озвучка' },
        { value: 'spam', label: 'Спам' },
        { value: 'copyright', label: 'Нарушение авторских прав' },
        { value: 'other', label: 'Другое' },
    ];

    readonly form = new FormGroup({
        category: new FormControl<ReportCategory>(
            'broken_link', { nonNullable: true, validators: [Validators.required] },
        ),
        description: new FormControl<string>('', { nonNullable: true }),
        copyrightHolder: new FormControl<string>('', { nonNullable: true }),
        copyrightContact: new FormControl<string>('', { nonNullable: true }),
        copyrightWorks: new FormControl<string>('', { nonNullable: true }),
        copyrightBasis: new FormControl<string>('', { nonNullable: true }),
    });

    readonly isCopyright = toSignal(
        this.form.controls.category.valueChanges.pipe(map((v) => v === 'copyright')),
        { initialValue: false },
    );

    dismiss(): void {
        this.modalController.dismiss(null, 'cancel');
    }

    submit(): void {
        if (this.form.invalid) return;

        const v = this.form.getRawValue();
        let description = v.description.trim() || undefined;

        if (v.category === 'copyright') {
            const parts = [
                v.copyrightHolder && `Правообладатель: ${v.copyrightHolder}`,
                v.copyrightContact && `Контакт: ${v.copyrightContact}`,
                v.copyrightWorks && `Произведения: ${v.copyrightWorks}`,
                v.copyrightBasis && `Правовое основание: ${v.copyrightBasis}`,
                v.description && `Доп. сведения: ${v.description}`,
            ].filter(Boolean);
            description = parts.join('\n') || undefined;
        }

        const params: SubmitReportParams = {
            type: this.type,
            target_id: this.animeId,
            category: v.category,
            video_id: this.videoId ?? undefined,
            description,
        };

        this.modalController.dismiss(params, 'submit');
    }
}
