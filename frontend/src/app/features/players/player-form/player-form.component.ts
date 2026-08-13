import { Component, inject, signal, computed, OnInit, ViewChild, ElementRef } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { environment } from '../../../../environments/environment';
import { PlayerService } from '../services/player.service';
import { TeamService } from '../../teams/services/team.service';
import { ToastService } from '../../../core/services/toast.service';
import { LanguageService } from '../../../core/services/language.service';
import { PLAYER_POSITIONS } from '../../../core/models/player.model';
import { Team } from '../../../core/models/team.model';
import { AgeGroup } from '../../../core/models/age-group.model';
import { PaginatedResponse } from '../../../core/models/api-response.model';
import { COUNTRIES } from '../../../core/data/countries';

// Must track the backend's MAX_PLAYER_IMAGE_SIZE in playerController.js — this is just a
// courtesy pre-check so the user doesn't wait for an upload only to get rejected server-side.
const MAX_PLAYER_IMAGE_MB = 4;

@Component({
    selector: 'app-player-form',
    imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
    template: `
    <div class="max-w-3xl mx-auto space-y-5">

      <!-- Breadcrumb -->
      <nav class="flex items-center gap-2 text-sm" style="color:var(--text-muted)">
        <a routerLink="/players" class="hover:text-primary-600">{{ 'PLAYERS.TITLE' | translate }}</a>
        <span>/</span>
        <span style="color:var(--text-primary)">{{ isEdit() ? ('PLAYERS.FORM.EDIT_TITLE' | translate) : ('PLAYERS.FORM.ADD_TITLE' | translate) }}</span>
      </nav>

      <div class="card p-6 md:p-8">
        <h2 class="text-lg font-bold mb-6" style="color:var(--text-primary)">
          {{ isEdit() ? ('PLAYERS.FORM.EDIT_TITLE' | translate) : ('PLAYERS.FORM.ADD_TITLE' | translate) }}
        </h2>

        <form [formGroup]="form" (ngSubmit)="submit()">

          <!-- Photo picker -->
          <div class="flex flex-col items-center gap-3 mb-6 pb-6 border-b" style="border-color:var(--border-color)">
            <div class="relative cursor-pointer group" (click)="fileInput.click()">
              <div class="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center border-2 border-dashed transition-colors"
                   [style]="imagePreview() ? 'border-color:var(--border-color)' : 'border-color:var(--input-focus-border)'">
                @if (imagePreview()) {
                  <img [src]="imagePreview()!" alt="Preview" class="w-full h-full object-cover" />
                } @else {
                  <div class="w-full h-full flex items-center justify-center" style="background:rgba(34,197,94,0.08)">
                    <svg class="w-10 h-10" style="color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                      <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                    </svg>
                  </div>
                }
              </div>
              <div class="absolute inset-0 rounded-full bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </div>
            </div>
            <p class="text-xs" style="color:var(--text-muted)">{{ 'PLAYERS.FORM.PHOTO_HINT' | translate }}</p>
            <input #fileInput type="file" accept="image/*" class="hidden" (change)="onFileSelect($event)" />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">

            <!-- Name -->
            <div class="sm:col-span-2">
              <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">{{ 'PLAYERS.FORM.NAME' | translate }}</label>
              <input formControlName="name" type="text" class="form-input" [placeholder]="'PLAYERS.FORM.NAME_PH' | translate" />
              @if (form.get('name')?.invalid && form.get('name')?.touched) {
                <p class="field-error">{{ 'PLAYERS.FORM.NAME_ERR' | translate }}</p>
              }
            </div>

            <!-- Date of Birth — day/month/year selects instead of the native calendar picker,
                 so jumping to a birth year (2007–2019) doesn't mean paging through 12 years -->
            <div>
              <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">{{ 'PLAYERS.FORM.DOB' | translate }}</label>
              <div class="grid grid-cols-3 gap-2">
                <select class="form-input" [value]="dobDay()" (change)="onDobDayChange($event)"
                        [attr.aria-label]="'PLAYERS.FORM.DOB_DAY' | translate">
                  <option value="">{{ 'PLAYERS.FORM.DOB_DAY' | translate }}</option>
                  @for (d of dobDays(); track d) {
                    <option [value]="d">{{ d }}</option>
                  }
                </select>
                <select class="form-input" [value]="dobMonth()" (change)="onDobMonthChange($event)"
                        [attr.aria-label]="'PLAYERS.FORM.DOB_MONTH' | translate">
                  <option value="">{{ 'PLAYERS.FORM.DOB_MONTH' | translate }}</option>
                  @for (m of dobMonths; track m.value) {
                    <option [value]="m.value">{{ label(m.en, m.ar) }}</option>
                  }
                </select>
                <select class="form-input" [value]="dobYear()" (change)="onDobYearChange($event)"
                        [attr.aria-label]="'PLAYERS.FORM.DOB_YEAR' | translate">
                  <option value="">{{ 'PLAYERS.FORM.DOB_YEAR' | translate }}</option>
                  @for (y of dobYears; track y) {
                    <option [value]="y">{{ y }}</option>
                  }
                </select>
              </div>
              @if (form.get('dateOfBirth')?.invalid && form.get('dateOfBirth')?.touched) {
                <p class="field-error">{{ 'PLAYERS.FORM.DOB_ERR' | translate }}</p>
              }
            </div>

            <!-- Team (optional, scoped to the player's age group) -->
            <div>
              <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">{{ 'PLAYERS.FORM.TEAM' | translate }}</label>
              <select formControlName="team" class="form-input" (change)="onTeamSelectChange()">
                <option value="">
                  {{ !ageGroupForDob() ? ('PLAYERS.FORM.TEAM_LOCKED' | translate) : ('PLAYERS.FORM.TEAM_PH' | translate) }}
                </option>
                @for (t of teams(); track t._id) {
                  <option [value]="t._id">{{ t.name }} — {{ t.clubName }}</option>
                }
                @if (ageGroupForDob()) {
                  <option value="__other__">{{ 'PLAYERS.FORM.TEAM_OTHER' | translate }}</option>
                }
              </select>
              @if (form.get('team')?.value === '__other__') {
                <input formControlName="teamName" type="text" class="form-input mt-2"
                       [placeholder]="'PLAYERS.FORM.TEAM_NAME_PH' | translate" />
              } @else if (ageGroupForDob() && teams().length === 0) {
                <p class="text-xs mt-1.5 flex items-center gap-1" style="color:var(--text-muted)">
                  <svg style="width:12px;height:12px;flex-shrink:0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {{ 'PLAYERS.FORM.TEAM_EMPTY' | translate }}
                </p>
              } @else if (!ageGroupForDob()) {
                <p class="text-xs mt-1.5 flex items-center gap-1" style="color:var(--text-muted)">
                  <svg style="width:12px;height:12px;flex-shrink:0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {{ 'PLAYERS.FORM.TEAM_HINT' | translate }}
                </p>
              }
            </div>

            <!-- Position -->
            <div>
              <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">{{ 'PLAYERS.FORM.POSITION' | translate }}</label>
              <select formControlName="position" class="form-input">
                <option value="">{{ 'PLAYERS.FORM.POSITION_PH' | translate }}</option>
                @for (p of positions; track p.value) {
                  <option [value]="p.value">{{ p.value }} — {{ p.label }}</option>
                }
              </select>
            </div>

            <!-- Preferred Foot -->
            <div>
              <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">{{ 'PLAYERS.FORM.FOOT' | translate }}</label>
              <select formControlName="preferredFoot" class="form-input">
                <option value="">{{ 'PLAYERS.FORM.FOOT_PH' | translate }}</option>
                <option value="right">{{ 'PLAYERS.FORM.RIGHT' | translate }}</option>
                <option value="left">{{ 'PLAYERS.FORM.LEFT' | translate }}</option>
                <option value="both">{{ 'PLAYERS.FORM.BOTH' | translate }}</option>
              </select>
            </div>

            <!-- Nationality (country select) -->
            <div>
              <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">{{ 'PLAYERS.FORM.NATIONALITY' | translate }}</label>
              <select formControlName="nationality" class="form-input" (change)="onCountryChange()">
                <option value="">{{ 'PLAYERS.FORM.NATIONALITY_PH' | translate }}</option>
                @for (c of countries; track c.en) {
                  <option [value]="c.en">{{ label(c.en, c.ar) }}</option>
                }
              </select>
              @if (form.get('nationality')?.invalid && form.get('nationality')?.touched) {
                <p class="field-error">{{ 'PLAYERS.FORM.NATIONALITY_ERR' | translate }}</p>
              }
            </div>

            <!-- City (governorate — depends on the selected country) -->
            <div>
              <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">{{ 'PLAYERS.FORM.CITY' | translate }}</label>
              <select formControlName="city" class="form-input">
                <option value="">
                  {{ cities().length === 0 ? ('PLAYERS.FORM.CITY_LOCKED' | translate) : ('PLAYERS.FORM.CITY_PH' | translate) }}
                </option>
                @for (r of cities(); track r[0]) {
                  <option [value]="r[0]">{{ label(r[0], r[1]) }}</option>
                }
              </select>
              @if (cities().length === 0) {
                <p class="text-xs mt-1.5 flex items-center gap-1" style="color:var(--text-muted)">
                  <svg style="width:12px;height:12px;flex-shrink:0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {{ 'PLAYERS.FORM.CITY_HINT' | translate }}
                </p>
              } @else if (form.get('city')?.invalid && form.get('city')?.touched) {
                <p class="field-error">{{ 'PLAYERS.FORM.CITY_ERR' | translate }}</p>
              }
            </div>

            <!-- Address -->
            <div class="sm:col-span-2">
              <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">{{ 'PLAYERS.FORM.ADDRESS' | translate }}</label>
              <input formControlName="address" type="text" class="form-input" [placeholder]="'PLAYERS.FORM.ADDRESS_PH' | translate" />
            </div>

            <!-- Phone -->
            <div>
              <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">{{ 'PLAYERS.FORM.PHONE' | translate }}</label>
              <input formControlName="phoneNumber" type="tel" class="form-input" [placeholder]="'PLAYERS.FORM.PHONE_PH' | translate" />
              @if (form.get('phoneNumber')?.invalid && form.get('phoneNumber')?.touched) {
                <p class="field-error">{{ 'PLAYERS.FORM.PHONE_ERR' | translate }}</p>
              }
            </div>

            <!-- Height -->
            <div>
              <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">{{ 'PLAYERS.FORM.HEIGHT' | translate }}</label>
              <input formControlName="height" type="number" class="form-input" [placeholder]="'PLAYERS.FORM.HEIGHT_PH' | translate" />
            </div>

            <!-- Weight -->
            <div>
              <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">{{ 'PLAYERS.FORM.WEIGHT' | translate }}</label>
              <input formControlName="weight" type="number" class="form-input" [placeholder]="'PLAYERS.FORM.WEIGHT_PH' | translate" />
            </div>

            <!-- Notes -->
            <div class="sm:col-span-2">
              <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">{{ 'PLAYERS.FORM.NOTES' | translate }}</label>
              <textarea formControlName="notes" class="form-input resize-none" rows="3" [placeholder]="'PLAYERS.FORM.NOTES_PH' | translate"></textarea>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-3 mt-8 pt-5 border-t" style="border-color:var(--border-color)">
            <button type="submit" class="btn btn-primary" [disabled]="loading()">
              @if (loading()) {
                <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              }
              {{ loading() ? ('PLAYERS.FORM.SAVING' | translate) : (isEdit() ? ('PLAYERS.FORM.SAVE' | translate) : ('PLAYERS.FORM.ADD_BTN' | translate)) }}
            </button>
            <a routerLink="/players" class="btn btn-secondary">{{ 'COMMON.CANCEL' | translate }}</a>
          </div>
        </form>
      </div>
    </div>
  `
})
export class PlayerFormComponent implements OnInit {
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly playerService = inject(PlayerService);
  private readonly teamService = inject(TeamService);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly lang = inject(LanguageService);
  private readonly agesBase = `${environment.apiUrl}/ages`;

