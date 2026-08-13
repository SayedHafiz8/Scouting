import { Component, input, computed } from '@angular/core';

interface RadarPoint { x: number; y: number; }

@Component({
  selector: 'app-radar-chart',
  standalone: true,
  template: `
    <svg [attr.viewBox]="'0 0 ' + size + ' ' + size" [attr.width]="size" [attr.height]="size" class="w-full h-full">
      <!-- Background grid -->
      @for (level of gridLevels; track level) {
        <polygon
          [attr.points]="gridPoints(level)"
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
      @for (pt of dataPointCoords(); track pt.x; let i = $index) {
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

  gridPoints(level: number): string {
    const axes = this.axes();
    if (!axes.length) return '';
    const r = this.radius * level;
    return axes.map((_, i) => {
      const pt = this.polar(this.angleFor(i, axes.length), r);
      return `${pt.x},${pt.y}`;
    }).join(' ');
  }

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
      passing: 'Pass', dribbling: 'Drib', shooting: 'Shot', ballControl: 'Ctrl',
      speed: 'Speed', stamina: 'Stam', strength: 'Str', agility: 'Agil',
      positioning: 'Pos', decisionMaking: 'Dec', teamwork: 'Team', attitude: 'Att',
    };
    return map[label] ?? label.slice(0, 4);
  }
}
