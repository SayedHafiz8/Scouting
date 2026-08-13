import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { UserService } from '../services/user.service';
import { ToastService } from '../../../core/services/toast.service';
import { User } from '../../../core/models/user.model';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ImageLightboxComponent } from '../../../shared/components/image-lightbox/image-lightbox.component';

@Component({
    selector: 'app-deactivated-coaches',
    imports: [RouterLink, SkeletonLoaderComponent, ConfirmDialogComponent, ImageLightboxComponent, TranslatePipe],
    template: `
    <div class="max-w-4xl mx-auto space-y-5">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h2 class="page-title">{{ 'DEACTIVATED.TITLE' | translate }}</h2>
          <p class="page-subtitle">
            {{ 'DEACTIVATED.SUBTITLE' | translate }}
          </p>
        </div>
        <a routerLink="/users" class="btn btn-secondary btn-sm">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          {{ 'DEACTIVATED.BACK' | translate }}
        </a>
      </div>

      @if (loading()) {
        <div class="card overflow-hidden">
          <app-skeleton-loader type="table-row" [count]="5" />
        </div>
      } @else if (coaches().length === 0) {
        <div class="card p-12 flex flex-col items-center gap-3 text-center">
          <div class="w-14 h-14 rounded-2xl flex items-center justify-center"
               style="background:rgba(34,197,94,0.1)">
            <svg class="w-7 h-7" style="color:#22c55e" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <p class="font-semibold" style="color:var(--text-primary)">{{ 'DEACTIVATED.EMPTY' | translate }}</p>
          <p class="text-sm" style="color:var(--text-muted)">{{ 'DEACTIVATED.EMPTY_MSG' | translate }}</p>
        </div>
      } @else {
        <div class="card overflow-hidden">
          <table class="w-full text-sm">
            <thead style="background:var(--bg-secondary)">
              <tr class="border-b" style="border-color:var(--border-color)">
                <th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide" style="color:var(--text-muted)">{{ 'DEACTIVATED.COL_COACH' | translate }}</th>
                <th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide hidden md:table-cell" style="color:var(--text-muted)">{{ 'DEACTIVATED.COL_DATE' | translate }}</th>
                <th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide" style="color:var(--text-muted)">{{ 'DEACTIVATED.COL_DAYS' | translate }}</th>
                <th class="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide" style="color:var(--text-muted)">{{ 'DEACTIVATED.COL_ACTIONS' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (coach of coaches(); track coach._id) {
                <tr class="border-b last:border-0 transition-colors hover:bg-[var(--bg-card-hover)]"
                    style="border-color:var(--border-subtle)">

                  <!-- Coach info -->
                  <td class="px-5 py-3.5">
                    <div class="flex items-center gap-3">
                      <div class="w-9 h-9 rounded-full overflow-hidden flex-shrink-0"
                           [class]="coach.profileImg ? '' : 'flex items-center justify-center text-white text-sm font-bold bg-danger-500'">
                        @if (coach.profileImg) {
                          <img [src]="coach.profileImg" [alt]="coach.name" class="w-full h-full object-cover" style="cursor:zoom-in"
                               (click)="openAvatar(coach.profileImg, coach.name)" />
                        } @else {
                          {{ coach.name[0]?.toUpperCase() }}
                        }
                      </div>
                      <div>
                        <p class="font-medium" style="color:var(--text-primary)">{{ coach.name }}</p>
                        <p class="text-xs" style="color:var(--text-muted)">{{ coach.email }}</p>
                      </div>
                    </div>
                  </td>

                  <!-- Deactivated date -->
                  <td class="px-5 py-3.5 hidden md:table-cell text-sm" style="color:var(--text-secondary)">
                    {{ formatDate(coach.deactivatedAt) }}
                  </td>

                  <!-- Days left badge -->
                  <td class="px-5 py-3.5">
                    @if (daysLeft(coach.deactivatedAt) !== null) {
                      <span class="px-2.5 py-1 rounded-full text-xs font-semibold"
                            [class]="urgencyClass(coach.deactivatedAt)">
                        {{ 'DEACTIVATED.DAYS_LEFT' | translate:{days: daysLeft(coach.deactivatedAt)} }}
                      </span>
                    } @else {
                      <span class="text-xs" style="color:var(--text-muted)">—</span>
                    }
                  </td>

                  <!-- Actions -->
                  <td class="px-5 py-3.5">
                    <div class="flex items-center justify-end gap-2">
                      <button class="btn btn-primary btn-sm" (click)="doRestore(coach)">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                          <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.2"/>
                        </svg>
                        {{ 'DEACTIVATED.RESTORE' | translate }}
                      </button>
                      <button class="btn btn-ghost btn-icon btn-sm text-danger-500"
                              title="Delete permanently"
                              (click)="confirmPermanentDelete(coach)">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    @if (deleteTarget()) {
      <app-confirm-dialog
        [title]="'DEACTIVATED.DELETE_TITLE' | translate"
        [message]="'DEACTIVATED.DELETE_MSG' | translate:{name: deleteTarget()!.name}"
        [confirmLabel]="'COMMON.DELETE' | translate"
        [danger]="true"
        (confirmed)="doPermanentDelete()"
        (cancelled)="deleteTarget.set(null)"
      />
    }

    <app-image-lightbox [src]="lightboxSrc()" [alt]="lightboxAlt()" (closed)="closeLightbox()" />
  `
})
export class DeactivatedCoachesComponent implements OnInit {
  private readonly userService = inject(UserService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly coaches = signal<User[]>([]);
  readonly loading = signal(true);
  readonly deleteTarget = signal<User | null>(null);
  readonly lightboxSrc = signal<string | null>(null);
  readonly lightboxAlt = signal('');

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.userService.getDeactivated().subscribe({
      next: res => {
        this.coaches.set(res.data?.documents ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  formatDate(iso?: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  daysLeft(deactivatedAt?: string | null): number | null {
    if (!deactivatedAt) return null;
    const diff = 30 - Math.floor((Date.now() - new Date(deactivatedAt).getTime()) / 86_400_000);
    return Math.max(0, diff);
  }

  urgencyClass(deactivatedAt?: string | null): string {
    const d = this.daysLeft(deactivatedAt);
    if (d === null) return '';
    if (d <= 5)  return 'bg-red-100 text-red-700';
    if (d <= 10) return 'bg-orange-100 text-orange-700';
    return 'bg-yellow-100 text-yellow-700';
  }

  openAvatar(url: string, name: string): void {
    this.lightboxSrc.set(url);
    this.lightboxAlt.set(name);
  }

  closeLightbox(): void {
    this.lightboxSrc.set(null);
  }

  doRestore(coach: User): void {
    this.userService.restore(coach._id).subscribe(() => {
      this.toast.success(this.translate.instant('DEACTIVATED.RESTORE'));
      this.coaches.update(list => list.filter(c => c._id !== coach._id));
    });
  }

  confirmPermanentDelete(coach: User): void {
    this.deleteTarget.set(coach);
  }

  doPermanentDelete(): void {
    const coach = this.deleteTarget();
    if (!coach) return;
    this.userService.forceDelete(coach._id).subscribe(() => {
      this.toast.success(this.translate.instant('COMMON.DELETE'));
      this.coaches.update(list => list.filter(c => c._id !== coach._id));
      this.deleteTarget.set(null);
    });
  }
}
