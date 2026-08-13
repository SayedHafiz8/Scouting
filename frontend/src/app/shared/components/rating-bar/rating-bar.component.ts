import { Component, input, computed } from '@angular/core';

@Component({
  selector: 'app-rating-bar',
  standalone: true,
  template: `
    <div class="flex items-center gap-3">
      @if (label()) {
        <span class="text-xs font-medium w-28 flex-shrink-0 capitalize" style="color:var(--text-secondary)">
          {{ label() }}
        </span>
      }
      <div class="flex-1 h-2 rounded-full overflow-hidden" style="background:var(--border-color)">
        <div class="h-full rounded-full transition-all duration-500 ease-out"
             [style.width]="percentage() + '%'"
             [class]="barColor()"></div>
      </div>
      <span class="text-xs font-bold w-6 text-right flex-shrink-0" [style.color]="valueColor()">
        {{ value() }}
      </span>
    </div>
  `,
})
export class RatingBarComponent {
  readonly value = input<number>(0);
  readonly max = input<number>(10);
  readonly label = input<string>('');

  readonly percentage = computed(() => (this.value() / this.max()) * 100);

  barColor(): string {
    const v = this.value();
    if (v >= 8) return 'bg-primary-500';
    if (v >= 5) return 'bg-accent-500';
    return 'bg-danger-500';
  }

  valueColor(): string {
    const v = this.value();
    if (v >= 8) return '#22c55e';
    if (v >= 5) return '#f59e0b';
    return '#f43f5e';
  }
}
