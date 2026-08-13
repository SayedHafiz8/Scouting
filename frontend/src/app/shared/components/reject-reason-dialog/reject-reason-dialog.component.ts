import { Component, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import type { MediaRejectionReason } from '../../../core/models/player-media.model';

interface ReasonOption {
  value: MediaRejectionReason;
  labelKey: string;
}

@Component({
  selector: 'app-reject-reason-dialog',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div class="overlay-backdrop" (click)="cancelled.emit()">
      <div class="fixed inset-0 flex items-center justify-center p-4 z-50">
        <div class="card max-w-sm w-full p-6" style="animation: slideUp 0.2s ease"
             (click)="$event.stopPropagation()" role="dialog" aria-modal="true" [attr.aria-labelledby]="titleId">
          <div class="flex items-center gap-4 mb-4">
            <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-danger-100 text-danger-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </div>
            <div>
              <h3 [id]="titleId" class="font-semibold text-base" style="color:var(--text-primary)">
                {{ 'MEDIA.REVIEW.REJECT_MODAL_TITLE' | translate }}
              </h3>
              <p class="text-sm mt-0.5" style="color:var(--text-secondary)">
                {{ 'MEDIA.REVIEW.REJECT_MODAL_HINT' | translate }}
              </p>
            </div>
          </div>

          <fieldset class="space-y-2 mb-5">
            <legend class="sr-only">{{ 'MEDIA.REVIEW.REJECT_MODAL_TITLE' | translate }}</legend>
            @for (opt of reasons; track opt.value) {
              <label class="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors border"
                     [style.border-color]="isSelected(opt.value) ? 'var(--input-focus-border)' : 'var(--border-color)'"
                     [style.background]="isSelected(opt.value) ? 'rgba(34,197,94,0.06)' : 'transparent'">
                <input type="checkbox" class="w-4 h-4 flex-shrink-0"
                       [checked]="isSelected(opt.value)"
                       (change)="toggle(opt.value)" />
                <span class="text-sm" style="color:var(--text-primary)">{{ opt.labelKey | translate }}</span>
              </label>
            }
          </fieldset>

          <div class="flex gap-3 justify-end">
            <button type="button" class="btn btn-secondary btn-sm" (click)="cancelled.emit()">
              {{ 'CONFIRM.CANCEL' | translate }}
            </button>
            <button type="button" class="btn btn-danger btn-sm" [disabled]="selected().size === 0"
                    (click)="confirmed.emit([...selected()])">
              {{ 'MEDIA.REVIEW.REJECT_CONFIRM' | translate }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class RejectReasonDialogComponent {
  readonly confirmed = output<MediaRejectionReason[]>();
  readonly cancelled = output<void>();

  readonly titleId = `reject-reason-title-${Math.random().toString(36).slice(2)}`;
  readonly selected = signal<Set<MediaRejectionReason>>(new Set());

  readonly reasons: ReasonOption[] = [
    { value: 'unclear_footage', labelKey: 'MEDIA.REVIEW.REASONS.UNCLEAR_FOOTAGE' },
    { value: 'scout_name_missing', labelKey: 'MEDIA.REVIEW.REASONS.SCOUT_NAME_MISSING' },
    { value: 'match_date_missing', labelKey: 'MEDIA.REVIEW.REASONS.MATCH_DATE_MISSING' },
    { value: 'teams_not_specified', labelKey: 'MEDIA.REVIEW.REASONS.TEAMS_NOT_SPECIFIED' },
  ];

  isSelected(value: MediaRejectionReason): boolean {
    return this.selected().has(value);
  }

  toggle(value: MediaRejectionReason): void {
    this.selected.update(set => {
      const next = new Set(set);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }
}
