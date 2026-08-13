import { Component, inject, signal, computed, OnInit, ViewChild, ElementRef } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, AbstractControl } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { UserService } from '../services/user.service';
import { ToastService } from '../../../core/services/toast.service';
import { LanguageService } from '../../../core/services/language.service';

function passwordMatchValidator(control: AbstractControl) {
  const p = control.get('password')?.value;
  const c = control.get('passwordConfirm')?.value;
  return p === c ? null : { passwordMismatch: true };
}

@Component({
    selector: 'app-user-form',
    imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
    template: `
    <div class="max-w-xl mx-auto space-y-5">

      <nav class="flex items-center gap-2 text-sm" style="color:var(--text-muted)">
        <a [routerLink]="isObserverCtx() ? '/observers' : '/users'" class="hover:text-primary-600">
          {{ (isObserverCtx() ? 'OBSERVERS.TITLE' : 'COACHES.TITLE') | translate }}
        </a>
        <span>/</span>
        <span style="color:var(--text-primary)">{{ formTitleKey() | translate }}</span>
      </nav>

      <div class="card p-6">
        <h2 class="text-lg font-bold mb-6" style="color:var(--text-primary)">{{ formTitleKey() | translate }}</h2>

        <form [formGroup]="form" (ngSubmit)="submit()">

          <!-- Profile image picker -->
          <div class="flex flex-col items-center gap-3 mb-6 pb-6 border-b" style="border-color:var(--border-color)">
            <div class="relative cursor-pointer group" (click)="fileInput.click()">
              <div class="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center border-2 border-dashed transition-colors"
                   [style]="imagePreview() ? 'border-color:var(--border-color)' : 'border-color:var(--input-focus-border)'">
                @if (imagePreview()) {
                  <img [src]="imagePreview()!" alt="Preview" class="w-full h-full object-cover" />
                } @else {
                  <div class="w-full h-full flex items-center justify-center" style="background:rgba(34,197,94,0.08)">
                    <svg class="w-10 h-10" style="color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                    </svg>
                  </div>
                }
              </div>
              <!-- Camera overlay on hover -->
              <div class="absolute inset-0 rounded-full bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </div>
            </div>
            <p class="text-xs" style="color:var(--text-muted)">{{ 'COACHES.FORM.PHOTO_HINT' | translate }}</p>
            <input #fileInput type="file" accept="image/*" class="hidden" (change)="onFileSelect($event)" />
          </div>

          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">{{ 'COACHES.FORM.NAME' | translate }}</label>
              <input formControlName="name" type="text" class="form-input" [placeholder]="'COACHES.FORM.NAME_PH' | translate" />
            </div>

            <div>
              <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">{{ 'COACHES.FORM.ADDRESS' | translate }}</label>
              <input formControlName="address" type="text" class="form-input" [placeholder]="'COACHES.FORM.ADDRESS_PH' | translate" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">{{ 'COACHES.FORM.BIRTH_DATE' | translate }}</label>
              <div class="grid grid-cols-3 gap-2">
                <select class="form-input" [value]="dobDay()" (change)="onDobDayChange($event)"
                        [attr.aria-label]="'COACHES.FORM.BIRTH_DATE_DAY' | translate">
                  <option value="">{{ 'COACHES.FORM.BIRTH_DATE_DAY' | translate }}</option>
                  @for (d of dobDays(); track d) {
                    <option [value]="d">{{ d }}</option>
                  }
                </select>
                <select class="form-input" [value]="dobMonth()" (change)="onDobMonthChange($event)"
                        [attr.aria-label]="'COACHES.FORM.BIRTH_DATE_MONTH' | translate">
                  <option value="">{{ 'COACHES.FORM.BIRTH_DATE_MONTH' | translate }}</option>
                  @for (m of dobMonths; track m.value) {
                    <option [value]="m.value">{{ monthLabel(m) }}</option>
                  }
                </select>
                <select class="form-input" [value]="dobYear()" (change)="onDobYearChange($event)"
                        [attr.aria-label]="'COACHES.FORM.BIRTH_DATE_YEAR' | translate">
                  <option value="">{{ 'COACHES.FORM.BIRTH_DATE_YEAR' | translate }}</option>
                  @for (y of dobYears; track y) {
                    <option [value]="y">{{ y }}</option>
                  }
                </select>
              </div>
            </div>

            <!-- National ID card image pickers: front + back -->
            <div>
              <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">{{ 'COACHES.FORM.ID_CARD' | translate }}</label>
              <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-1.5">
                  <div class="relative cursor-pointer group rounded-xl overflow-hidden border-2 border-dashed transition-colors flex items-center justify-center"
                       style="aspect-ratio:16/10"
                       [style.border-color]="idCardFrontPreview() ? 'var(--border-color)' : 'var(--input-focus-border)'"
                       (click)="idCardFrontInput.click()">
                    @if (idCardFrontPreview()) {
                      <img [src]="idCardFrontPreview()!" alt="ID card front preview" class="w-full h-full object-cover" />
                      <div class="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                          <circle cx="12" cy="13" r="4"/>
                        </svg>
                      </div>
                    } @else {
                      <div class="w-full h-full flex flex-col items-center justify-center gap-1.5" style="background:rgba(34,197,94,0.06)">
                        <svg class="w-7 h-7" style="color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                          <rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2"/>
                          <path d="M14 10h6M14 14h4"/>
                        </svg>
                      </div>
                    }
                  </div>
                  <span class="text-xs text-center" style="color:var(--text-muted)">{{ 'COACHES.FORM.ID_CARD_FRONT' | translate }}</span>
                  <input #idCardFrontInput type="file" accept="image/*" class="hidden" (change)="onIdCardFrontSelect($event)" />
                </div>
                <div class="flex flex-col gap-1.5">
                  <div class="relative cursor-pointer group rounded-xl overflow-hidden border-2 border-dashed transition-colors flex items-center justify-center"
                       style="aspect-ratio:16/10"
                       [style.border-color]="idCardBackPreview() ? 'var(--border-color)' : 'var(--input-focus-border)'"
                       (click)="idCardBackInput.click()">
                    @if (idCardBackPreview()) {
                      <img [src]="idCardBackPreview()!" alt="ID card back preview" class="w-full h-full object-cover" />
                      <div class="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                          <circle cx="12" cy="13" r="4"/>
                        </svg>
                      </div>
                    } @else {
                      <div class="w-full h-full flex flex-col items-center justify-center gap-1.5" style="background:rgba(34,197,94,0.06)">
                        <svg class="w-7 h-7" style="color:var(--text-muted)" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                          <rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2"/>
                          <path d="M14 10h6M14 14h4"/>
                        </svg>
                      </div>
                    }
                  </div>
                  <span class="text-xs text-center" style="color:var(--text-muted)">{{ 'COACHES.FORM.ID_CARD_BACK' | translate }}</span>
                  <input #idCardBackInput type="file" accept="image/*" class="hidden" (change)="onIdCardBackSelect($event)" />
                </div>
              </div>
              <p class="text-xs mt-1.5" style="color:var(--text-muted)">{{ 'COACHES.FORM.ID_CARD_HINT' | translate }}</p>
            </div>

            <div>
              <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">{{ 'COACHES.FORM.EMAIL' | translate }}</label>
              <input formControlName="email" type="email" class="form-input" [placeholder]="'COACHES.FORM.EMAIL_PH' | translate" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">{{ 'COACHES.FORM.PHONE' | translate }}</label>
              <input formControlName="phoneNumber" type="tel" inputmode="tel" autocomplete="tel"
                     class="form-input" [placeholder]="'COACHES.FORM.PHONE_PH' | translate" />
              @if (form.get('phoneNumber')?.invalid && form.get('phoneNumber')?.touched) {
                <p class="field-error">{{ 'COACHES.FORM.PHONE_ERR' | translate }}</p>
              }
            </div>
            <div>
              <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">{{ 'COACHES.FORM.ROLE' | translate }}</label>
              <select formControlName="role" class="form-input">
                <option value="coach">{{ 'COACHES.FORM.COACH' | translate }}</option>
                <option value="admin">{{ 'COACHES.FORM.ADMIN' | translate }}</option>
                <option value="observer">{{ 'COACHES.FORM.OBSERVER' | translate }}</option>
              </select>
            </div>

            @if (!isEdit()) {
              <div>
                <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">{{ 'COACHES.FORM.PASSWORD' | translate }}</label>
                <input formControlName="password" type="password" class="form-input" placeholder="••••••••" />
              </div>
              <div>
                <label class="block text-sm font-medium mb-1.5" style="color:var(--text-primary)">{{ 'COACHES.FORM.CONFIRM_PW' | translate }}</label>
                <input formControlName="passwordConfirm" type="password" class="form-input" placeholder="••••••••" />
                @if (form.hasError('passwordMismatch') && form.get('passwordConfirm')?.touched) {
                  <p class="field-error">{{ 'COACHES.FORM.PW_MISMATCH' | translate }}</p>
                }
              </div>
            }
          </div>

          <div class="flex gap-3 mt-8 pt-5 border-t" style="border-color:var(--border-color)">
            <button type="submit" class="btn btn-primary" [disabled]="loading()">
              {{ loading() ? ('COACHES.FORM.SAVING' | translate) : (isEdit() ? ('COACHES.FORM.SAVE' | translate) : ('COACHES.FORM.ADD_BTN' | translate)) }}
            </button>
            <a [routerLink]="isObserverCtx() ? '/observers' : '/users'" class="btn btn-secondary">{{ 'COMMON.CANCEL' | translate }}</a>
          </div>
        </form>
      </div>
    </div>
  `
})
export class UserFormComponent implements OnInit {
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly userService = inject(UserService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly lang = inject(LanguageService);

  readonly loading = signal(false);
  readonly isEdit = signal(false);
  readonly isObserverCtx = signal(false);
  readonly imagePreview = signal<string | null>(null);
  readonly idCardFrontPreview = signal<string | null>(null);
  readonly idCardBackPreview = signal<string | null>(null);
  private selectedFile: File | null = null;
  private selectedIdCardFrontFile: File | null = null;
  private selectedIdCardBackFile: File | null = null;
  private userId = '';

  readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    phoneNumber: ['', [Validators.pattern(/^01[0125][0-9]{8}$/)]],
    address: [''],
    birthDate: [''],
    role: ['coach'],
    password: [''],
    passwordConfirm: [''],
  }, { validators: passwordMatchValidator });

  // Birth date — day/month/year selects instead of the native calendar picker (same pattern
  // as the player form), just with a wide adult year range instead of an age-group-bound one.
  private readonly currentYear = new Date().getFullYear();
  readonly dobYears = Array.from({ length: 100 }, (_, i) => this.currentYear - 16 - i); // newest first
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

  monthLabel(m: { en: string; ar: string }): string {
    return this.lang.current() === 'ar' ? m.ar : m.en;
  }

  readonly dobDay = signal('');
  readonly dobMonth = signal('');
  readonly dobYear = signal('');

  readonly dobDays = computed(() => {
    const year = Number(this.dobYear());
    const month = Number(this.dobMonth());
    const count = year && month ? new Date(year, month, 0).getDate() : 31;
    return Array.from({ length: count }, (_, i) => i + 1);
  });

  private commitBirthDate(): void {
    const y = this.dobYear(), m = this.dobMonth(), d = this.dobDay();
    this.form.get('birthDate')?.setValue(y && m && d ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : '');
  }

  private clampDobDay(): void {
    const maxDay = this.dobDays().length;
    if (this.dobDay() && Number(this.dobDay()) > maxDay) {
      this.dobDay.set(String(maxDay));
    }
  }

  onDobDayChange(event: Event): void {
    this.dobDay.set((event.target as HTMLSelectElement).value);
    this.commitBirthDate();
  }

  onDobMonthChange(event: Event): void {
    this.dobMonth.set((event.target as HTMLSelectElement).value);
    this.clampDobDay();
    this.commitBirthDate();
  }

  onDobYearChange(event: Event): void {
    this.dobYear.set((event.target as HTMLSelectElement).value);
    this.clampDobDay();
    this.commitBirthDate();
  }

  // One-time — populates the selects when editing a user with a saved birth date. Not wired
  // to birthDate's valueChanges: commitBirthDate() above writes intermediate '' values while
  // the user is still mid-pick, and re-deriving from THOSE would wipe out whichever field
  // they'd already chosen before the other two catch up.
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

  formTitleKey(): string {
    const group = this.isObserverCtx() ? 'OBSERVERS' : 'COACHES';
    return `${group}.FORM.${this.isEdit() ? 'EDIT_TITLE' : 'ADD_TITLE'}`;
  }

  ngOnInit(): void {
    // Keep the observer-context flag in sync with the selected role
    this.form.get('role')!.valueChanges.subscribe(r => this.isObserverCtx.set(r === 'observer'));

    this.userId = this.route.snapshot.paramMap.get('userId') ?? '';
    if (this.userId) {
      this.isEdit.set(true);
      this.form.get('password')?.clearValidators();
      this.form.get('passwordConfirm')?.clearValidators();
      this.userService.getOne(this.userId).subscribe(res => {
        const u = (res.data as any)?.document;
        if (u) {
          const birthDate = u.birthDate ? u.birthDate.slice(0, 10) : '';
          this.form.patchValue({
            name: u.name,
            email: u.email,
            phoneNumber: u.phoneNumber ?? '',
            address: u.address ?? '',
            birthDate,
            role: u.role,
          });
          this.syncDobPartsFromControl(birthDate);
          this.isObserverCtx.set(u.role === 'observer');
          if (u.profileImg) this.imagePreview.set(u.profileImg);
          // ملاحظة: صور البطاقة الشخصية محمية بباسورد الخزنة ومش بترجع مع بيانات اليوزر العادية،
          // فمعاينتها هنا بتفضل فاضية إلا لو الأدمن رفع صورة جديدة في نفس الجلسة
        }
      });
    } else {
      // Preselect role from query param (e.g. coming from the Observers page)
      const roleParam = this.route.snapshot.queryParamMap.get('role');
      if (roleParam === 'observer' || roleParam === 'admin' || roleParam === 'coach') {
        this.form.patchValue({ role: roleParam });
        this.isObserverCtx.set(roleParam === 'observer');
      }
      this.form.get('password')?.setValidators([Validators.required, Validators.minLength(8)]);
      this.form.get('passwordConfirm')?.setValidators(Validators.required);
    }
  }

  onFileSelect(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => this.imagePreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  onIdCardFrontSelect(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.selectedIdCardFrontFile = file;
    const reader = new FileReader();
    reader.onload = (e) => this.idCardFrontPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  onIdCardBackSelect(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.selectedIdCardBackFile = file;
    const reader = new FileReader();
    reader.onload = (e) => this.idCardBackPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    const v = this.form.getRawValue();

    const req$ = this.isEdit()
      ? this.userService.update(this.userId, { name: v.name!, email: v.email!, phoneNumber: v.phoneNumber || undefined, address: v.address || undefined, birthDate: v.birthDate || undefined, role: v.role as any })
      : this.userService.create({ name: v.name!, email: v.email!, password: v.password!, passwordConfirm: v.passwordConfirm!, phoneNumber: v.phoneNumber || undefined, address: v.address || undefined, birthDate: v.birthDate || undefined, role: v.role as any });

    // Observers belong to their own page; coaches/admins go back to the users area
    const dest = (targetId?: string): any[] =>
      v.role === 'observer'
        ? ['/observers']
        : (targetId ? ['/users', targetId] : ['/users']);

    req$.subscribe({
      next: (res) => {
        const targetId = this.isEdit() ? this.userId : (res.data as any)?.document?._id;
        this.finishSubmit(targetId, dest);
      },
      error: () => this.loading.set(false),
    });
  }

  private finishSubmit(targetId: string | undefined, dest: (targetId?: string) => any[]): void {
    const uploads: Array<() => import('rxjs').Observable<unknown>> = [];
    if (this.selectedFile && targetId) uploads.push(() => this.userService.uploadProfileImg(targetId, this.selectedFile!));
    if (this.selectedIdCardFrontFile && targetId) uploads.push(() => this.userService.uploadIdCardFrontImg(targetId, this.selectedIdCardFrontFile!));
    if (this.selectedIdCardBackFile && targetId) uploads.push(() => this.userService.uploadIdCardBackImg(targetId, this.selectedIdCardBackFile!));

    const done = () => {
      this.toast.success(this.isEdit() ? this.translate.instant('COACHES.FORM.EDIT_TITLE') : this.translate.instant('COACHES.FORM.ADD_TITLE'));
      this.router.navigate(dest(targetId));
    };

    if (uploads.length === 0) {
      done();
      this.loading.set(false);
      return;
    }

    const runNext = (index: number): void => {
      if (index >= uploads.length) { done(); return; }
      uploads[index]().subscribe({
        next: () => runNext(index + 1),
        error: () => {
          this.toast.warning(this.translate.instant('COACHES.FORM.SAVE'));
          runNext(index + 1);
        },
      });
    };
    runNext(0);
  }
}
