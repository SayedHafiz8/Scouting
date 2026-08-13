import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { StatCardComponent } from './stat-card.component';

describe('StatCardComponent', () => {
  let fixture: ComponentFixture<StatCardComponent>;
  let compiled: HTMLElement;

  async function setup(inputs: Partial<{
    label: string; value: number | string; iconName: string;
    iconBg: string; iconColor: string; subtitle: string;
    link: string | null; queryParams: Record<string, string> | null;
  }> = {}) {
    await TestBed.configureTestingModule({
      imports: [StatCardComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(StatCardComponent);

    // Set inputs via the fixture's componentRef
    const comp = fixture.componentRef;
    if (inputs.label     !== undefined) comp.setInput('label',       inputs.label);
    if (inputs.value     !== undefined) comp.setInput('value',       inputs.value);
    if (inputs.iconName  !== undefined) comp.setInput('iconName',    inputs.iconName);
    if (inputs.iconBg    !== undefined) comp.setInput('iconBg',      inputs.iconBg);
    if (inputs.iconColor !== undefined) comp.setInput('iconColor',   inputs.iconColor);
    if (inputs.subtitle  !== undefined) comp.setInput('subtitle',    inputs.subtitle);
    if (inputs.link      !== undefined) comp.setInput('link',        inputs.link);
    if (inputs.queryParams !== undefined) comp.setInput('queryParams', inputs.queryParams);

    fixture.detectChanges();
    compiled = fixture.nativeElement;
  }

  it('displays the label', async () => {
    await setup({ label: 'Total Players', value: 42 });
    expect(compiled.textContent).toContain('Total Players');
  });

  it('displays the numeric value', async () => {
    await setup({ label: 'Selected', value: 15 });
    expect(compiled.textContent).toContain('15');
  });

  it('displays string value', async () => {
    await setup({ label: 'Status', value: 'Active' });
    expect(compiled.textContent).toContain('Active');
  });

  it('renders an <a> tag when link is provided', async () => {
    await setup({ label: 'Players', value: 10, link: '/players' });
    const anchor = compiled.querySelector('a');
    expect(anchor).toBeTruthy();
  });

  it('renders a <div> instead of <a> when no link is provided', async () => {
    await setup({ label: 'Reports', value: 5 });
    const anchor = compiled.querySelector('a');
    const card   = compiled.querySelector('.card');
    expect(anchor).toBeNull();
    expect(card).toBeTruthy();
  });

  it('shows subtitle when provided', async () => {
    await setup({ label: 'Players', value: 10, subtitle: 'Last 30 days' });
    expect(compiled.textContent).toContain('Last 30 days');
  });

  it('renders players SVG icon for iconName="players"', async () => {
    await setup({ iconName: 'players', label: 'Players', value: 5 });
    const svgCircle = compiled.querySelector('circle[cx="12"][cy="8"]');
    expect(svgCircle).toBeTruthy();
  });

  it('renders reports SVG icon for iconName="reports"', async () => {
    await setup({ iconName: 'reports', label: 'Reports', value: 3 });
    const svgPath = compiled.querySelector('path[d*="14 2H6"]');
    expect(svgPath).toBeTruthy();
  });

  it('renders default SVG icon for unknown iconName', async () => {
    await setup({ iconName: 'unknown_icon', label: 'Unknown', value: 0 });
    // The @default case renders a circle
    const svgs = compiled.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });
});
