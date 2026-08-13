import { Component, input, computed } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-selection-rate-gauge',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div class="card p-5 flex flex-col items-center"
         style="border-color:rgba(245,158,11,0.25); box-shadow: 0 2px 12px rgba(0,0,0,0.4), 0 0 0 1px rgba(245,158,11,0.15), 0 0 24px rgba(245,158,11,0.06);">
      <p class="text-xs font-medium uppercase tracking-widest mb-4" style="color:var(--accent)">{{ 'DASHBOARD.SELECTION_RATE' | translate }}</p>
      <div class="relative w-32 h-32">
        <svg class="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border-color)" stroke-width="10"/>
          <circle cx="60" cy="60" r="50" fill="none"
                  [attr.stroke]="gaugeColor()"
                  stroke-width="10"
                  stroke-linecap="round"
                  [attr.stroke-dasharray]="circumference"
                  [attr.stroke-dashoffset]="dashOffset()"
                  style="transition: stroke-dashoffset 1s ease-in-out, stroke 0.4s ease"/>
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center">
          <span class="text-2xl font-bold tabular-nums" style="color:var(--text-primary)">{{ rate() }}%</span>
          <span class="text-xs" style="color:var(--text-muted)">{{ 'DASHBOARD.SELECTED_LABEL' | translate }}</span>
        </div>
      </div>
    </div>
  `,
})
export class SelectionRateGaugeComponent {
  readonly rate = input<number>(0);

  readonly circumference = 2 * Math.PI * 50; // ≈ 314

  readonly dashOffset = computed(() => {
    const pct = Math.min(100, Math.max(0, this.rate())) / 100;
    return this.circumference * (1 - pct);
  });

  readonly gaugeColor = computed(() => {
    const r = this.rate();
    if (r >= 60) return '#22c55e';
    if (r >= 30) return '#f59e0b';
    return '#f43f5e';
  });
}
