import { Component, input, output, signal, computed, HostListener, OnInit, OnDestroy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

const AUTO_DISMISS_MS = 5000;
const EXIT_ANIMATION_MS = 260;

interface ConfettiPiece {
  id: number;
  left: number;
  delay: number;
  duration: number;
  rotation: number;
  color: string;
  size: number;
  drift: number;
}

const CONFETTI_COLORS = ['#22c55e', '#f59e0b', '#38bdf8', '#a78bfa', '#f472b6', '#facc15'];

@Component({
  selector: 'app-player-selected-celebration',
  imports: [TranslatePipe],
  styles: [`
    :host { display: contents; }

    .scrim {
      position: fixed; inset: 0; z-index: 300;
      background: rgba(8, 10, 20, 0.6);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
      animation: scrimIn 220ms ease-out;
    }
    .scrim.closing {
      animation: scrimOut 260ms ease-in forwards;
    }
    @keyframes scrimIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes scrimOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }

    .confetti-piece {
      position: absolute;
      top: -12px;
      border-radius: 2px;
      opacity: 0.95;
      animation: confettiFall linear forwards;
      will-change: transform, opacity;
    }
    @keyframes confettiFall {
      0%   { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 1; }
      85%  { opacity: 1; }
      100% { transform: translate3d(var(--drift), 108vh, 0) rotate(var(--rot)); opacity: 0; }
    }

    .card {
      position: relative;
      width: 100%;
      max-width: 380px;
      border-radius: 24px;
      padding: 36px 28px 28px;
      text-align: center;
      background: var(--bg-card, #12141f);
      border: 1px solid rgba(34,197,94,0.35);
      box-shadow: 0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(34,197,94,0.12), 0 0 60px rgba(34,197,94,0.15);
      animation: cardIn 380ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes cardIn {
      0%   { opacity: 0; transform: scale(0.82) translateY(18px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }
    .card.closing {
      animation: cardOut 220ms cubic-bezier(0.4, 0, 1, 1) forwards;
    }
    @keyframes cardOut {
      0%   { opacity: 1; transform: scale(1) translateY(0); }
      100% { opacity: 0; transform: scale(0.9) translateY(10px); }
    }

    .badge {
      width: 84px; height: 84px; border-radius: 9999px;
      margin: 0 auto 18px;
      display: flex; align-items: center; justify-content: center;
      background: radial-gradient(circle at 35% 30%, #34d399, #16a34a);
      box-shadow: 0 0 0 8px rgba(34,197,94,0.14), 0 12px 30px rgba(22,163,74,0.45);
      animation: badgePop 520ms cubic-bezier(0.34, 1.56, 0.64, 1) 120ms both;
    }
    @keyframes badgePop {
      0%   { transform: scale(0.4); opacity: 0; }
      60%  { transform: scale(1.12); opacity: 1; }
      100% { transform: scale(1); opacity: 1; }
    }
    .badge svg { width: 40px; height: 40px; stroke: white; }

    .close-btn {
      position: absolute; top: 14px; inset-inline-end: 14px;
      width: 32px; height: 32px; border-radius: 9999px;
      display: flex; align-items: center; justify-content: center;
      background: rgba(148,163,184,0.12);
      color: var(--text-muted);
      border: none; cursor: pointer;
      transition: background-color 150ms ease, color 150ms ease;
    }
    .close-btn:hover { background: rgba(148,163,184,0.22); color: var(--text-primary); }
    .close-btn:focus-visible { outline: 2px solid #22c55e; outline-offset: 2px; }

    @media (prefers-reduced-motion: reduce) {
      .scrim, .scrim.closing, .card, .card.closing, .badge, .confetti-piece { animation: none !important; }
      .confetti-layer { display: none; }
    }
  `],
  template: `
    <div class="scrim" [class.closing]="closing()" role="dialog" aria-modal="true" [attr.aria-label]="'PLAYERS.CELEBRATE.TITLE' | translate" (click)="onScrimClick($event)">

      @if (!reducedMotion()) {
        <div class="confetti-layer" style="position:absolute; inset:0; overflow:hidden; pointer-events:none">
          @for (piece of confetti(); track piece.id) {
            <span class="confetti-piece"
                  [style.left.%]="piece.left"
                  [style.width.px]="piece.size"
                  [style.height.px]="piece.size * 0.4"
                  [style.background]="piece.color"
                  [style.animation-delay.ms]="piece.delay"
                  [style.animation-duration.ms]="piece.duration"
                  [style.--rot]="piece.rotation + 'deg'"
                  [style.--drift]="piece.drift + 'px'">
            </span>
          }
        </div>
      }

      <div class="card" [class.closing]="closing()" (click)="$event.stopPropagation()">
        <button type="button" class="close-btn" [attr.aria-label]="'COMMON.CLOSE' | translate" (click)="close()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div class="badge">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>

        <h2 class="text-xl font-black" style="color:var(--text-primary)">
          {{ 'PLAYERS.CELEBRATE.TITLE' | translate }}
        </h2>
        <p class="text-sm mt-2" style="color:var(--text-secondary)">
          {{ 'PLAYERS.CELEBRATE.MESSAGE' | translate:{name: playerName()} }}
        </p>
      </div>
    </div>
  `,
})
export class PlayerSelectedCelebrationComponent implements OnInit, OnDestroy {
  readonly playerName = input.required<string>();
  readonly dismissed = output<void>();

  readonly closing = signal(false);

  readonly reducedMotion = signal(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );

  readonly confetti = computed<ConfettiPiece[]>(() => {
    if (this.reducedMotion()) return [];
    return Array.from({ length: 42 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 250,
      duration: 2200 + Math.random() * 1400,
      rotation: 360 + Math.random() * 720,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + Math.random() * 6,
      drift: Math.random() * 160 - 80,
    }));
  });

  private autoDismissTimer: ReturnType<typeof setTimeout> | null = null;
  private exitTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.autoDismissTimer = setTimeout(() => this.close(), AUTO_DISMISS_MS);
  }

  ngOnDestroy(): void {
    if (this.autoDismissTimer) clearTimeout(this.autoDismissTimer);
    if (this.exitTimer) clearTimeout(this.exitTimer);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  onScrimClick(event: MouseEvent): void {
    event.stopPropagation();
    this.close();
  }

  // بيشغل أنيميشن الخروج الأول، وبعدين يستنى انتهاءها قبل ما يقفل الأوفرلاي فعليًا
  close(): void {
    if (this.closing()) return;
    if (this.autoDismissTimer) clearTimeout(this.autoDismissTimer);
    this.closing.set(true);
    const delay = this.reducedMotion() ? 0 : EXIT_ANIMATION_MS;
    this.exitTimer = setTimeout(() => this.dismissed.emit(), delay);
  }
}
