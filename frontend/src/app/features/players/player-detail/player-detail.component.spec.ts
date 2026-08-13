import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { PlayerDetailComponent } from './player-detail.component';
import { PlayerService } from '../services/player.service';
import { UserService } from '../../users/services/user.service';
import { ScoutingReportService } from '../../scouting-reports/services/scouting-report.service';
import { SocketService } from '../../../core/services/socket.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Player } from '../../../core/models/player.model';

// اللاعب "اليتيم" — كوتشه اتمسح نهائياً من الباكإند فالحقل coach بيرجع فاضي.
// الحالة دي بقت ممكنة بعد §9، والتستات دي بتثبت إن الصفحة بترندر عادي وبتوضّح
// الحالة بدل ما تسيبها مبهمة أو ترمي.
const basePlayer = (overrides: Partial<Player> = {}): Player => ({
  _id: 'p1',
  name: 'Orphan Player',
  dateOfBirth: '2012-05-01',
  position: 'Midfielder',
  preferredFoot: 'Right',
  nationality: 'Egyptian',
  city: 'Cairo',
  address: '1 Test St',
  phoneNumber: '01012345678',
  status: 'pending',
  observers: [],
  createdAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
} as Player);

const coachList = [
  { _id: 'c1', name: 'New Coach', email: 'c1@test.com', role: 'coach' },
  { _id: 'c2', name: 'Other Coach', email: 'c2@test.com', role: 'coach' },
];

// حالة مشتركة بين الـdescribe الاتنين — بتتظبط من setup() في كل تست
let fixture: ComponentFixture<PlayerDetailComponent>;
let compiled: HTMLElement;
let isAdmin: ReturnType<typeof signal<boolean>>;
let assignCoachSpy: jasmine.Spy;
let userGetAllSpy: jasmine.Spy;

async function setup(player: Player, admin = true) {
    isAdmin = signal(admin);

    assignCoachSpy = jasmine
      .createSpy('assignCoach')
      .and.returnValue(of({ status: 'success', data: { document: { ...player, coach: { _id: 'c1', name: 'New Coach' } } } }));

    const playerServiceStub = {
      getOne: () => of({ status: 'success', data: { document: player } }),
      updateStatus: jasmine.createSpy('updateStatus'),
      updateObservers: jasmine.createSpy('updateObservers'),
      assignCoach: assignCoachSpy,
      delete: jasmine.createSpy('delete'),
    };
    userGetAllSpy = jasmine
      .createSpy('getAll')
      .and.returnValue(of({ status: 'success', count: 1, data: { documents: coachList } }));
    const userServiceStub = { getAll: userGetAllSpy };
    const reportServiceStub = {
      getStatistics: () => of({ status: 'success', data: { statistics: null } }),
      getAll: () => of({ status: 'success', count: 0, data: { documents: [] } }),
    };
    const socketStub = { getPlayerStatusUpdates: () => of(null) };
    const authStub = {
      isAdmin,
      isCoach: signal(!admin),
      isObserver: signal(false),
      currentUser: signal({ _id: 'u1', role: admin ? 'admin' : 'coach' }),
    };

    await TestBed.configureTestingModule({
      imports: [PlayerDetailComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTranslateService({ lang: 'en', fallbackLang: 'en' }),
        { provide: PlayerService, useValue: playerServiceStub },
        { provide: UserService, useValue: userServiceStub },
        { provide: ScoutingReportService, useValue: reportServiceStub },
        { provide: SocketService, useValue: socketStub },
        { provide: AuthService, useValue: authStub },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['success', 'error', 'info']) },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ id: 'p1' }), queryParamMap: convertToParamMap({}) },
            paramMap: of(convertToParamMap({ id: 'p1' })),
            queryParamMap: of(convertToParamMap({})),
          },
        },
      ],
    }).compileComponents();

    // بدون ملفات ترجمة محمّلة، instant() بترجّع المفتاح نفسه — وده كفاية عشان
    // نتأكد إن المفتاح الصح اتستخدم من غير ما نربط التست بنص إنجليزي أو عربي
    TestBed.inject(TranslateService).use('en');

    fixture = TestBed.createComponent(PlayerDetailComponent);
    fixture.detectChanges();
    compiled = fixture.nativeElement;
    return fixture.componentInstance;
}

