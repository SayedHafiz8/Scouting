import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { MediaGalleryComponent } from './media-gallery.component';
import { MediaService } from '../services/media.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { User, UserRole } from '../../../core/models/user.model';

// admin-assign-players-reports-media — the admin joined the write-role triad
// (playerMediaRouter accepts ADMIN on every upload route now, attributed via
// resolveEffectiveAuthor). No test previously existed for this component at
// all; this covers only the role gates this stage touches, not the upload
// flow itself (that lives in media-upload.component.ts, untested prior to
// this stage — a full TUS-upload spec is a separate undertaking).

let fixture: ComponentFixture<MediaGalleryComponent>;

function makeUser(role: UserRole): User {
  return {
    _id: 'u1', name: 'Test User', email: 't@t.com', role, active: true,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

async function setup(role: UserRole, media: any[] = []) {
  const authStub = {
    currentUser: signal<User | null>(makeUser(role)),
    isAdmin: signal(role === 'admin'),
    isCoach: signal(role === 'coach'),
    isObserver: signal(role === 'observer'),
    isProScout: signal(role === 'proScout'),
  };

  await TestBed.configureTestingModule({
    imports: [MediaGalleryComponent],
    providers: [
      provideRouter([]),
      provideTranslateService({ lang: 'en', fallbackLang: 'en' }),
      { provide: AuthService, useValue: authStub },
      {
        provide: MediaService,
        useValue: {
          getAll: () => of({ status: 'success', count: media.length, data: { documents: media } }),
        },
      },
      { provide: ToastService, useValue: { success: jasmine.createSpy(), error: jasmine.createSpy() } },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { pathFromRoot: [{ paramMap: convertToParamMap({ playerId: 'p1' }) }] },
        },
      },
    ],
  }).compileComponents();

  TestBed.inject(TranslateService).use('en');
  fixture = TestBed.createComponent(MediaGalleryComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const uploadButton = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('button')).find(b => b.textContent?.includes('MEDIA.UPLOAD_BTN')) ?? null;

describe('MediaGalleryComponent — upload action per role', () => {
  it('admin gets the upload button (header)', async () => {
    const el = await setup('admin', [{ _id: 'm1', type: 'image', player: 'p1' }]);
    expect(uploadButton(el)).toBeTruthy();
  });

  it('admin gets the upload action from the empty state too', async () => {
    const el = await setup('admin', []);
    expect(el.textContent).toContain('MEDIA.EMPTY');
    // empty-state renders its own action button via app-empty-state — presence
    // of the translated label text is the reachable assertion here
    expect(el.textContent).toContain('MEDIA.UPLOAD_MEDIA');
  });

  it('coach still gets the upload button (unaffected regression)', async () => {
    const el = await setup('coach', [{ _id: 'm1', type: 'image', player: 'p1' }]);
    expect(uploadButton(el)).toBeTruthy();
  });

  it('observer still gets the upload button (unaffected regression)', async () => {
    const el = await setup('observer', [{ _id: 'm1', type: 'image', player: 'p1' }]);
    expect(uploadButton(el)).toBeTruthy();
  });

  it('proScout still gets the upload button (unaffected regression)', async () => {
    const el = await setup('proScout', [{ _id: 'm1', type: 'image', player: 'p1' }]);
    expect(uploadButton(el)).toBeTruthy();
  });
});
