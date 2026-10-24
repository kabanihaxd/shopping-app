import { TestBed } from '@angular/core/testing';
import { NicknameForm } from './nickname-form';

describe('NicknameForm', () => {
  async function openForm(current = '') {
    await TestBed.configureTestingModule({ imports: [NicknameForm] }).compileComponents();
    const fixture = TestBed.createComponent(NicknameForm);
    fixture.componentRef.setInput('current', current);
    const saved: string[] = [];
    let skipped = 0;
    fixture.componentInstance.save.subscribe((n) => saved.push(n));
    fixture.componentInstance.skip.subscribe(() => skipped++);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    const field = page.querySelector<HTMLInputElement>('.nick-input')!;
    return { fixture, page, field, saved, skipped: () => skipped };
  }

  it('should offer to come up with a nickname and allow skipping', async () => {
    const { page, skipped } = await openForm();
    expect(page.querySelector('h1')!.textContent).toContain('Придумайте нікнейм');

    page.querySelector<HTMLButtonElement>('.skip-btn')!.click();
    expect(skipped()).toBe(1);
  });

  it('should save a cleaned nickname', async () => {
    const { page, field, saved } = await openForm();
    field.value = '  Оля   К ';
    page.querySelector<HTMLButtonElement>('.save-btn')!.click();
    expect(saved).toEqual(['Оля К']);
  });

  it('should save with Enter', async () => {
    const { field, saved } = await openForm();
    field.value = 'Оля';
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(saved).toEqual(['Оля']);
  });

  it('should show an error instead of saving a bad nickname', async () => {
    const { fixture, page, field, saved } = await openForm();
    field.value = 'О';
    page.querySelector<HTMLButtonElement>('.save-btn')!.click();
    await fixture.whenStable();

    expect(saved).toEqual([]);
    expect(page.querySelector('[role="alert"]')!.textContent).toContain('щонайменше');
  });

  it('should be an edit form when there already is a nickname', async () => {
    const { page, field } = await openForm('Оля');
    expect(page.querySelector('h1')!.textContent).toContain('Змінити нікнейм');
    expect(field.value).toBe('Оля');
    expect(page.querySelector('.skip-btn')!.textContent).toContain('Скасувати');
  });
});
