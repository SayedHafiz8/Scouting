import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  template: `
    <div class="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div class="w-20 h-20 rounded-2xl flex items-center justify-center mb-5"
           style="background:var(--bg-card-hover)">
        <span [innerHTML]="icon()" class="w-10 h-10" style="color:var(--text-muted)"></span>
      </div>
      <h3 class="text-base font-semibold mb-2" style="color:var(--text-primary)">{{ title() }}</h3>
      <p class="text-sm max-w-xs mb-6" style="color:var(--text-secondary)">{{ message() }}</p>
      @if (actionLabel()) {
        <button class="btn btn-primary" (click)="actionClicked.emit()">
          {{ actionLabel() }}
        </button>
      }
    </div>
  `,
})
export class EmptyStateComponent {
  readonly icon = input<string>(`<svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M20 13V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7m16 0v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5m16 0h-2.586a1 1 0 0 0-.707.293l-2.414 2.414a1 1 0 0 1-.707.293h-3.172a1 1 0 0 1-.707-.293l-2.414-2.414A1 1 0 0 0 6.586 13H4"/></svg>`);
  readonly title = input<string>('Nothing here yet');
  readonly message = input<string>('Get started by adding your first item.');
  readonly actionLabel = input<string | null>(null);
  readonly actionClicked = output<void>();
}
