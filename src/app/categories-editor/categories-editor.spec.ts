import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CategoriesEditor } from './categories-editor';
import { Category } from '../category';

describe('CategoriesEditor', () => {
  let fixture: ComponentFixture<CategoriesEditor>;
  let el: HTMLElement;
  let emitted: Category[][];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CategoriesEditor] }).compileComponents();
    fixture = TestBed.createComponent(CategoriesEditor);
    fixture.componentRef.setInput('categories', [
      { id: 'a', name: 'Овочі', icon: '🥦' },
      { id: 'b', name: 'Напої', icon: '🥤' },
    ]);
    emitted = [];
    fixture.componentInstance.update.subscribe((x) => emitted.push(x));
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  });

  it('should add a category with the chosen icon', async () => {
    // Открыть выбор иконки для новой категории и выбрать 🍕
    const newIconBtn = el.querySelectorAll<HTMLButtonElement>('.icon-btn')[2];
    newIconBtn.click();
    await fixture.whenStable();
    [...el.querySelectorAll<HTMLButtonElement>('.icon-grid button')].find((b) => b.textContent === '🍕')!.click();
    await fixture.whenStable();

    const name = el.querySelector<HTMLInputElement>('input[placeholder="Нова категорія"]')!;
    name.value = 'Готова їжа';
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(emitted.length).toBe(1);
    expect(emitted[0].length).toBe(3);
    expect(emitted[0][2]).toMatchObject({ name: 'Готова їжа', icon: '🍕' });
  });

  it('should change the icon of an existing category', async () => {
    el.querySelector<HTMLButtonElement>('.icon-btn')!.click();
    await fixture.whenStable();
    [...el.querySelectorAll<HTMLButtonElement>('.icon-grid button')].find((b) => b.textContent === '🍎')!.click();

    expect(emitted[0][0]).toEqual({ id: 'a', name: 'Овочі', icon: '🍎' });
  });

  it('should move a category down', () => {
    el.querySelector<HTMLButtonElement>('button[aria-label="Нижче"]')!.click();

    expect(emitted[0].map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('should not move the first category up or the last one down', () => {
    const up = el.querySelectorAll<HTMLButtonElement>('button[aria-label="Вище"]');
    const down = el.querySelectorAll<HTMLButtonElement>('button[aria-label="Нижче"]');

    expect(up[0].disabled).toBe(true);
    expect(down[1].disabled).toBe(true);
  });

  it('should rename a category', () => {
    const name = el.querySelector<HTMLInputElement>('.cat-name')!;
    name.value = '  Овочі й зелень ';
    name.dispatchEvent(new Event('change'));

    expect(emitted[0][0]).toEqual({ id: 'a', name: 'Овочі й зелень', icon: '🥦' });
  });

  it('should bring back the old name instead of saving an empty one', () => {
    const name = el.querySelector<HTMLInputElement>('.cat-name')!;
    name.value = '   ';
    name.dispatchEvent(new Event('change'));

    expect(emitted).toEqual([]);
    expect(name.value).toBe('Овочі');
  });

  it('should delete a category only after confirmation', () => {
    // confirm() в тестах не показываем — подменяем ответ «Скасувати», потом «OK»
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const removeBtn = el.querySelector<HTMLButtonElement>('button[aria-label="Видалити"]')!;

    removeBtn.click();
    expect(emitted).toEqual([]);

    confirmSpy.mockReturnValue(true);
    removeBtn.click();
    expect(emitted[0].map((c) => c.id)).toEqual(['b']);
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('«Овочі»'));

    confirmSpy.mockRestore();
  });

  it('should not add a category without a name', () => {
    const name = el.querySelector<HTMLInputElement>('input[placeholder="Нова категорія"]')!;
    name.value = '  ';
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(emitted).toEqual([]);
  });
});
