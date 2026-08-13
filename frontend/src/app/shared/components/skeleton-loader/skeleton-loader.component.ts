import { Component, input } from '@angular/core';

export type SkeletonType = 'card' | 'table-row' | 'text' | 'circle' | 'stat';

@Component({
  selector: 'app-skeleton-loader',
  standalone: true,
  template: `
    @for (i of items(); track i) {
      @if (type() === 'card') {
        <div class="card p-5 animate-pulse">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-full bg-[var(--border-color)]"></div>
            <div class="flex-1">
              <div class="h-3 rounded bg-[var(--border-color)] w-3/4 mb-2"></div>
              <div class="h-2.5 rounded bg-[var(--border-subtle)] w-1/2"></div>
            </div>
          </div>
          <div class="space-y-2">
            <div class="h-2.5 rounded bg-[var(--border-color)]"></div>
            <div class="h-2.5 rounded bg-[var(--border-color)] w-5/6"></div>
            <div class="h-2.5 rounded bg-[var(--border-color)] w-4/6"></div>
          </div>
          <div class="flex gap-2 mt-4">
            <div class="h-7 rounded-full bg-[var(--border-color)] w-20"></div>
            <div class="h-7 rounded-full bg-[var(--border-subtle)] w-16"></div>
          </div>
        </div>
      }

      @if (type() === 'table-row') {
        <div class="flex items-center gap-4 py-3 px-4 border-b animate-pulse" style="border-color:var(--border-subtle)">
          <div class="w-8 h-8 rounded-full bg-[var(--border-color)] flex-shrink-0"></div>
          <div class="flex-1 h-3 rounded bg-[var(--border-color)]"></div>
          <div class="w-24 h-3 rounded bg-[var(--border-color)]"></div>
          <div class="w-20 h-6 rounded-full bg-[var(--border-subtle)]"></div>
          <div class="w-16 h-3 rounded bg-[var(--border-subtle)]"></div>
        </div>
      }

      @if (type() === 'stat') {
        <div class="card p-5 animate-pulse">
          <div class="h-3 w-1/2 rounded bg-[var(--border-color)] mb-4"></div>
          <div class="h-8 w-1/3 rounded bg-[var(--border-color)] mb-2"></div>
          <div class="h-2.5 w-2/3 rounded bg-[var(--border-subtle)]"></div>
        </div>
      }

      @if (type() === 'text') {
        <div class="animate-pulse space-y-2">
          <div class="h-3 rounded bg-[var(--border-color)]"></div>
          <div class="h-3 rounded bg-[var(--border-color)] w-5/6"></div>
          <div class="h-3 rounded bg-[var(--border-color)] w-4/6"></div>
        </div>
      }
    }
  `,
  host: { '[class]': '"contents"' },
})
export class SkeletonLoaderComponent {
  readonly type = input<SkeletonType>('card');
  readonly count = input<number>(1);

  items(): number[] {
    return Array.from({ length: this.count() }, (_, i) => i);
  }
}