  readonly positions = PLAYER_POSITIONS;
  readonly countries = COUNTRIES;
  readonly loading = signal(false);
  readonly isEdit = signal(false);
  readonly imagePreview = signal<string | null>(null);
  readonly teams = signal<Team[]>([]);
  readonly ageGroups = signal<AgeGroup[]>([]);
  // Regions of the currently selected country (drives the city dropdown)
  readonly cities = signal<[string, string][]>([]);
  private selectedFile: File | null = null;
  private playerId = '';

  // The age group matching the currently entered birth date — null until a valid date is chosen.
  // Drives which teams appear in the Team dropdown (teams are always scoped to one age group).
  ageGroupForDob(): AgeGroup | undefined {
    const dob = this.form.get('dateOfBirth')?.value;
    if (!dob) return undefined;
    const year = new Date(dob).getFullYear();
    return this.ageGroups().find(g => g.birthYear === year);
  }

  // Reloads the team dropdown to match the age group derived from the given birth date,
  // and clears the current selection if it no longer belongs to that age group.
  private syncTeamsForDob(): void {
    const teamCtrl = this.form.get('team');
    const ageGroup = this.ageGroupForDob();

    if (!ageGroup) {
      this.teams.set([]);
      teamCtrl?.setValue('', { emitEvent: false });
      this.form.get('teamName')?.setValue('', { emitEvent: false });
      teamCtrl?.disable({ emitEvent: false });
      return;
    }

    teamCtrl?.enable({ emitEvent: false });
    this.teamService.getAll(ageGroup._id).subscribe(res => {
      const list = res.data?.documents ?? [];
      this.teams.set(list);
      const current = teamCtrl?.value;
      if (current && current !== '__other__' && !list.some(t => t._id === current)) {
        teamCtrl?.setValue('', { emitEvent: false });
      }
    });
  }

