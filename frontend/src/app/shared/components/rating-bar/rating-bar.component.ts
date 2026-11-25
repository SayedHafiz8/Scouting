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

  readonly percentage = computed(() => (this.value() / (this.max() || 1)) * 100);

  // ⚠️ الحدود **نسبة** من max مش أرقام ثابتة (كانت 8 و5 مكتوبين بالإيد). سلّم
  // بنود التقرير اتغيّر مرتين في أسبوع (1→10 ثم 1→5 ثم 1→10 تاني)، وكل مرة
  // كانت الأرقام الثابتة بتبوّظ الألوان — 4 من 5 كانت بتطلع أحمر وهي تقريباً
  // أعلى تقدير. النسبة بتخلي الدالة صح مع أي سلّم بلا تعديل.
  private get ratio(): number {
    return this.value() / (this.max() || 1);
  }

  barColor(): string {
    if (this.ratio >= 0.8) return 'bg-primary-500';
    if (this.ratio >= 0.5) return 'bg-accent-500';
    return 'bg-danger-500';
  }

  valueColor(): string {
    if (this.ratio >= 0.8) return '#22c55e';
    if (this.ratio >= 0.5) return '#f59e0b';
    return '#f43f5e';
  }
}
