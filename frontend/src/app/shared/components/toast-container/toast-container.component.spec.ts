import { TestBed } from '@angular/core/testing';
import { ToastContainerComponent } from './toast-container.component';

// Frontend audit fix B1 — the per-toast icon used to be [innerHTML]-bound to
// an SVG string, which Angular's sanitizer strips (svg/path/circle aren't in
// its HTML allowlist). Assert a real <svg> renders for each toast type.
describe('ToastContainerComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToastContainerComponent],
    }).compileComponents();
  });

  function detect() {
    const fixture = TestBed.createComponent(ToastContainerComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders a real SVG icon for a success toast', () => {
    const fixture = detect();
    fixture.componentInstance.toastService.success('done');
    fixture.detectChanges();
    const svg = fixture.nativeElement.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.querySelector('polyline[points="20 6 9 17 4 12"]')).toBeTruthy();
  });

  it('renders a distinct SVG icon for an error toast', () => {
    const fixture = detect();
    fixture.componentInstance.toastService.error('oops');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    // error icon has two crossed <line> children, not the success checkmark
    expect(el.querySelector('polyline[points="20 6 9 17 4 12"]')).toBeFalsy();
    expect(el.querySelectorAll('svg line').length).toBeGreaterThanOrEqual(2);
  });
});