  // "غير موجود — اكتب اسم الفريق" اتاختار: نسيب المستخدم يكتب اسم حر بدل ما يختار فريق حقيقي
  onTeamSelectChange(): void {
    if (this.form.get('team')?.value !== '__other__') {
      this.form.get('teamName')?.setValue('');
    }
  }

  // Localized label for a [english, arabic] pair, based on the active UI language
  label(en: string, ar: string): string {
    return this.lang.current() === 'ar' ? ar : en;
  }

  private refreshCities(countryEn: string): void {
    const country = COUNTRIES.find(c => c.en === countryEn);
    const regions = country ? country.regions : [];
    this.cities.set(regions);
    const cityCtrl = this.form.get('city');
    if (regions.length) cityCtrl?.enable({ emitEvent: false });
    else cityCtrl?.disable({ emitEvent: false });
  }

  // User picked a different country → load its regions and clear the old city
  onCountryChange(): void {
    this.form.get('city')?.setValue('');
    this.refreshCities(this.form.get('nationality')?.value ?? '');
  }

  // Age groups are birth-year based (2007 → 2019) — years listed newest-birth-year-first
  // isn't needed here since there are only 13 of them; oldest→newest reads naturally.
  readonly dobYears = Array.from({ length: 2019 - 2007 + 1 }, (_, i) => 2007 + i);
  readonly dobMonths = [
    { value: 1, en: 'January', ar: 'يناير' },
    { value: 2, en: 'February', ar: 'فبراير' },
    { value: 3, en: 'March', ar: 'مارس' },
    { value: 4, en: 'April', ar: 'أبريل' },
    { value: 5, en: 'May', ar: 'مايو' },
    { value: 6, en: 'June', ar: 'يونيو' },
    { value: 7, en: 'July', ar: 'يوليو' },
    { value: 8, en: 'August', ar: 'أغسطس' },
    { value: 9, en: 'September', ar: 'سبتمبر' },
    { value: 10, en: 'October', ar: 'أكتوبر' },
    { value: 11, en: 'November', ar: 'نوفمبر' },
    { value: 12, en: 'December', ar: 'ديسمبر' },
  ];

