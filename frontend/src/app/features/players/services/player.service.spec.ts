import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { PlayerService } from './player.service';
import { environment } from '../../../../environments/environment';

describe('PlayerService.assignCoach', () => {
  let service: PlayerService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PlayerService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('PATCHes the dedicated coach endpoint with the coach id in the body', () => {
    service.assignCoach('p1', 'c1').subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/players/p1/coach`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ coach: 'c1' });
    req.flush({ status: 'success', data: { document: { _id: 'p1' } } });
  });

  it('does not go through the generic player update route', () => {
    // الراوت العام /players/:id بيرفض حقل coach من الأساس (lockField في الباكإند)،
    // فأي رجوع للمسار ده معناه إن التعيين اتكسر بصمت
    service.assignCoach('p1', 'c1').subscribe();

    httpMock.expectNone(`${environment.apiUrl}/players/p1`);
    httpMock.expectOne(`${environment.apiUrl}/players/p1/coach`).flush({
      status: 'success',
      data: { document: { _id: 'p1' } },
    });
  });

  it('surfaces the returned player document', () => {
    let received: any;
    service.assignCoach('p1', 'c1').subscribe(res => (received = res));

    httpMock.expectOne(`${environment.apiUrl}/players/p1/coach`).flush({
      status: 'success',
      data: { document: { _id: 'p1', name: 'Re-homed', coach: { _id: 'c1', name: 'New Coach' } } },
    });

    expect(received.data.document.coach.name).toBe('New Coach');
  });
});
