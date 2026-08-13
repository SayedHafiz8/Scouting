import { Component, HostListener, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-image-lightbox',
  standalone: true,
  imports: [TranslatePipe],
  styles: [`
    .lightbox-backdrop {
      position: fixed; inset: 0; z-index: 1000;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      padding: 2rem;
      animation: lightboxFadeIn 0.2s ease;
    }
    .lightbox-img {
      max-width: min(90vw, 900px);
      max-height: 90vh;
      object-fit: contain;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      animation: lightboxZoomIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .lightbox-close {
      position: fixed;
      top: 1.25rem; right: 1.25rem;
      width: 44px; height: 44px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
      border: none; cursor: pointer;
      transition: background-color 0.15s ease;
    }
    .lightbox-close:hover { background: rgba(255, 255, 255, 0.22); }
    .lightbox-close:focus-visible {
      outline: 2px solid #fff; outline-offset: 2px;
    }
    @keyframes lightboxFadeIn { from { opacity: 0 } to { opacity: 1 } }
    @keyframes lightboxZoomIn { from { opacity: 0; transform: scale(0.94) } to { opacity: 1; transform: scale(1) } }
    @media (prefers-reduced-motion: reduce) {
      .lightbox-backdrop, .lightbox-img { animation: none; }
    }
  `],
  template: `
    @if (src()) {
      <div class="lightbox-backdrop" role="dialog" aria-modal="true" [attr.aria-label]="alt()" (click)="closed.emit()">
        <button type="button" class="lightbox-close" (click)="closed.emit()" [attr.aria-label]="'COMMON.CLOSE' | translate">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <img [src]="src()" [alt]="alt()" class="lightbox-img" (click)="$event.stopPropagation()" />
      </div>
    }
  `,
})
export class ImageLightboxComponent {
  readonly src = input<string | null>(null);
  readonly alt = input<string>('');
  readonly closed = output<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.src()) this.closed.emit();
  }
}
