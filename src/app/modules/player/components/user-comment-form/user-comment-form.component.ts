import {
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    HostBinding,
    ViewChild,
    ViewEncapsulation,
    computed,
    effect,
    inject,
    input,
    output,
    signal,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
    FormControl,
    FormsModule,
    ReactiveFormsModule,
    Validators,
} from '@angular/forms';
import { IonIcon } from '@ionic/angular/standalone';
import { Store } from '@ngrx/store';
import { TranslocoPipe } from '@jsverse/transloco';
import { toSignal } from '@angular/core/rxjs-interop';

import { Comment } from '@app/shared/types/shikimori/comment';
import { NoWhitespacesValidator } from '@app/shared/validators/no-whitespaces.validator';
import { ProcessShikimoriHtmlPipe } from '@app/modules/player/pipes/process-shikimori-html.pipe';
import { ResourceIdType } from '@app/shared/types/resource-id.type';
import { selectShikimoriDomain } from '@app/store/shikimori/selectors';

type EditorMode = 'write' | 'preview';

@Component({
    selector: 'app-user-comment-form',
    standalone: true,
    imports: [
        IonIcon,
        TranslocoPipe,
        FormsModule,
        ReactiveFormsModule,
        ProcessShikimoriHtmlPipe,
    ],
    templateUrl: './user-comment-form.component.html',
    styleUrl: './user-comment-form.component.scss',
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserCommentFormComponent {
    @HostBinding('class.user-comment-form')
    protected userCommentFormClass = true;

    @ViewChild('textareaRef') private textareaRef!: ElementRef<HTMLTextAreaElement>;

    private readonly sanitizer = inject(DomSanitizer);
    private readonly store = inject(Store);
    private readonly shikimoriDomain = this.store.selectSignal(selectShikimoriDomain);

    readonly comment = new FormControl('', [Validators.required, NoWhitespacesValidator()]);
    private readonly commentValue = toSignal(this.comment.valueChanges, { initialValue: '' });

    readonly mode = signal<EditorMode>('write');
    readonly showLinkPanel = signal(false);

    linkHref = '';

    isAuthorized = input(false);
    editComment = input<Comment>();

    send = output<string>();
    sendEdited = output<Comment>();
    login = output<void>();
    highlightEdit = output<ResourceIdType>();
    cancelEdit = output<void>();

    readonly isEditMode = computed(() => Boolean(this.editComment()?.id));

    readonly preview = computed((): SafeHtml =>
        this.sanitizer.bypassSecurityTrustHtml(
            this.bbToHtml(this.commentValue() ?? ''),
        ),
    );

    readonly editCommentEffect = effect(() => {
        if (this.isEditMode()) {
            this.comment.setValue(this.editComment()?.body ?? '');
        }
    });

    setMode(mode: EditorMode): void {
        this.mode.set(mode);
        if (mode === 'write') {
            requestAnimationFrame(() => this.textareaRef?.nativeElement.focus());
        }
    }

    wrap(before: string, after: string, placeholder = 'текст'): void {
        if (this.mode() !== 'write') this.setMode('write');
        const el = this.textareaRef?.nativeElement;
        if (!el) {
            this._insertAtCursor(before, after, placeholder); return;
        }

        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? 0;
        const val = this.comment.value ?? '';
        const selected = val.slice(start, end);
        const inner = selected || placeholder;
        const insert = before + inner + after;

        this.comment.setValue(val.slice(0, start) + insert + val.slice(end));

        requestAnimationFrame(() => {
            el.focus();
            if (selected) {
                el.setSelectionRange(start + before.length, start + before.length + inner.length);
            } else {
                el.setSelectionRange(start + before.length, start + before.length + placeholder.length);
            }
        });
    }

    openLinkPanel(): void {
        if (this.mode() !== 'write') this.setMode('write');
        this.linkHref = '';
        this.showLinkPanel.set(true);
        requestAnimationFrame(() => {
            const el = this.textareaRef?.nativeElement;
            if (el) {
                const selected = (this.comment.value ?? '').slice(el.selectionStart, el.selectionEnd);
                this.linkHref = '';
                void selected;
            }
        });
    }

    confirmLink(): void {
        const url = this.linkHref.trim();
        if (url) {
            const el = this.textareaRef?.nativeElement;
            const selected = el
                ? (this.comment.value ?? '').slice(el.selectionStart, el.selectionEnd)
                : '';
            this.wrap(`[url=${url}]`, '[/url]', selected || 'ссылка');
        }
        this.showLinkPanel.set(false);
    }

    cancelLink(): void {
        this.showLinkPanel.set(false);
        requestAnimationFrame(() => this.textareaRef?.nativeElement.focus());
    }

    onSend(comment: string): void {
        this.send.emit(comment);
        this.comment.reset();
        this.mode.set('write');
    }

    onSendEdited(comment: string): void {
        this.sendEdited.emit({ ...this.editComment(), body: comment });
        this.comment.reset();
    }

    onLogin(): void {
        this.login.emit();
    }

    onHighlightEditComment(): void {
        this.highlightEdit.emit(this.editComment().id);
    }

    onCancelEdit(): void {
        this.comment.reset();
        this.cancelEdit.emit();
    }

    private _insertAtCursor(before: string, after: string, placeholder: string): void {
        const val = this.comment.value ?? '';
        this.comment.setValue(val + before + placeholder + after);
    }

    private bbToHtml(raw: string): string {
        let s = raw
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        s = s
            .replace(/\n/g, '<br>')
            .replace(/\[b]([\s\S]*?)\[\/b]/gi, '<strong>$1</strong>')
            .replace(/\[i]([\s\S]*?)\[\/i]/gi, '<em>$1</em>')
            .replace(/\[u]([\s\S]*?)\[\/u]/gi, '<u>$1</u>')
            .replace(/\[s]([\s\S]*?)\[\/s]/gi, '<s>$1</s>')
            .replace(/\[code]([\s\S]*?)\[\/code]/gi, '<code class="shc-code">$1</code>')
            .replace(/\[h3]([\s\S]*?)\[\/h3]/gi, '<h3 class="shc-heading">$1</h3>')
            .replace(/\[url=(.*?)]([\s\S]*?)\[\/url]/gi,
                `<a href="$1" class="shc-links" target="_blank" rel="noopener noreferrer">$2</a>`)
            .replace(/\[img]([\s\S]*?)\[\/img]/gi, '<img src="$1" class="shc-preview-img" alt="">')
            .replace(/\|\|([\s\S]*?)\|\|/gi,
                '<button type="button" class="shc-inline-spoiler"><span>$1</span></button>')
            .replace(/\[spoiler='?(.*?)'?]([\s\S]*?)\[\/spoiler]/gi,
                '<div class="shc-block-spoiler"><button type="button">$1</button><div>$2</div></div>')
            .replace(/\[spoiler]([\s\S]*?)\[\/spoiler]/gi,
                '<button type="button" class="shc-inline-spoiler"><span>$1</span></button>')
            .replace(/\[quote='?(.*?)'?]([\s\S]*?)\[\/quote]/gi,
                '<div class="shc-quote"><div class="quoteable"><span>$1</span> написал:</div>' +
                '<div class="inner">$2</div></div>')
            .replace(/\[quote]([\s\S]*?)\[\/quote]/gi,
                '<div class="shc-quote"><div class="inner">$1</div></div>')
            .replace(/\[list]([\s\S]*?)\[\/list]/gi, (_, items) => {
                const lis = items.replace(/\[\*]([\s\S]*?)(?=\[\*]|\s*$)/gi, '<li>$1</li>');
                return `<ul class="shc-list">${lis}</ul>`;
            });

        return s;
    }
}
