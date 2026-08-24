import { TestBed } from '@angular/core/testing';
import { EmptyStateComponent } from './empty-state.component';

// Frontend audit fix B1 — this component used to accept a raw SVG string and
// render it via [innerHTML]. Angular's HTML sanitizer strips svg/path/circle
// (they're not in its allowlist), so the icon rendered as nothing in
// production. These tests assert real SVG elements are in the DOM.
describe('EmptyStateComponent', () => {
  let compiled: HTMLElement;

  async function setup(icon?: 'default' | 'players' | 'reports' | 'media') {
    await TestBed.configureTestingModule({
      imports: [EmptyStateComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(EmptyStateComponent);
    if (icon) fixture.componentRef.setInput('icon', icon);
    fixture.detectChanges();
    compiled = fixture.nativeElement;
  }

  it('renders a real, non-empty <svg> for the default icon', async () => {
    await setup();
    const svg = compiled.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg!.querySelector('path')).toBeTruthy();
  });

  it('renders the players icon', async () => {
    await setup('players');
    expect(compiled.querySelector('circle[cx="12"][cy="8"]')).toBeTruthy();
  });

  it('renders the reports icon', async () => {
    await setup('reports');
    expect(compiled.querySelector('path[d*="14 2H6"]')).toBeTruthy();
  });

  it('renders the media icon', async () => {
    await setup('media');
    expect(compiled.querySelector('rect[width="18"][height="18"]')).toBeTruthy();
    expect(compiled.querySelector('circle[cx="8.5"][cy="8.5"]')).toBeTruthy();
  });
});
