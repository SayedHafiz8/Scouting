import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DashboardService } from '../services/dashboard.service';
import { SocketService } from '../../../core/services/socket.service';
import { UserService } from '../../users/services/user.service';
import { AdminDashboard, CoachDashboard } from '../../../core/models/dashboard.model';
import { User } from '../../../core/models/user.model';
import { TranslatePipe } from '@ngx-translate/core';
import { StatCardComponent } from '../components/stat-card/stat-card.component';
import { SelectionRateGaugeComponent } from '../components/selection-rate-gauge/selection-rate-gauge.component';
import { TopCoachesTableComponent } from '../components/top-coaches-table/top-coaches-table.component';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';

@Component({
    selector: 'app-admin-dashboard',
    imports: [StatCardComponent, SelectionRateGaugeComponent, TopCoachesTableComponent, SkeletonLoaderComponent, RouterLink, TranslatePipe],
    template: `
    <div class="space-y-6">

      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="page-title">
            @if (coachId() && coach()) {
              {{ coach()!.name }}
            } @else if (coachId()) {
              {{ 'DASHBOARD.COACH_TITLE' | translate }}
            } @else {
              {{ 'DASHBOARD.ADMIN_TITLE' | translate }}
            }
          </h2>
          <p class="page-subtitle">
            {{ coachId() ? (coach()?.email ?? ('DASHBOARD.VIEWING_COACH' | translate)) : ('DASHBOARD.ADMIN_SUBTITLE' | translate) }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          @if (coachId()) {
            <a [routerLink]="['/players']" [queryParams]="{coach: coachId()!}" class="btn btn-primary btn-sm">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
              {{ 'DASHBOARD.VIEW_PLAYERS' | translate }}
            </a>
          }
          <a routerLink="/users" class="btn btn-secondary btn-sm">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            {{ 'DASHBOARD.MANAGE_COACHES' | translate }}
          </a>
        </div>
      </div>

      @if (loading()) {
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <app-skeleton-loader type="stat" [count]="4" />
        </div>
      } @else if (data()) {
        <!-- Main stats row -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <app-stat-card [label]="'DASHBOARD.TOTAL_PLAYERS' | translate" [value]="data()!.totalPlayers" iconName="players"
            iconBg="rgba(34,197,94,0.18)"  iconColor="#22c55e"
            link="/players" [queryParams]="coachId() ? {coach: coachId()!} : null"/>
          <app-stat-card [label]="'DASHBOARD.SELECTED' | translate"      [value]="data()!.selectedPlayers" iconName="selected"
            iconBg="rgba(16,185,129,0.18)" iconColor="#10b981"
            link="/players" [queryParams]="coachId() ? {coach: coachId()!, status: 'selected'} : {status: 'selected'}"/>
          <app-stat-card [label]="'DASHBOARD.PENDING' | translate"       [value]="data()!.pendingPlayers"  iconName="pending"
            iconBg="rgba(245,158,11,0.18)" iconColor="#f59e0b"
            link="/players" [queryParams]="coachId() ? {coach: coachId()!, status: 'pending'} : {status: 'pending'}"/>
          <app-stat-card [label]="'DASHBOARD.REJECTED' | translate"      [value]="data()!.rejectedPlayers" iconName="rejected"
            iconBg="rgba(244,63,94,0.18)"  iconColor="#f43f5e"
            link="/players" [queryParams]="coachId() ? {coach: coachId()!, status: 'rejected'} : {status: 'rejected'}"/>
        </div>

        <!-- Secondary row -->
        @if (!coachId()) {
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <app-stat-card [label]="'DASHBOARD.REPORTS' | translate"       [value]="adminData()!.totalReports" iconName="reports"
              iconBg="rgba(99,102,241,0.18)"  iconColor="#818cf8"/>
            <app-stat-card [label]="'DASHBOARD.MEDIA' | translate"         [value]="adminData()!.totalMedia"   iconName="media"
              iconBg="rgba(14,165,233,0.18)"  iconColor="#38bdf8"/>
            <div class="card overflow-hidden relative h-full" role="group" [attr.aria-label]="('NAV.COACHES' | translate) + ': ' + adminData()!.totalCoaches + ', ' + ('NAV.OBSERVERS' | translate) + ': ' + adminData()!.totalObservers">
              <div class="h-0.5 w-full" style="background:#f472b6"></div>
              <div aria-hidden="true" style="position:absolute;top:-20px;right:-10px;width:90px;height:90px;border-radius:50%;filter:blur(28px);pointer-events:none;opacity:0.5;background:rgba(236,72,153,0.22)"></div>
              <div class="p-5 flex flex-col gap-4 h-full">
                <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                     style="background:rgba(236,72,153,0.18);box-shadow:0 4px 16px rgba(236,72,153,0.22)">
                  <svg aria-hidden="true" width="22" height="22" fill="none" style="color:#f472b6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                <div class="flex items-center gap-4">
                  <div class="flex-1 min-w-0">
                    <p class="text-xs font-semibold uppercase tracking-widest mb-1.5" style="color:var(--text-muted)">{{ 'NAV.COACHES' | translate }}</p>
                    <p class="text-3xl font-bold leading-none tabular-nums" style="color:var(--text-primary)">{{ adminData()!.totalCoaches }}</p>
                  </div>
                  <div aria-hidden="true" style="width:1px;align-self:stretch;background:var(--border-subtle)"></div>
                  <div class="flex-1 min-w-0">
                    <p class="text-xs font-semibold uppercase tracking-widest mb-1.5" style="color:var(--text-muted)">{{ 'NAV.OBSERVERS' | translate }}</p>
                    <p class="text-3xl font-bold leading-none tabular-nums" style="color:var(--text-primary)">{{ adminData()!.totalObservers }}</p>
                  </div>
                </div>
              </div>
            </div>
            <app-selection-rate-gauge [rate]="selectionRate()" />
          </div>

          <!-- Top coaches -->
          <div class="mt-6">
            <app-top-coaches-table [coaches]="adminData()?.topCoaches ?? []" />
          </div>
        } @else {
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <app-stat-card [label]="'DASHBOARD.REPORTS' | translate" [value]="data()!.totalReports" iconName="reports" iconBg="rgba(99,102,241,0.18)" iconColor="#818cf8"/>
            <app-stat-card [label]="'DASHBOARD.MATCHES_ATTENDED' | translate" [value]="data()!.matchesAttended" iconName="matches"
              iconBg="rgba(14,165,233,0.18)" iconColor="#0ea5e9"/>
            <app-selection-rate-gauge [rate]="selectionRate()" />
          </div>
        }
      }
    </div>
  `
})
export class AdminDashboardComponent implements OnInit {
  private readonly dashboardService = inject(DashboardService);
  private readonly socketService = inject(SocketService);
  private readonly userService = inject(UserService);
  private readonly route = inject(ActivatedRoute);

  readonly data = signal<CoachDashboard | null>(null);
  readonly loading = signal(true);
  readonly coach = signal<User | null>(null);

  readonly coachId = signal<string | null>(null);

  readonly adminData = () => this.data() as AdminDashboard | null;

  constructor() {
    this.socketService.getAdminUpdates()
      .pipe(takeUntilDestroyed())
      .subscribe(update => this.data.set(update));
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('coachId');
    this.coachId.set(id);

    if (id) {
      this.userService.getOne(id).subscribe({
        next: res => this.coach.set((res.data as any)?.document ?? null),
      });
    }

    const req$ = id
      ? this.dashboardService.getCoachDashboardByAdmin(id)
      : this.dashboardService.getAdminDashboard();

    req$.subscribe({
      next: res => {
        if (res.data) this.data.set(res.data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  selectionRate(): number {
    const d = this.data();
    if (!d || !d.totalPlayers) return 0;
    return Math.round((d.selectedPlayers / d.totalPlayers) * 100);
  }
}
