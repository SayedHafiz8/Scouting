import { Component, input, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';

@Component({
    selector: 'app-stat-card',
    imports: [RouterLink, NgTemplateOutlet],
    template: `
    @if (link()) {
      <a [routerLink]="link()" [queryParams]="queryParams()"
         class="block card overflow-hidden relative cursor-pointer h-full hover-scale"
         style="--hover-scale:1.03">
        <ng-container [ngTemplateOutlet]="body" />
      </a>
    } @else {
      <div class="card overflow-hidden relative h-full">
        <ng-container [ngTemplateOutlet]="body" />
      </div>
    }

    <ng-template #body>
      <!-- Top accent strip -->
      <div class="h-0.5 w-full" [style.background]="iconColor()"></div>

      <!-- Ambient glow blob -->
      <div style="position:absolute;top:-20px;right:-10px;width:90px;height:90px;border-radius:50%;filter:blur(28px);pointer-events:none;opacity:0.5"
           [style.background]="iconBgGlow()"></div>

      <!-- Original horizontal layout -->
      <div class="p-5 flex items-start gap-4">
        <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
             [style.background]="iconBg()"
             [style.box-shadow]="'0 4px 16px ' + iconBgGlow()">
          @switch (iconName()) {
            @case ('players') {
              <svg width="22" height="22" fill="none" [style.color]="iconColor()" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
                <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
            }
            @case ('selected') {
              <svg width="22" height="22" fill="none" [style.color]="iconColor()" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            }
            @case ('pending') {
              <svg width="22" height="22" fill="none" [style.color]="iconColor()" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            }
            @case ('rejected') {
              <svg width="22" height="22" fill="none" [style.color]="iconColor()" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            }
            @case ('reports') {
              <svg width="22" height="22" fill="none" [style.color]="iconColor()" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            }
            @case ('media') {
              <svg width="22" height="22" fill="none" [style.color]="iconColor()" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            }
            @case ('matches') {
              <svg width="22" height="22" fill="none" [style.color]="iconColor()" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            }
            @case ('coaches') {
              <svg width="22" height="22" fill="none" [style.color]="iconColor()" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            }
            @default {
              <svg width="22" height="22" fill="none" [style.color]="iconColor()" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/>
              </svg>
            }
          }
        </div>

        <div class="flex-1 min-w-0">
          <p class="text-xs font-semibold uppercase tracking-widest mb-1.5" style="color:var(--text-muted)">{{ label() }}</p>
          <p class="text-3xl font-bold leading-none tabular-nums" style="color:var(--text-primary)">{{ value() }}</p>
          @if (subtitle()) {
            <p class="text-xs mt-1" style="color:var(--text-secondary)">{{ subtitle() }}</p>
          }
        </div>
      </div>
    </ng-template>
  `
})
export class StatCardComponent {
  readonly label       = input<string>('');
  readonly value       = input<number | string>(0);
  readonly iconName    = input<string>('');
  readonly iconBg      = input<string>('rgba(34,197,94,0.18)');
  readonly iconColor   = input<string>('#22c55e');
  readonly subtitle    = input<string>('');
  readonly link        = input<string | null>(null);
  readonly queryParams = input<Record<string, string> | null>(null);

  readonly iconBgGlow = computed(() => {
    const c = this.iconColor();
    if (c.startsWith('#') && c.length === 7) {
      const r = parseInt(c.slice(1, 3), 16);
      const g = parseInt(c.slice(3, 5), 16);
      const b = parseInt(c.slice(5, 7), 16);
      return `rgba(${r},${g},${b},0.22)`;
    }
    return this.iconBg();
  });
}
