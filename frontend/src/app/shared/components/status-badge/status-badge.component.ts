import { Component, input } from '@angular/core';
import { PlayerStatus } from '../../../core/models/player.model';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  template: `
    <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize"
          [class]="badgeClass()">
      <span class="w-1.5 h-1.5 rounded-full" [style.background]="dotColor()"></span>
      {{ status() }}
    </span>
  `,
})
export class StatusBadgeComponent {
  readonly status = input.required<PlayerStatus>();

  badgeClass(): string {
    const map: Record<PlayerStatus, string> = {
      selected: 'badge-selected',
      pending:  'badge-pending',
      rejected: 'badge-rejected',
      observed: 'badge-observed',
    };
    return map[this.status()] ?? '';
  }

  dotColor(): string {
    const map: Record<PlayerStatus, string> = {
      selected: 'var(--badge-selected-dot)',
      pending:  'var(--badge-pending-dot)',
      rejected: 'var(--badge-rejected-dot)',
      observed: 'var(--badge-observed-dot)',
    };
    return map[this.status()] ?? '';
  }
}
