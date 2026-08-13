import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { errorInterceptor } from './error.interceptor';
import { ToastService } from '../services/toast.service';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let toastSpy: jasmine.SpyObj<ToastService>;

  beforeEach(() => {
    toastSpy = jasmine.createSpyObj<ToastService>('ToastService', ['error', 'success', 'info']);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: ToastService, useValue: toastSpy },
      ],
    });

    http     = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('shows toast error for 404 response', () => {
    http.get('/api/v1/players/nonexistent').subscribe({ error: () => {} });
    const req = httpMock.expectOne('/api/v1/players/nonexistent');
    req.flush({ message: 'Player not found' }, { status: 404, statusText: 'Not Found' });

    expect(toastSpy.error).toHaveBeenCalled();
  });

  it('shows toast error for 400 response', () => {
    http.get('/api/v1/players').subscribe({ error: () => {} });
    const req = httpMock.expectOne('/api/v1/players');
    req.flush({ message: 'Invalid input data' }, { status: 400, statusText: 'Bad Request' });

    expect(toastSpy.error).toHaveBeenCalled();
  });

  it('shows toast error for 403 response', () => {
    http.get('/api/v1/users').subscribe({ error: () => {} });
    const req = httpMock.expectOne('/api/v1/users');
    req.flush({ message: 'not allowed to access' }, { status: 403, statusText: 'Forbidden' });

    expect(toastSpy.error).toHaveBeenCalled();
  });

  it('shows toast error for 500 server error', () => {
    http.get('/api/v1/players').subscribe({ error: () => {} });
    const req = httpMock.expectOne('/api/v1/players');
    req.flush({ message: 'Something went wrong' }, { status: 500, statusText: 'Server Error' });

    expect(toastSpy.error).toHaveBeenCalled();
  });

  it('silently passes through 401 for non-login endpoints', () => {
    http.get('/api/v1/players').subscribe({ error: () => {} });
    const req = httpMock.expectOne('/api/v1/players');
    req.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    // error interceptor skips 401 for non-login URLs
    expect(toastSpy.error).not.toHaveBeenCalled();
  });

  it('shows toast for 401 on login endpoint', () => {
    http.post('/api/v1/auth/login', {}).subscribe({ error: () => {} });
    const req = httpMock.expectOne('/api/v1/auth/login');
    req.flush({ message: 'Invalid email or password' }, { status: 401, statusText: 'Unauthorized' });

    expect(toastSpy.error).toHaveBeenCalled();
  });

  it('maps express-validator error array to toast message', () => {
    http.post('/api/v1/players', {}).subscribe({ error: () => {} });
    const req = httpMock.expectOne('/api/v1/players');
    req.flush(
      { errors: [{ msg: 'Name is required', path: 'name' }] },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(toastSpy.error).toHaveBeenCalled();
  });

  it('translates known error messages to Arabic', () => {
    http.get('/api/v1/players').subscribe({ error: () => {} });
    const req = httpMock.expectOne('/api/v1/players');
    req.flush({ message: 'Player not found' }, { status: 404, statusText: 'Not Found' });

    const call = toastSpy.error.calls.mostRecent();
    // نفس صياغة MESSAGE_MAP بالظبط — الملف كله بالفصحى ('غير مصرح لك'، 'هذه
    // البيانات'...)، والتست كان متكتب بالعامية ('مش موجود') فكان أحمر من الأصل
    expect(call.args[0]).toContain('اللاعب غير موجود');
  });

  it('does not show toast for successful responses', () => {
    http.get('/api/v1/players').subscribe();
    const req = httpMock.expectOne('/api/v1/players');
    req.flush({ status: 'success', data: { documents: [] } });

    expect(toastSpy.error).not.toHaveBeenCalled();
  });
});
