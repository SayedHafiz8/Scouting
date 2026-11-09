import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';

interface RadarPoint { x: number; y: number; }

@Component({
  selector: 'app-radar-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 ' + size + ' ' + size" [attr.width]="size" [attr.height]="size" class="w-full h-full">
      <!-- Background grid -->
      @for (ring of gridRings(); track ring.level) {
        <polygon
          [attr.points]="ring.points"
          fill="none"
          stroke="var(--border-color)"
          stroke-width="1"
        />
      }

      <!-- Axis lines -->
      @for (axis of axes(); track axis.label; let i = $index) {
        <line
          [attr.x1]="center"
          [attr.y1]="center"
          [attr.x2]="axisEndPoints()[i].x"
          [attr.y2]="axisEndPoints()[i].y"
          stroke="var(--border-color)"
          stroke-width="1"
        />
      }

      <!-- Data polygon -->
      <polygon
        [attr.points]="dataPoints()"
        [attr.fill]="fillColor"
        [attr.stroke]="strokeColor"
        stroke-width="2"
        fill-opacity="0.2"
      />

      <!-- Data dots -->
      <!-- ⚠️ كان track pt.x — ولما كل التقييمات صفر كل النقط بتقع على المركز،
           فـ15 نقطة بنفس المفتاح (NG0955) وAngular بيعيد بناء الـDOM بدل ما
           يحدّثه. المحاور ثابتة الترتيب فالفهرس هو المفتاح الصح هنا. -->
      @for (pt of dataPointCoords(); track $index; let i = $index) {
        <circle
          [attr.cx]="pt.x"
          [attr.cy]="pt.y"
          r="3"
          [attr.fill]="strokeColor"
        />
      }

      <!-- Axis labels -->
      @for (axis of axes(); track axis.label; let i = $index) {
        <text
          [attr.x]="labelPoints()[i].x"
          [attr.y]="labelPoints()[i].y"
          text-anchor="middle"
          dominant-baseline="middle"
          font-size="9"
          fill="var(--text-secondary)"
        >{{ axis.label }}</text>
      }
    </svg>
  `,
})
export class RadarChartComponent {
  readonly data = input<Record<string, number>>({});

  readonly size = 240;
  readonly center = 120;
  readonly radius = 85;
  readonly gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0];
  readonly strokeColor = '#22c55e';
  readonly fillColor = '#22c55e';

  readonly axes = computed(() => {
    const entries = Object.entries(this.data());
    return entries.map(([label, value]) => ({ label: this.shortLabel(label), value }));
  });

  private angleFor(i: number, total: number): number {
    return (Math.PI * 2 * i) / total - Math.PI / 2;
  }

  private polar(angle: number, r: number): RadarPoint {
    return {
      x: this.center + r * Math.cos(angle),
      y: this.center + r * Math.sin(angle),
    };
  }

  axisEndPoints = computed(() => {
    const axes = this.axes();
    return axes.map((_, i) => this.polar(this.angleFor(i, axes.length), this.radius));
  });

  labelPoints = computed(() => {
    const axes = this.axes();
    return axes.map((_, i) => this.polar(this.angleFor(i, axes.length), this.radius + 16));
  });

  // ⚠️ كانت دالة جوه @for — خمس حلقات × فرد الـ15 محور، في كل دورة تغيير،
  // على رسمة شكلها مابيتغيرش إلا لما الداتا نفسها تتغير.
  readonly gridRings = computed(() => {
    const axes = this.axes();
    return this.gridLevels.map(level => {
      if (!axes.length) return { level, points: '' };
      const r = this.radius * level;
      const points = axes.map((_, i) => {
        const pt = this.polar(this.angleFor(i, axes.length), r);
        return `${pt.x},${pt.y}`;
      }).join(' ');
      return { level, points };
    });
  });

  dataPointCoords = computed(() => {
    const axes = this.axes();
    return axes.map((axis, i) => {
      const r = (axis.value / 10) * this.radius;
      return this.polar(this.angleFor(i, axes.length), r);
    });
  });

  dataPoints = computed(() => {
    return this.dataPointCoords().map(p => `${p.x},${p.y}`).join(' ');
  });

  private shortLabel(label: string): string {
    const map: Record<string, string> = {
      turning: 'Turn', dribbling: 'Drib', tackling: 'Tack', twoFooted: '2Ftd',
      longPassing: 'LPass', shortPassing: 'SPass', heading: 'Head',
      shortSprints: 'SSpr', longSprints: 'LSpr', agility: 'Agil', aerialDuels: 'AirD', groundDuels: 'GrdD',
      vision: 'Vis', personality: 'Pers', movement: 'Move',
    };
    return map[label] ?? label.slice(0, 4);
  }
}
