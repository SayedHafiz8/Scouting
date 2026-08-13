import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { CoachEvaluationService } from '../services/coach-evaluation.service';
import { ToastService } from '../../../core/services/toast.service';
import { EVALUATION_CRITERIA, CoachEvaluation, EvaluationStats, MONTH_KEYS } from '../../../core/models/coach-evaluation.model';

@Component({
  selector: 'app-coach-evaluation-form',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  template: `
    <div class="max-w-2xl mx-auto space-y-5">
      <div>
        <h2 class="page-title">{{ (isEdit() ? 'COACH_EVAL.EDIT_TITLE' : 'COACH_EVAL.NEW') | translate }}</h2>
        <p class="page-subtitle">{{ 'COACH_EVAL.FORM_HINT' | translate }}</p>
      </div>

      <form (ngSubmit)="save()" class="space-y-5">
        <!-- Period + auto-captured stats -->
        <div class="card p-5 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="form-label" for="eval-month">{{ 'COACH_EVAL.MONTH' | translate }}</label>
              <select id="eval-month" class="form-input" name="month" [(ngModel)]="form.month" [disabled]="isEdit()">
                @for (m of months; track m; let i = $index) {
                  <option [value]="i + 1">{{ m | translate }}</option>
                }
              </select>
            </div>
            <div>
              <label class="form-label" for="eval-year">{{ 'COACH_EVAL.YEAR' | translate }}</label>
              <input id="eval-year" type="number" class="form-input" name="year" [(ngModel)]="form.year" [disabled]="isEdit()" min="2020" max="2100" />
            </div>
          </div>

          @if (stats()) {
            <div class="pt-4 border-t" style="border-color:var(--border-color)">
              <div class="flex items-center gap-2 mb-3">
                <svg class="w-4 h-4 flex-shrink-0" aria-hidden="true" style="color:var(--accent)" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 2L3 14h7v8l10-12h-7z"/></svg>
                <h3 class="text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">{{ 'COACH_EVAL.AUTO_STATS' | translate }}</h3>
                @if (isEdit()) {
                  <button type="button" class="ms-auto text-xs font-medium hover:underline" style="color:var(--accent)" (click)="refresh()">{{ 'COACH_EVAL.REFRESH' | translate }}</button>
                }
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                @for (s of statCells(); track s.key) {
                  <div class="rounded-lg px-3 py-2.5" style="background:var(--bg-card-hover)">
                    <p class="text-xs" style="color:var(--text-muted)">{{ s.key | translate }}</p>
                    <p class="text-base font-bold tabular-nums" style="color:var(--text-primary)">{{ s.value }}</p>
                  </div>
                }
              </div>
            </div>
          }
        </div>

        <!-- Criteria -->
        <div class="card p-5 space-y-6">
          @for (cat of categories; track cat) {
            <div>
              <h3 class="text-xs font-semibold uppercase tracking-wide mb-3" style="color:var(--text-muted)">
                {{ ('COACH_EVAL.CATEGORY.' + cat) | translate }}
              </h3>
              <div class="space-y-4">
                @for (key of criteria[cat]; track key) {
                  <div>
                    <div class="flex items-center justify-between mb-1.5">
                      <label class="text-sm" style="color:var(--text-secondary)" [for]="cat + '_' + key">{{ ('COACH_EVAL.METRIC.' + key) | translate }}</label>
                      <span class="text-sm font-bold tabular-nums w-6 text-right" style="color:var(--accent)">{{ form[cat][key] }}</span>
                    </div>
                    <input type="range" class="rating-slider" [id]="cat + '_' + key" min="1" max="10" step="1"
                           [name]="cat + '_' + key" [(ngModel)]="form[cat][key]" />
                  </div>
                }
              </div>
            </div>
          }
        </div>

        <!-- Notes -->
        <div class="card p-5 space-y-3">
          <div>
            <label class="form-label" for="eval-strengths">{{ 'COACH_EVAL.STRENGTHS' | translate }}</label>
            <textarea id="eval-strengths" class="form-input" rows="2" name="strengths" [(ngModel)]="form.strengths" maxlength="1000"></textarea>
          </div>
          <div>
            <label class="form-label" for="eval-improvements">{{ 'COACH_EVAL.IMPROVEMENTS' | translate }}</label>
            <textarea id="eval-improvements" class="form-input" rows="2" name="areasForImprovement" [(ngModel)]="form.areasForImprovement" maxlength="1000"></textarea>
          </div>
          <div>
            <label class="form-label" for="eval-notes">{{ 'COACH_EVAL.NOTES' | translate }}</label>
            <textarea id="eval-notes" class="form-input" rows="3" name="notes" [(ngModel)]="form.notes" maxlength="1000"></textarea>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button type="submit" class="btn btn-primary" [disabled]="saving()">
            {{ (saving() ? 'COMMON.LOADING' : (isEdit() ? 'COMMON.SAVE' : 'COACH_EVAL.SAVE_DRAFT')) | translate }}
          </button>
          <a [routerLink]="backLink()" [queryParams]="backParams()" class="btn btn-secondary">{{ 'COMMON.CANCEL' | translate }}</a>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .rating-slider {
      width: 100%;
      height: 6px;
      border-radius: 999px;
      appearance: none;
      background: var(--bg-card-hover);
      outline: none;
      cursor: pointer;
    }
    .rating-slider::-webkit-slider-thumb {
      appearance: none;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--accent);
      cursor: pointer;
      border: 3px solid var(--bg-card);
      box-shadow: 0 1px 3px rgba(0,0,0,0.25);
    }
    .rating-slider::-moz-range-thumb {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--accent);
      cursor: pointer;
      border: 3px solid var(--bg-card);
      box-shadow: 0 1px 3px rgba(0,0,0,0.25);
    }
    .rating-slider:focus-visible {
      box-shadow: 0 0 0 3px rgba(var(--accent-rgb, 34,197,94), 0.25);
    }
  `],
})
export class CoachEvaluationFormComponent implements OnInit {
  private readonly service = inject(CoachEvaluationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly criteria = EVALUATION_CRITERIA;
  readonly categories = Object.keys(EVALUATION_CRITERIA);
  readonly months = MONTH_KEYS;

  readonly saving = signal(false);
  readonly stats = signal<EvaluationStats | null>(null);

  private id: string | null = null;
  private coachId: string | null = null;

  form: any = this.emptyForm();

  isEdit(): boolean { return !!this.id; }

  private emptyForm() {
    const now = new Date();
    const f: any = {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      strengths: '', areasForImprovement: '', notes: '',
    };
    for (const cat of Object.keys(EVALUATION_CRITERIA)) {
      f[cat] = {};
      for (const key of EVALUATION_CRITERIA[cat]) f[cat][key] = 5;
    }
    return f;
  }

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id');
    this.coachId = this.route.snapshot.queryParamMap.get('coach');

    if (this.id) {
      this.service.getOne(this.id).subscribe((res) => {
        const doc = res.data?.document;
        if (doc) this.hydrate(doc);
      });
    }
  }