  readonly dobDay = signal('');
  readonly dobMonth = signal('');
  readonly dobYear = signal('');

  // Days in the selected month/year (falls back to 31 until both are picked, so the
  // list doesn't collapse to nothing while the user is still choosing).
  readonly dobDays = computed(() => {
    const year = Number(this.dobYear());
    const month = Number(this.dobMonth());
    const count = year && month ? new Date(year, month, 0).getDate() : 31;
    return Array.from({ length: count }, (_, i) => i + 1);
  });

  private commitDob(): void {
    const y = this.dobYear(), m = this.dobMonth(), d = this.dobDay();
    const ctrl = this.form.get('dateOfBirth');
    ctrl?.setValue(y && m && d ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : '');
    ctrl?.markAsTouched();
    ctrl?.markAsDirty();
  }

  // Switching month/year can invalidate the picked day (e.g. 31 → February) — clamp it
  // down to the new last valid day instead of silently keeping an impossible date.
  private clampDobDay(): void {
    const maxDay = this.dobDays().length;
    if (this.dobDay() && Number(this.dobDay()) > maxDay) {
      this.dobDay.set(String(maxDay));
    }
  }

  onDobDayChange(event: Event): void {
    this.dobDay.set((event.target as HTMLSelectElement).value);
    this.commitDob();
  }

  onDobMonthChange(event: Event): void {
    this.dobMonth.set((event.target as HTMLSelectElement).value);
    this.clampDobDay();
    this.commitDob();
  }

  onDobYearChange(event: Event): void {
    this.dobYear.set((event.target as HTMLSelectElement).value);
    this.clampDobDay();
    this.commitDob();
  }

