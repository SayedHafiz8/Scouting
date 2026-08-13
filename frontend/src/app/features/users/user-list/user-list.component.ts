import { Component, inject, signal, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { UserService } from '../services/user.service';
import { DashboardService } from '../../dashboard/services/dashboard.service';
import { ToastService } from '../../../core/services/toast.service';
import { User } from '../../../core/models/user.model';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ImageLightboxComponent } from '../../../shared/components/image-lightbox/image-lightbox.component';

interface CoachStats { total: number; selected: number; rate: number; }

@Component({
    selector: 'app-user-list',
    imports: [RouterLink, SkeletonLoaderComponent, EmptyStateComponent, ConfirmDialogComponent, ImageLightboxComponent, TranslatePipe],
    template: `
    <div class="space-y-5">

      <div class="flex items-center justify-between">
        <div>
          <h2 class="page-title">{{ 'COACHES.TITLE' | translate }}</h2>
          <p class="page-subtitle">{{ 'COACHES.SUBTITLE' | translate }}</p>
        </div>
        <div class="flex items-center gap-2">
          <a routerLink="/users/deactivated" class="btn btn-secondary">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
            {{ 'COACHES.DEACTIVATED_TAB' | translate }}
          </a>
          <a routerLink="/users/new" class="btn btn-primary">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            {{ 'COACHES.ADD' | translate }}
          </a>
        </div>
      </div>

      @if (loading()) {
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <app-skeleton-loader type="card" [count]="4" />
        </div>
      } @else if (users().length === 0) {
        <app-empty-state [title]="'COACHES.EMPTY' | translate" [message]="'COACHES.EMPTY_MSG' | translate" [actionLabel]="'COACHES.ADD' | translate" (actionClicked)="router.navigate(['/users/new'])"/>
      } @else {
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          @for (user of users(); track user._id) {

            <!-- Coach Card -->
            <div class="card overflow-hidden cursor-pointer"
                 [class.opacity-40]="!user.active"
                 style="transition: transform 0.18s cubic-bezier(0.16,1,0.3,1), box-shadow 0.18s ease;"
                 (mouseenter)="$any($event.currentTarget).style.transform='scale(1.015)'"
                 (mouseleave)="$any($event.currentTarget).style.transform='scale(1)'"
                 (click)="router.navigate(['/users', user._id])">

              <!-- Header area: gradient background + avatar + identity -->
              <div class="relative px-6 pt-6 pb-5 overflow-hidden"
                   style="background: linear-gradient(135deg, rgba(79,70,229,0.18) 0%, rgba(124,58,237,0.10) 100%);">
                <!-- Ambient glow blob -->
                <div style="position:absolute;top:-30px;right:-20px;width:120px;height:120px;border-radius:50%;background:rgba(245,158,11,0.07);filter:blur(28px);pointer-events:none"></div>

                <div class="flex items-center gap-5">
                  <!-- Avatar -->
                  <div class="flex-shrink-0 rounded-2xl overflow-hidden flex items-center justify-center text-white font-bold"
                       style="width:72px;height:72px;font-size:26px;background:linear-gradient(135deg,#4f46e5,#7c3aed);box-shadow:0 8px 24px rgba(79,70,229,0.40)">
                    @if (user.profileImg) {
                      <img [src]="user.profileImg" [alt]="user.name" class="w-full h-full object-cover" style="cursor:zoom-in"
                           (click)="openAvatar($event, user.profileImg, user.name)" />
                    } @else {
                      {{ user.name[0]?.toUpperCase() }}
                    }
                  </div>

                  <!-- Name + email + status -->
                  <div class="flex-1 min-w-0">
                    <p class="font-bold text-base truncate" style="color:var(--text-primary)">{{ user.name }}</p>
                    <p class="text-sm truncate mt-0.5" style="color:var(--text-muted)">{{ user.email }}</p>
                    <div class="mt-2">
                      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                            [style]="user.active
                              ? 'background:rgba(34,197,94,0.15);color:#4ade80;border:1px solid rgba(34,197,94,0.25)'
                              : 'background:rgba(251,113,133,0.15);color:#fb7185;border:1px solid rgba(251,113,133,0.25)'">
                        <span class="w-1.5 h-1.5 rounded-full" [style]="'background:' + (user.active ? '#22c55e' : '#f43f5e')"></span>
                        {{ user.active ? ('COACHES.BADGE_ACTIVE' | translate) : ('COACHES.BADGE_INACTIVE' | translate) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Stats row -->
              <div class="grid grid-cols-3 text-center px-2 py-5"
                   style="border-top:1px solid var(--border-subtle)">
                <div class="flex flex-col items-center gap-1 py-1">
                  <span class="text-3xl font-extrabold tabular-nums leading-none" style="color:var(--text-primary)">
                    {{ statsMap()[user._id] ? statsMap()[user._id]!.total : '—' }}
                  </span>
                  <span class="text-xs font-medium uppercase tracking-widest" style="color:var(--text-muted)">PLAYERS</span>
                </div>

                <div class="flex flex-col items-center gap-1 py-1"
                     style="border-left:1px solid var(--border-subtle);border-right:1px solid var(--border-subtle)">
                  <span class="text-3xl font-extrabold tabular-nums leading-none" style="color:#4ade80">
                    {{ statsMap()[user._id] ? statsMap()[user._id]!.selected : '—' }}
                  </span>
                  <span class="text-xs font-medium uppercase tracking-widest" style="color:var(--text-muted)">SELECTED</span>
                </div>

                <div class="flex flex-col items-center gap-1 py-1">
                  <span class="text-3xl font-extrabold tabular-nums leading-none" style="color:var(--accent)">
                    {{ statsMap()[user._id] ? (statsMap()[user._id]!.rate + '%') : '—' }}
                  </span>
                  <span class="text-xs font-medium uppercase tracking-widest" style="color:var(--text-muted)">RATE</span>
                </div>
              </div>

            </div>

          }
        </div>
      }
    </div>

    @if (deactivateTarget()) {
      <app-confirm-dialog
        [title]="'COACHES.DEACTIVATE_TITLE' | translate"
        [message]="'COACHES.DEACTIVATE_MSG' | translate:{name: deactivateTarget()!.name}"
        [confirmLabel]="'COACHES.DEACTIVATE' | translate"
        [danger]="true"
        (confirmed)="doDeactivate()"
        (cancelled)="deactivateTarget.set(null)"
      />
    }

    <app-image-lightbox [src]="lightboxSrc()" [alt]="lightboxAlt()" (closed)="closeLightbox()" />
  `
})
export class UserListComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly dashboardService = inject(DashboardService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  readonly router = inject(Router);

  readonly users = signal<User[]>([]);
  readonly loading = signal(true);
  readonly deactivateTarget = signal<User | null>(null);
  readonly statsMap = signal<Record<string, CoachStats>>({});
  readonly lightboxSrc = signal<string | null>(null);
  readonly lightboxAlt = signal('');

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.userService.getAll({ sort: 'name', role: 'coach' }).subscribe({
      next: res => {
        const coaches: User[] = (res.data as any)?.documents ?? [];
        this.users.set(coaches);
        this.loading.set(false);
        this.loadStats(coaches);
      },
      error: () => this.loading.set(false),
    });
  }

  private loadStats(coaches: User[]): void {
    if (!coaches.length) return;
    // ريكويست واحد لكل الكباتن بدل ريكويست لكل واحد لوحده (كان بيعمل burst كبير على الـ rate limit)
    this.dashboardService.getAllCoachesStats().pipe(catchError(() => of(null))).subscribe(res => {
      const stats = res?.data?.stats ?? {};
      const map: Record<string, CoachStats> = {};
      coaches.forEach(c => {
        const d = stats[c._id];
        if (d) {
          const total = d.totalPlayers ?? 0;
          const selected = d.selectedPlayers ?? 0;
          map[c._id] = { total, selected, rate: total ? Math.round((selected / total) * 100) : 0 };
        }
      });
      this.statsMap.set(map);
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

  confirmDeactivate(user: User): void { this.deactivateTarget.set(user); }

  doDeactivate(): void {
    const u = this.deactivateTarget();
    if (!u) return;
    this.userService.softDelete(u._id).subscribe(() => {
      this.deactivateTarget.set(null);
      this.toast.success(this.translate.instant('COACHES.BADGE_DEACTIVATED'));
      this.load();
    });
  }

  restore(user: User): void {
    this.userService.restore(user._id).subscribe(() => {
      this.toast.success(this.translate.instant('COMMON.RESTORE'));
      this.load();
    });
  }
}