  private hydrate(doc: CoachEvaluation): void {
    this.coachId = doc.coach._id;
    this.form.year = doc.year;
    this.form.month = doc.month;
    this.form.strengths = doc.strengths ?? '';
    this.form.areasForImprovement = doc.areasForImprovement ?? '';
    this.form.notes = doc.notes ?? '';
    for (const cat of this.categories) {
      for (const key of this.criteria[cat]) {
        this.form[cat][key] = (doc as any)[cat]?.[key] ?? 5;
      }
    }
    this.stats.set(doc.stats ?? null);
  }

  statCells() {
    const s = this.stats();
    if (!s) return [];
    return [
      { key: 'COACH_EVAL.STAT.REPORTS', value: s.reportsCount },
      { key: 'COACH_EVAL.STAT.MATCHES', value: s.matchesAttended },
      { key: 'COACH_EVAL.STAT.MEDIA', value: s.mediaCount },
      { key: 'COACH_EVAL.STAT.PLAYERS_MANAGED', value: s.playersManaged },
    ];
  }

  private ratingsPayload() {
    const p: any = {
      strengths: this.form.strengths,
      areasForImprovement: this.form.areasForImprovement,
      notes: this.form.notes,
    };
    for (const cat of this.categories) {
      p[cat] = {};
      for (const key of this.criteria[cat]) p[cat][key] = Number(this.form[cat][key]);
    }
    return p;
  }

  save(): void {
    this.saving.set(true);
    if (this.isEdit()) {
      this.service.update(this.id!, this.ratingsPayload()).subscribe({
        next: () => {
          this.toast.success(this.translate.instant('COACH_EVAL.SAVED_OK'));
          this.router.navigate(['/coach-evaluations', this.id]);
        },
        error: () => this.saving.set(false),
      });
    } else {
      const body = { coach: this.coachId!, year: Number(this.form.year), month: Number(this.form.month), ...this.ratingsPayload() };
      this.service.create(body).subscribe({
        next: (res) => {
          this.toast.success(this.translate.instant('COACH_EVAL.SAVED_OK'));
          this.router.navigate(['/coach-evaluations', res.data?.document._id]);
        },
        error: () => this.saving.set(false),
      });
    }
  }

  refresh(): void {
    if (!this.id) return;
    this.service.refreshStats(this.id).subscribe((res) => {
      this.stats.set(res.data?.document.stats ?? null);
      this.toast.success(this.translate.instant('COACH_EVAL.STATS_REFRESHED'));
    });
  }

  backLink() { return this.isEdit() ? ['/coach-evaluations', this.id] : ['/coach-evaluations']; }
  backParams() { return this.isEdit() ? {} : { coach: this.coachId }; }
}
