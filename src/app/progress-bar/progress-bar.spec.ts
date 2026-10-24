import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProgressBar } from './progress-bar';

describe('ProgressBar', () => {
  let fixture: ComponentFixture<ProgressBar>;
  let el: HTMLElement;

  async function render(done: number, total: number) {
    fixture.componentRef.setInput('done', done);
    fixture.componentRef.setInput('total', total);
    await fixture.whenStable();
  }

  const bar = () => el.querySelector('[role="progressbar"]') as HTMLElement;
  const fill = () => el.querySelector('.fill') as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ProgressBar] }).compileComponents();
    fixture = TestBed.createComponent(ProgressBar);
    el = fixture.nativeElement;
  });

  it('shows the share of bought items', async () => {
    await render(1, 4);
    expect(bar().getAttribute('aria-valuenow')).toBe('25');
    expect(fill().style.width).toBe('25%');
  });

  it('is empty (not NaN) for an empty list', async () => {
    await render(0, 0);
    expect(bar().getAttribute('aria-valuenow')).toBe('0');
    expect(fill().style.width).toBe('0%');
  });

  it('is marked complete at 100%', async () => {
    await render(3, 3);
    expect(fill().classList).toContain('complete');
  });

  it('is not complete before 100%', async () => {
    await render(2, 3);
    expect(fill().classList).not.toContain('complete');
  });

  it('never goes above 100%', async () => {
    await render(5, 3);
    expect(bar().getAttribute('aria-valuenow')).toBe('100');
  });
});
