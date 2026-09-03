import { Component, inject, signal, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { UserService } from '../../users/services/user.service';
import { ToastService } from '../../../core/services/toast.service';
import { User } from '../../../core/models/user.model';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ImageLightboxComponent } from '../../../shared/components/image-lightbox/image-lightbox.component';

@Component({
  selector: 'app-observer-list',
  imports: [RouterLink, SkeletonLoaderComponent, EmptyStateComponent, ConfirmDialogComponent, ImageLightboxComponent, TranslatePipe],
  template: `
    <div class="space-y-5">

      <div class="flex items-center justify-between">
        <div>
          <h2 class="page-title">{{ 'OBSERVERS.TITLE' | translate }}</h2>
          <p class="page-subtitle">{{ 'OBSERVERS.SUBTITLE' | translate }}</p>
        </div>
        <a routerLink="/observers/new" [queryParams]="{ role: 'observer' }" class="btn btn-primary">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {{ 'OBSERVERS.ADD' | translate }}
        </a>
      </div>

      @if (loading()) {
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <app-skeleton-loader type="card" [count]="3" />
        </div>
      } @else if (observers().length === 0) {
        <app-empty-state
          [title]="'OBSERVERS.EMPTY' | translate"
          [message]="'OBSERVERS.EMPTY_MSG' | translate"
          [actionLabel]="'OBSERVERS.ADD' | translate"
          (actionClicked)="router.navigate(['/observers/new'], { queryParams: { role: 'observer' } })" />
      } @else {
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          @for (u of observers(); track u._id) {

            <div class="card overflow-hidden cursor-pointer hover-scale"
                 [class.opacity-40]="!u.active"
                 (click)="router.navigate(['/observers', u._id])">

              <!-- Header: purple gradient (observer identity) -->
              <div class="relative px-6 pt-6 pb-5 overflow-hidden"
                   style="background: linear-gradient(135deg, rgba(139,92,246,0.18) 0%, rgba(109,40,217,0.10) 100%);">
                <div style="position:absolute;top:-30px;right:-20px;width:120px;height:120px;border-radius:50%;background:rgba(139,92,246,0.10);filter:blur(28px);pointer-events:none"></div>

                <div class="flex items-center gap-5">
                  <div class="flex-shrink-0 rounded-2xl overflow-hidden flex items-center justify-center text-white font-bold"
                       style="width:72px;height:72px;font-size:26px;background:linear-gradient(135deg,#8b5cf6,#6d28d9);box-shadow:0 8px 24px rgba(139,92,246,0.40)">
                    @if (u.profileImg) {
                      <img [src]="u.profileImg" [alt]="u.name" class="w-full h-full object-cover" style="cursor:zoom-in"
                           (click)="openAvatar($event, u.profileImg, u.name)" />
                    } @else {
                      {{ u.name[0]?.toUpperCase() }}
                    }
                  </div>

                  <div class="flex-1 min-w-0">
                    <p class="font-bold text-base truncate" style="color:var(--text-primary)">{{ u.name }}</p>
                    <p class="text-sm truncate mt-0.5" style="color:var(--text-muted)">{{ u.email }}</p>
                    <div class="mt-2 flex items-center gap-2">
                      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                            style="background:rgba(139,92,246,0.15);color:#a78bfa;border:1px solid rgba(139,92,246,0.25)">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                        {{ 'OBSERVERS.ROLE_BADGE' | translate }}
                      </span>
                      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                            [style]="u.active
                              ? 'background:rgba(34,197,94,0.15);color:#4ade80;border:1px solid rgba(34,197,94,0.25)'
                              : 'background:rgba(251,113,133,0.15);color:#fb7185;border:1px solid rgba(251,113,133,0.25)'">
                        <span class="w-1.5 h-1.5 rounded-full" [style]="'background:' + (u.active ? '#22c55e' : '#f43f5e')"></span>
                        {{ u.active ? ('COACHES.BADGE_ACTIVE' | translate) : ('COACHES.BADGE_INACTIVE' | translate) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Footer: quick actions -->
              <div class="flex items-center justify-between px-5 py-3" style="border-top:1px solid var(--border-subtle)">
                @if (u.phoneNumber) {
                  <span class="text-xs flex items-center gap-1.5" style="color:var(--text-muted)">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.71 3.41 2 2 0 0 1 3.68 1.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                    {{ u.phoneNumber }}
                  </span>
                } @else { <span></span> }

                <button class="btn btn-ghost btn-sm" style="color:#f43f5e"
                        (click)="$event.stopPropagation(); deactivateTarget.set(u)">
                  {{ 'COACHES.DEACTIVATE' | translate }}
                </button>
              </div>
            </div>
          }
        </div>
      }
    </div>

    @if (deactivateTarget()) {
      <app-confirm-dialog
        [title]="'OBSERVERS.DEACTIVATE_TITLE' | translate"
        [message]="'OBSERVERS.DEACTIVATE_MSG' | translate:{name: deactivateTarget()!.name}"
        [confirmLabel]="'COACHES.DEACTIVATE' | translate"
        [danger]="true"
        (confirmed)="doDeactivate()"
        (cancelled)="deactivateTarget.set(null)"
      />
    }

    <app-image-lightbox [src]="lightboxSrc()" [alt]="lightboxAlt()" (closed)="closeLightbox()" />
  `
})
export class ObserverListComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  readonly router = inject(Router);

  readonly observers = signal<User[]>([]);
  readonly loading = signal(true);
  readonly deactivateTarget = signal<User | null>(null);
  readonly lightboxSrc = signal<string | null>(null);
  readonly lightboxAlt = signal('');

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.userService.getAll({ sort: 'name', role: 'observer' }).subscribe({
      next: res => {
        this.observers.set((res.data as any)?.documents ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  openAvatar(event: Event, url: string, name: string): void {
    event.stopPropagation();
    this.lightboxSrc.set(url);
    this.lightboxAlt.set(name);
  }

  closeLightbox(): void {
    this.lightboxSrc.set(null);
  }

  doDeactivate(): void {
    const u = this.deactivateTarget();
    if (!u) return;
    this.userService.softDelete(u._id).subscribe(() => {
      this.deactivateTarget.set(null);
      this.toast.success(this.translate.instant('COACHES.BADGE_DEACTIVATED'));
      this.load();
    });
  }
}