describe('PlayerDetailComponent — player with no coach', () => {
  it('renders without throwing when coach is missing', async () => {
    const comp = await setup(basePlayer({ coach: undefined }));
    expect(comp.player()?.name).toBe('Orphan Player');
    expect(compiled.textContent).toContain('Orphan Player');
  });

  it('flags the player as orphaned for an admin', async () => {
    const comp = await setup(basePlayer({ coach: undefined }), true);
    expect(comp.isOrphaned()).toBeTrue();
    expect(comp.coachName()).toBe('');
    expect(comp.coachId()).toBe('');
  });

  it('shows the no-coach label instead of silently hiding the field', async () => {
    await setup(basePlayer({ coach: undefined }), true);
    expect(compiled.textContent).toContain('PLAYERS.NO_COACH');
  });

  it('does not flag orphaned for a coach — the API omits the field for them anyway', async () => {
    const comp = await setup(basePlayer({ coach: undefined }), false);
    expect(comp.isOrphaned()).toBeFalse();
  });

  it('a populated coach is shown normally and is not flagged', async () => {
    const comp = await setup(
      basePlayer({ coach: { _id: 'c1', name: 'Real Coach' } as any }),
      true
    );
    expect(comp.isOrphaned()).toBeFalse();
    expect(comp.coachName()).toBe('Real Coach');
    expect(comp.coachId()).toBe('c1');
    expect(compiled.textContent).toContain('Real Coach');
    expect(compiled.textContent).not.toContain('PLAYERS.NO_COACH');
  });

  it('a coach sent as a bare id string does not crash coachName()', async () => {
    const comp = await setup(basePlayer({ coach: 'c1' as any }), true);
    expect(comp.coachName()).toBe('');
    expect(comp.coachId()).toBe('c1');
    expect(comp.isOrphaned()).toBeFalse();
  });

  it('the details field list says "no coach" rather than a bare dash', async () => {
    const comp = await setup(basePlayer({ coach: undefined }), true);
    const coachField = comp.playerFields().find((f) => f.label === 'PLAYERS.DETAIL.COACH');
    expect(coachField).toBeDefined();
    expect(coachField!.value).toBe('PLAYERS.NO_COACH');
  });
});

describe('PlayerDetailComponent — assigning a coach', () => {
  it('offers the assign-coach control to an admin on an orphaned player', async () => {
    await setup(basePlayer({ coach: undefined }), true);
    expect(compiled.textContent).toContain('PLAYERS.DETAIL.ASSIGN_COACH');
  });

  it('hides the control from a coach', async () => {
    await setup(basePlayer({ coach: undefined }), false);
    expect(compiled.textContent).not.toContain('PLAYERS.DETAIL.ASSIGN_COACH');
  });

  it('hides the control when the player already has a coach', async () => {
    await setup(basePlayer({ coach: { _id: 'c9', name: 'Existing' } as any }), true);
    expect(compiled.textContent).not.toContain('PLAYERS.DETAIL.ASSIGN_COACH');
  });

  it('loads the coach list only once the panel is opened', async () => {
    const comp = await setup(basePlayer({ coach: undefined }), true);
    // اللاعب نفسه بيحمّل الأوبزيرفرز عند الفتح، فبنعدّ نداءات role=coach تحديداً
    const coachCalls = () =>
      userGetAllSpy.calls.allArgs().filter(([f]: any[]) => f?.role === 'coach').length;

    expect(coachCalls()).toBe(0);

    comp.toggleCoachPanel();
    expect(coachCalls()).toBe(1);
    expect(comp.coaches().length).toBe(2);

    // إعادة الفتح مابتعملش ريكوست تاني
    comp.toggleCoachPanel();
    comp.toggleCoachPanel();
    expect(coachCalls()).toBe(1);
  });

  it('calls the service with the player id and the picked coach', async () => {
    const comp = await setup(basePlayer({ coach: undefined }), true);
    comp.toggleCoachPanel();
    comp.selectedCoach.set('c2');

    comp.saveCoach();

    expect(assignCoachSpy).toHaveBeenCalledWith('p1', 'c2');
  });

  it('refreshes the player and closes the panel after a successful assign', async () => {
    const comp = await setup(basePlayer({ coach: undefined }), true);
    comp.toggleCoachPanel();
    comp.selectedCoach.set('c1');

    comp.saveCoach();

    expect((comp.player()!.coach as any).name).toBe('New Coach');
    expect(comp.isOrphaned()).toBeFalse();
    expect(comp.coachPanelOpen()).toBeFalse();
    expect(comp.savingCoach()).toBeFalse();
  });

  it('does nothing when no coach has been picked', async () => {
    const comp = await setup(basePlayer({ coach: undefined }), true);
    comp.toggleCoachPanel();

    comp.saveCoach();

    expect(assignCoachSpy).not.toHaveBeenCalled();
  });
});
