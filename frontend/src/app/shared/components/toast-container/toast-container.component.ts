import { Component, inject } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';
import { Toast } from '../../../core/models/notification.model';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  template: `
    <div class="toast-container">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg max-w-sm w-full pointer-events-auto"
             style="animation: slideUp 0.2s ease"
             [class]="toastClass(toast)">
          <span [innerHTML]="toastIcon(toast)" class="flex-shrink-0 mt-0.5"></span>
          <p class="text-sm font-medium flex-1 whitespace-pre-line">{{ toast.message }}</p>
          <button class="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity" (click)="toastService.dismiss(toast.id)">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastContainerComponent {
  readonly toastService = inject(ToastService);

  toastClass(toast: Toast): string {
    const map: Record<Toast['type'], string> = {
      success: 'bg-primary-600 text-white',
      error: 'bg-danger-600 text-white',
      warning: 'bg-accent-500 text-white',
      info: 'bg-surface-700 text-white',
    };
    return map[toast.type];
  }

  toastIcon(toast: Toast): string {
    if (toast.type === 'success') return '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
    if (toast.type === 'error') return '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    if (toast.type === 'warning') return '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    return '<svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  }
}