  // Keeps the day/month/year selects in sync whenever dateOfBirth changes from elsewhere
  // (edit-mode patchValue on load) — the selects never write here directly, only read.
  private syncDobPartsFromControl(value: string | null | undefined): void {
    if (!value) {
      this.dobDay.set('');
      this.dobMonth.set('');
      this.dobYear.set('');
      return;
    }
    const [y, m, d] = value.split('-');
    this.dobYear.set(y ?? '');
    this.dobMonth.set(m ? String(Number(m)) : '');
    this.dobDay.set(d ? String(Number(d)) : '');
  }

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    dateOfBirth: ['', Validators.required],
    team: [''],
    teamName: [''],
    position: ['', Validators.required],
    preferredFoot: ['', Validators.required],
    nationality: ['', Validators.required],
    city: ['', Validators.required],
    address: ['', Validators.required],
    phoneNumber: ['', [Validators.required, Validators.pattern(/^01[0125][0-9]{8}$/)]],
    height: [null as number | null],
    weight: [null as number | null],
    notes: [''],
  });

  ngOnInit(): void {
    // City starts locked until a country is chosen
    this.refreshCities(this.form.get('nationality')?.value ?? '');

    // Team starts locked until a birth date resolves to an age group
    this.form.get('team')?.disable({ emitEvent: false });

    this.http.get<PaginatedResponse<{ documents: AgeGroup[] }>>(this.agesBase).subscribe(res => {
      this.ageGroups.set(res.data?.documents ?? []);
      this.syncTeamsForDob();
    });
    this.form.get('dateOfBirth')?.valueChanges.subscribe(() => this.syncTeamsForDob());

    this.playerId = this.route.snapshot.paramMap.get('playerId') ?? '';
    if (this.playerId) {
      this.isEdit.set(true);
      this.playerService.getOne(this.playerId).subscribe(res => {
        const p = (res.data as any)?.player ?? (res.data as any)?.document;
        if (p) {
          // Load the country's regions first so the saved city can be selected
          this.refreshCities(p.nationality ?? '');
          // team comes back populated as an object ({_id,...}) — the select needs just the id.
          // No team but a free-text teamName → select shows the "other" option with the name filled in.
          const teamId = typeof p.team === 'object' && p.team ? p.team._id : (p.team ?? '');
          const dob = p.dateOfBirth?.split('T')[0] ?? '';
          this.form.patchValue({
            ...p,
            team: teamId || (p.teamName ? '__other__' : ''),
            teamName: p.teamName ?? '',
            dateOfBirth: dob,
          });
          // One-time — populates the day/month/year selects from the loaded value.
          // Not wired to valueChanges: commitDob() below writes intermediate '' values
          // while the user is still mid-pick, and re-deriving from THOSE would wipe out
          // whichever field they'd already chosen before the other two catch up.
          this.syncDobPartsFromControl(dob);
          if (p.profileImg) this.imagePreview.set(p.profileImg);
        }
      });
    }
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > MAX_PLAYER_IMAGE_MB * 1024 * 1024) {
      input.value = '';
      this.toast.error(this.translate.instant('PLAYERS.FORM.PHOTO_TOO_LARGE'));
      return;
    }
    this.selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => this.imagePreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    const payload = this.form.getRawValue() as any;
    // "other" is a UI-only sentinel — translate it into a free-text teamName and clear the real team ref.
    // Otherwise a real team was chosen (or none) — clear any previously-saved free-text name.
    if (payload.team === '__other__') {
      payload.team = null;
    } else {
      payload.teamName = null;
      if (!payload.team) payload.team = null;
    }

    const req$ = this.isEdit()
      ? this.playerService.update(this.playerId, payload)
      : this.playerService.create(payload);

    req$.subscribe({
      next: (res) => {
        const targetId = this.isEdit() ? this.playerId : (res.data as any)?.document?._id;

        if (this.selectedFile && targetId) {
          this.playerService.uploadProfileImg(targetId, this.selectedFile).subscribe({
            next: () => {
              this.toast.success(this.isEdit() ? this.translate.instant('PLAYERS.FORM.EDIT_TITLE') : this.translate.instant('PLAYERS.FORM.ADD_TITLE'));
              this.router.navigate(['/players', targetId]);
            },
            error: () => {
              this.toast.warning(this.translate.instant('PLAYERS.FORM.SAVING'));
              this.router.navigate(['/players', targetId]);
            },
          });
        } else {
          this.toast.success(this.isEdit() ? this.translate.instant('PLAYERS.FORM.EDIT_TITLE') : this.translate.instant('PLAYERS.FORM.ADD_TITLE'));
          this.router.navigate(targetId ? ['/players', targetId] : ['/players']);
          this.loading.set(false);
        }
      },
      // Error toast (in Arabic) is handled globally by the error interceptor
      error: () => this.loading.set(false),
    });
  }
}
