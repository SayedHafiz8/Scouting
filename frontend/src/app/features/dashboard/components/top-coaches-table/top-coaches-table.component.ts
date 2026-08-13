import { Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TopCoach } from '../../../../core/models/dashboard.model';

const MEDAL_STYLES = [
  { bg: '#fef3c7', fg: '#b45309', ring: 'rgba(217,119,6,0.35)' },   // gold
  { bg: '#e2e8f0', fg: '#475569', ring: 'rgba(100,116,139,0.30)' }, // silver
  { bg: '#fed7aa', fg: '#9a3412', ring: 'rgba(194,65,12,0.30)' },   // bronze
];

@Component({
  selector: 'app-top-coaches-table',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div class="card overflow-hidden" style="border-color:var(--border-color)">
      <div class="px-5 py-4 border-b flex items-center gap-3" style="border-color:var(--border-color); background:rgba(255,255,255,0.02)">
        <span aria-hidden="true" style="display:inline-block;width:3px;height:16px;border-radius:2px;background:var(--accent);flex-shrink:0"></span>
        <h3 class="font-semibold text-sm" style="color:var(--text-primary)">{{ 'DASHBOARD.TOP_COACHES' | translate }}</h3>
      </div>
      @if (coaches().length) {
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <caption class="sr-only">{{ 'DASHBOARD.TOP_COACHES' | translate }}</caption>
            <thead>
              <tr style="border-bottom: 1px solid var(--border-color); background: var(--bg-secondary)">
                <th scope="col" class="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">{{ 'DASHBOARD.RANK' | translate }}</th>
                <th scope="col" class="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">{{ 'DASHBOARD.COACH' | translate }}</th>
                <th scope="col" class="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">{{ 'DASHBOARD.SELECTED' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (coach of coaches(); track coach.coachName; let i = $index) {
                <tr class="border-b last:border-0 hover:bg-[var(--bg-card-hover)] transition-colors" style="border-color:var(--border-subtle)">
                  <td class="px-5 py-3 w-14">
                    @if (i < 3) {
                      <span class="inline-flex w-7 h-7 rounded-full items-center justify-center text-xs font-bold ring-1"
                            [style.background]="medalStyle(i).bg" [style.color]="medalStyle(i).fg" [style.--tw-ring-color]="medalStyle(i).ring">
                        {{ i + 1 }}
                      </span>
                    } @else {
                      <span class="inline-flex w-7 h-7 items-center justify-center text-sm font-semibold tabular-nums" style="color:var(--text-muted)">{{ i + 1 }}</span>
                    }
                  </td>
                  <td class="px-5 py-3">
                    <div class="flex items-center gap-2.5">
                      <div class="w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0 ring-2"
                           style="background:var(--accent); box-shadow:0 2px 8px rgba(var(--accent-rgb, 34,197,94),0.35); --tw-ring-color:rgba(var(--accent-rgb, 34,197,94),0.25)">
                        {{ coach.coachName[0]?.toUpperCase() }}
                      </div>
                      <span class="font-medium" style="color:var(--text-primary)">{{ coach.coachName }}</span>
                    </div>
                  </td>
                  <td class="px-5 py-3 text-right">
                    <span class="inline-flex items-center gap-1.5 font-bold tabular-nums" style="color:var(--accent)">
                      {{ coach.selectedPlayers }}
                      <svg aria-hidden="true" class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="flex flex-col items-center justify-center py-12 px-4 text-center">
          <div class="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style="background:var(--bg-card-hover)">
            <svg aria-hidden="true" class="w-7 h-7" style="color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M23 21v-2a4 4 0 0 0-3-3.87"/><path stroke-linecap="round" stroke-linejoin="round" d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <p class="text-sm" style="color:var(--text-muted)">{{ 'DASHBOARD.NO_DATA' | translate }}</p>
        </div>
      }
    </div>
  `,
})
export class TopCoachesTableComponent {
  readonly coaches = input<TopCoach[]>([]);

  medalStyle(i: number) {
    return MEDAL_STYLES[i];
  }
}
