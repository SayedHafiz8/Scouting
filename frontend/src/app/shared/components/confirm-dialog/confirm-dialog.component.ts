import { Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div class="overlay-backdrop" (click)="cancelled.emit()">
      <div class="fixed inset-0 flex items-center justify-center p-4 z-50">
        <div class="card max-w-sm w-full p-6" style="animation: slideUp 0.2s ease"
             (click)="$event.stopPropagation()">
          <div class="flex items-center gap-4 mb-4">
            <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                 [class]="danger() ? 'bg-danger-100 text-danger-600' : 'bg-accent-100 text-accent-600'">
              @if (danger()) {
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              } @else {
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              }
            </div>
            <div>
              <h3 class="font-semibold text-base" style="color:var(--text-primary)">{{ title() }}</h3>
              <p class="text-sm mt-0.5" style="color:var(--text-secondary)">{{ message() }}</p>
            </div>
          </div>
          <div class="flex gap-3 justify-end">
            <button class="btn btn-secondary btn-sm" (click)="cancelled.emit()">{{ 'CONFIRM.CANCEL' | translate }}</button>
            <button class="btn btn-sm" [class]="danger() ? 'btn-danger' : 'btn-primary'" (click)="confirmed.emit()">
              {{ confirmLabel() }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ConfirmDialogComponent {
  readonly title = input<string>('Are you sure?');
  readonly message = input<string>('This action cannot be undone.');
  readonly confirmLabel = input<string>('Confirm');
  readonly danger = input<boolean>(false);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}
