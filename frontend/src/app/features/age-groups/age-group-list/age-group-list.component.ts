import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/toast.service';
import { AgeGroup } from '../../../core/models/age-group.model';
import { ApiResponse, PaginatedResponse } from '../../../core/models/api-response.model';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
    selector: 'app-age-group-list',
    imports: [FormsModule, RouterLink, SkeletonLoaderComponent, EmptyStateComponent, ConfirmDialogComponent, TranslatePipe],
    template: `
    <div class="max-w-3xl mx-auto space-y-5">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="page-title">{{ 'AGE_GROUPS.TITLE' | translate }}</h2>
          <p class="page-subtitle">{{ 'AGE_GROUPS.SUBTITLE' | translate }}</p>
        </div>
        <button class="btn btn-primary" (click)="showAddForm.set(true)">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {{ 'AGE_GROUPS.ADD' | translate }}
        </button>
      </div>

      <!-- Add form -->
      @if (showAddForm()) {
        <div class="card p-5">
          <h3 class="font-semibold mb-4 text-sm" style="color:var(--text-primary)">{{ 'AGE_GROUPS.FORM_TITLE' | translate }}</h3>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">{{ 'AGE_GROUPS.NAME_LABEL' | translate }}</label>
              <input [(ngModel)]="newName" type="text" class="form-input text-sm" [placeholder]="'AGE_GROUPS.NAME_PH' | translate" />
            </div>
            <div>
              <label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">{{ 'AGE_GROUPS.AGE_LABEL' | translate }}</label>
              <input [(ngModel)]="newBirthYear" type="number" class="form-input text-sm" min="2007" max="2019" placeholder="2012" />
            </div>
          </div>
          <div class="flex gap-3 mt-4">
            <button class="btn btn-primary btn-sm" (click)="create()">{{ 'AGE_GROUPS.CREATE' | translate }}</button>
            <button class="btn btn-secondary btn-sm" (click)="showAddForm.set(false); newName=''; newBirthYear=null">{{ 'AGE_GROUPS.CANCEL' | translate }}</button>
          </div>
        </div>
      }

      @if (loading()) {
        <app-skeleton-loader type="table-row" [count]="5" />
      } @else if (groups().length === 0) {
        <app-empty-state [title]="'AGE_GROUPS.EMPTY' | translate" [message]="'AGE_GROUPS.EMPTY_MSG' | translate" [actionLabel]="'AGE_GROUPS.ADD' | translate" (actionClicked)="showAddForm.set(true)" />
      } @else {
        <div class="card overflow-hidden">
          <table class="w-full text-sm">
            <thead style="background:var(--bg-secondary)">
              <tr class="border-b" style="border-color:var(--border-color)">
                <th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide" style="color:var(--text-muted)">{{ 'AGE_GROUPS.COL_NAME' | translate }}</th>
                <th class="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide" style="color:var(--text-muted)">{{ 'AGE_GROUPS.COL_AGE' | translate }}</th>
                <th class="px-5 py-3 text-right text-xs font-medium uppercase tracking-wide" style="color:var(--text-muted)">{{ 'AGE_GROUPS.COL_ACTIONS' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (group of groups(); track group._id) {
                <tr class="border-b last:border-0 hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
                    style="border-color:var(--border-subtle)" [routerLink]="['/age-groups', group._id]">
                  <td class="px-5 py-3.5 font-medium" style="color:var(--text-primary)">{{ group.name }}</td>
                  <td class="px-5 py-3.5">
                    <span class="px-2 py-0.5 rounded text-xs font-semibold bg-surface-100 text-surface-600">{{ group.birthYear }}</span>
                  </td>
                  <td class="px-5 py-3.5 text-right">
                    <button class="btn btn-ghost btn-icon btn-sm text-danger-500" (click)="$event.stopPropagation(); deleteTarget.set(group)">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                      </svg>
                    </button>
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
        [title]="'AGE_GROUPS.DELETE_TITLE' | translate"
        [message]="'AGE_GROUPS.DELETE_MSG' | translate:{name: deleteTarget()!.name}"
        [confirmLabel]="'COMMON.DELETE' | translate"
        [danger]="true"
        (confirmed)="doDelete()"
        (cancelled)="deleteTarget.set(null)"
      />
    }
  `
})
export class AgeGroupListComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly base = `${environment.apiUrl}/ages`;

  readonly groups = signal<AgeGroup[]>([]);
  readonly loading = signal(true);
  readonly showAddForm = signal(false);
  readonly deleteTarget = signal<AgeGroup | null>(null);

  newName = '';
  newBirthYear: number | null = null;

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.http.get<PaginatedResponse<{ documents: AgeGroup[] }>>(this.base).subscribe({
      next: res => {
        this.groups.set((res.data as any)?.documents ?? (res.data as any)?.ageGroups ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  create(): void {
    if (!this.newName.trim() || !this.newBirthYear) return;
    this.http.post<ApiResponse<{ document: AgeGroup }>>(this.base, { name: this.newName, birthYear: this.newBirthYear }).subscribe({
      next: () => {
        this.toast.success(this.translate.instant('AGE_GROUPS.CREATE'));
        this.showAddForm.set(false);
        this.newName = '';
        this.newBirthYear = null;
        this.load();
      },
    });
  }

  doDelete(): void {
    const g = this.deleteTarget();
    if (!g) return;
    this.http.delete(`${this.base}/${g._id}`).subscribe(() => {
      this.deleteTarget.set(null);
      this.toast.success(this.translate.instant('AGE_GROUPS.DELETE_TITLE'));
      this.load();
    });
  }
}
