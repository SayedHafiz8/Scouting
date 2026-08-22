import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { signal } from '@angular/core';

import { UserFormComponent } from './user-form.component';
import { UserService } from '../services/user.service';
import { ToastService } from '../../../core/services/toast.service';
import { LanguageService } from '../../../core/services/language.service';

// Stage 4 / FR-017 — an admin must be able to assign the proScout role from the UI.
// Before this stage the role <select> was three hard-coded <option> literals, so the
// role could only be assigned by calling the API directly (Constitution Principle VII).

let fixture: ComponentFixture<UserFormComponent>;
let compiled: HTMLElement;

async function setup(params: Record<string, string> = {}, queryParams: Record<string, string> = {}) {
  const userServiceStub = {
    getOne: () => of({ status: 'success', data: { document: null } }),
    create: jasmine.createSpy('create'),
    update: jasmine.createSpy('update'),
    uploadProfileImg: jasmine.createSpy('uploadProfileImg'),
    uploadIdCardFrontImg: jasmine.createSpy('uploadIdCardFrontImg'),
    uploadIdCardBackImg: jasmine.createSpy('uploadIdCardBackImg'),
  };

  await TestBed.configureTestingModule({
    imports: [UserFormComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideTranslateService({ lang: 'en', fallbackLang: 'en' }),
      { provide: UserService, useValue: userServiceStub },
      { provide: ToastService, useValue: { success: () => {}, error: () => {} } },
      { provide: LanguageService, useValue: { current: signal('en') } },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap(params),
            queryParamMap: convertToParamMap(queryParams),
          },
          paramMap: of(convertToParamMap(params)),
          queryParamMap: of(convertToParamMap(queryParams)),
        },
      },
    ],
  }).compileComponents();

  TestBed.inject(TranslateService).use('en');

  fixture = TestBed.createComponent(UserFormComponent);
  fixture.detectChanges();
  compiled = fixture.nativeElement;
  return fixture.componentInstance;
}

const roleValues = () =>
  Array.from(compiled.querySelectorAll<HTMLOptionElement>('select[formControlName="role"] option'))
    .map(o => o.value);

describe('UserFormComponent — role selector (FR-017)', () => {
  it('offers proScout as an assignable role', async () => {
    await setup();
    expect(roleValues()).toContain('proScout');
  });

  it('still offers the three pre-existing roles, with unchanged values', async () => {
    // Principle III — this stage adds a role option, it does not renumber or rename
    // the ones an admin already relies on.
    await setup();
    const values = roleValues();
    expect(values).toContain('coach');
    expect(values).toContain('admin');
    expect(values).toContain('observer');
  });

  it('renders exactly four options — deny-by-default, no stray role leaks in', async () => {
    await setup();
    expect(roleValues().length).toBe(4);
  });

  it('renders the options in the declared order', async () => {
    // The list is data-driven now; declaration order in ROLE_OPTIONS is render order.
    await setup();
    expect(roleValues()).toEqual(['coach', 'admin', 'observer', 'proScout']);
  });

  it('selecting proScout does not put the form into observer context', async () => {
    // isObserverCtx drives the breadcrumb and redirect target; a fourth role must not
    // accidentally inherit the observer branch.
    const comp = await setup();
    comp.form.get('role')!.setValue('proScout');
    fixture.detectChanges();
    expect(comp.isObserverCtx()).toBeFalse();
  });
});
