import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { DashboardService } from '../services/dashboard.service';
import { ProScoutDashboard } from '../../../core/models/dashboard.model';
import { StatCardComponent } from '../components/stat-card/stat-card.component';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';

// Stage 5 — لا يوجد اشتراك SocketService هنا عمداً: مفيش proScout emitter
// موجود، ومفيش سبب يضاف واحد لمرحلة مالهاش أي acceptance criterion بيطلب
// realtime (research.md R9). الصفحة بتحمّل مرة واحدة عبر HTTP وخلاص.
@Component({
    selector: 'app-pro-scout-dashboard',
    imports: [StatCardComponent, SkeletonLoaderComponent, RouterLink, TranslatePipe, DatePipe],
    template: `
    <div class="max-w-5xl mx-auto space-y-6">

      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="page-title">{{ 'DASHBOARD.PROSCOUT_TITLE' | translate }}</h2>
          <p class="page-subtitle">{{ 'DASHBOARD.PROSCOUT_SUBTITLE' | translate }}</p>
        </div>
        <a [routerLink]="['/players']" class="btn btn-primary btn-sm">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
          {{ 'DASHBOARD.VIEW_PLAYERS' | translate }}
        </a>
      </div>

      @if (loading()) {
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <app-skeleton-loader type="stat" [count]="4" />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <app-skeleton-loader type="stat" [count]="2" />
        </div>
      } @else if (data(); as d) {
        <!-- Primary row: total players + status breakdown (createdBy-scoped, Stage 12). -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <app-stat-card
            [label]="'DASHBOARD.TOTAL_PLAYERS' | translate"
            [value]="d.totalPlayers"
            iconBg="rgba(99,102,241,0.18)"
            iconColor="#818cf8"
            iconName="players"
            link="/players"
          />
          <app-stat-card
            [label]="'DASHBOARD.SELECTED' | translate"
            [value]="d.selectedPlayers"
            iconBg="rgba(16,185,129,0.18)"
            iconColor="#10b981"
            iconName="selected"
            link="/players"
            [queryParams]="{status: 'selected'}"
          />
          <app-stat-card
            [label]="'DASHBOARD.PENDING' | translate"
            [value]="d.pendingPlayers"
            iconBg="rgba(245,158,11,0.18)"
            iconColor="#f59e0b"
            iconName="pending"
            link="/players"
            [queryParams]="{status: 'pending'}"
          />
          <app-stat-card
            [label]="'DASHBOARD.REJECTED' | translate"
            [value]="d.rejectedPlayers"
            iconBg="rgba(244,63,94,0.18)"
            iconColor="#f43f5e"
            iconName="rejected"
            link="/players"
            [queryParams]="{status: 'rejected'}"
          />
        </div>

        <!-- Secondary row. Match count is labelled "professional league", never "attended" —
             this figure is league-scoped (services/scope.js seasonMatchScopeFor), unlike
             the coach/observer dashboards' attendance-scoped counts (research.md R3). -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <app-stat-card
            [label]="'DASHBOARD.UPCOMING_PRO_LEAGUE_MATCHES' | translate"
            [value]="d.upcomingMatchesCount"
            iconBg="rgba(14,165,233,0.18)"
            iconColor="#0ea5e9"
            iconName="matches"
          />
          <app-stat-card
            [label]="'DASHBOARD.TOTAL_REPORTS' | translate"
            [value]="d.totalReports"
            iconBg="rgba(168,85,247,0.18)"
            iconColor="#a855f7"
            iconName="reports"
          />
        </div>

        <!-- Upcoming matches -->
        <div class="card overflow-hidden" style="border-color:var(--border-color)">
          <div class="px-5 py-4 border-b flex items-center gap-3" style="border-color:var(--border-color); background:rgba(255,255,255,0.02)">
            <span aria-hidden="true" style="display:inline-block;width:3px;height:16px;border-radius:2px;background:var(--accent);flex-shrink:0"></span>
            <h3 class="font-semibold text-sm" style="color:var(--text-primary)">{{ 'DASHBOARD.UPCOMING_MATCHES_SECTION' | translate }}</h3>
          </div>
          @if (d.upcomingMatches.length) {
            <ul class="divide-y" style="border-color:var(--border-subtle)">
              @for (m of d.upcomingMatches; track m._id) {
                <li class="px-5 py-3 flex items-center justify-between gap-3">
                  <span class="text-sm font-medium" style="color:var(--text-primary)">{{ m.homeTeam.name }} — {{ m.awayTeam.name }}</span>
                  <span class="text-xs tabular-nums" style="color:var(--text-muted)">{{ m.matchDate | date:'mediumDate' }}</span>
                </li>
              }
            </ul>
          } @else {
            <p class="px-5 py-8 text-sm text-center" style="color:var(--text-muted)">{{ 'DASHBOARD.NO_UPCOMING_MATCHES' | translate }}</p>
          }
        </div>

        <!-- Latest results -->
        <div class="card overflow-hidden" style="border-color:var(--border-color)">
          <div class="px-5 py-4 border-b flex items-center gap-3" style="border-color:var(--border-color); background:rgba(255,255,255,0.02)">
            <span aria-hidden="true" style="display:inline-block;width:3px;height:16px;border-radius:2px;background:var(--accent);flex-shrink:0"></span>
            <h3 class="font-semibold text-sm" style="color:var(--text-primary)">{{ 'DASHBOARD.LATEST_RESULTS' | translate }}</h3>
          </div>
          @if (d.latestResults.length) {
            <ul class="divide-y" style="border-color:var(--border-subtle)">
              @for (m of d.latestResults; track m._id) {
                <li class="px-5 py-3 flex items-center justify-between gap-3">
                  <span class="text-sm font-medium" style="color:var(--text-primary)">{{ m.homeTeam.name }} — {{ m.awayTeam.name }}</span>
                  <span class="text-xs tabular-nums" style="color:var(--text-muted)">
                    @if (m.result) {
                      {{ m.result.homeScore }} - {{ m.result.awayScore }}
                    }
                    {{ m.matchDate | date:'mediumDate' }}
                  </span>
                </li>
              }
            </ul>
          } @else {
            <p class="px-5 py-8 text-sm text-center" style="color:var(--text-muted)">{{ 'DASHBOARD.NO_RESULTS_YET' | translate }}</p>
          }
        </div>

        <!-- Recent reports -->
        <div class="card overflow-hidden" style="border-color:var(--border-color)">
          <div class="px-5 py-4 border-b flex items-center gap-3" style="border-color:var(--border-color); background:rgba(255,255,255,0.02)">
            <span aria-hidden="true" style="display:inline-block;width:3px;height:16px;border-radius:2px;background:var(--accent);flex-shrink:0"></span>
            <h3 class="font-semibold text-sm" style="color:var(--text-primary)">{{ 'DASHBOARD.RECENT_REPORTS' | translate }}</h3>
          </div>
          @if (d.recentReports.length) {
            <ul class="divide-y" style="border-color:var(--border-subtle)">
              @for (r of d.recentReports; track r._id) {
                <li class="px-5 py-3 flex items-center justify-between gap-3">
                  <span class="text-sm font-medium" style="color:var(--text-primary)">{{ r.player.name }}</span>
                  <span class="text-xs tabular-nums" style="color:var(--text-muted)">{{ r.overallRating }} · {{ r.matchDate | date:'mediumDate' }}</span>
                </li>
              }
            </ul>
          } @else {
            <p class="px-5 py-8 text-sm text-center" style="color:var(--text-muted)">{{ 'DASHBOARD.NO_REPORTS_YET' | translate }}</p>
          }
        </div>
      }
    </div>
  `
})
export class ProScoutDashboardComponent implements OnInit {
  private readonly dashboardService = inject(DashboardService);

  readonly data = signal<ProScoutDashboard | null>(null);
  readonly loading = signal(true);

  ngOnInit(): void {
    this.dashboardService.getProScoutDashboard().subscribe({
      next: res => {
        if (res.data) this.data.set(res.data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
