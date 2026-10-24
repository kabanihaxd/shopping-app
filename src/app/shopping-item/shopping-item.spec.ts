import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShoppingItem } from './shopping-item';

describe('ShoppingItem', () => {
  let component: ShoppingItem;
  let fixture: ComponentFixture<ShoppingItem>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShoppingItem],
    }).compileComponents();

    fixture = TestBed.createComponent(ShoppingItem);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('item', { id: '1', name: 'Хлеб', quantity: 1, price: 0, categoryId: '' });
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit the edited item on save', async () => {
    const el = fixture.nativeElement as HTMLElement;
    const saved: unknown[] = [];
    component.save.subscribe((x) => saved.push(x));

    (el.querySelector('.edit-btn') as HTMLButtonElement).click();
    await fixture.whenStable();

    const name = el.querySelector('input[formControlName="name"]') as HTMLInputElement;
    name.value = 'Батон';
    name.dispatchEvent(new Event('input'));
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(saved).toEqual([{ id: '1', name: 'Батон', quantity: 1, price: 0, categoryId: '' }]);
  });

  it('should not save an empty name', async () => {
    const el = fixture.nativeElement as HTMLElement;
    const saved: unknown[] = [];
    component.save.subscribe((x) => saved.push(x));

    (el.querySelector('.edit-btn') as HTMLButtonElement).click();
    await fixture.whenStable();

    const name = el.querySelector('input[formControlName="name"]') as HTMLInputElement;
    name.value = '  ';
    name.dispatchEvent(new Event('input'));
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(saved).toEqual([]);
  });

  it('should not save a quantity below 1 and show why', async () => {
    const el = fixture.nativeElement as HTMLElement;
    const saved: unknown[] = [];
    component.save.subscribe((x) => saved.push(x));

    (el.querySelector('.edit-btn') as HTMLButtonElement).click();
    await fixture.whenStable();
    const qty = el.querySelector('input[formControlName="quantity"]') as HTMLInputElement;
    qty.value = '0';
    qty.dispatchEvent(new Event('input'));
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(saved).toEqual([]);
    expect(el.querySelector('.error')?.textContent).toContain('не менше 1');
  });

  it('should cancel editing on Escape without saving', async () => {
    const el = fixture.nativeElement as HTMLElement;
    const saved: unknown[] = [];
    component.save.subscribe((x) => saved.push(x));

    (el.querySelector('.edit-btn') as HTMLButtonElement).click();
    await fixture.whenStable();
    el.querySelector('form')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();

    expect(saved).toEqual([]);
    expect(el.querySelector('form')).toBeNull();
    expect(el.textContent).toContain('Хлеб');
  });

  it('should show the category icon and let you change the category', async () => {
    const el = fixture.nativeElement as HTMLElement;
    const saved: { categoryId: string }[] = [];
    component.save.subscribe((x) => saved.push(x));
    fixture.componentRef.setInput('categories', [
      { id: 'bakery', name: 'Хліб і випічка', icon: '🍞' },
      { id: 'sweets', name: 'Солодощі', icon: '🍫' },
    ]);
    fixture.componentRef.setInput('item', { id: '1', name: 'Хлеб', quantity: 1, price: 0, categoryId: 'bakery' });
    await fixture.whenStable();
    expect(el.querySelector('.item-icon')?.textContent).toBe('🍞');

    (el.querySelector('.edit-btn') as HTMLButtonElement).click();
    await fixture.whenStable();
    const select = el.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('bakery'); // в форме — текущая категория
    select.value = 'sweets';
    select.dispatchEvent(new Event('change'));
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));

    expect(saved[0].categoryId).toBe('sweets');
  });

  it('should tell the parent about the checkbox and ×', () => {
    const el = fixture.nativeElement as HTMLElement;
    const events: string[] = [];
    component.toggle.subscribe(() => events.push('toggle'));
    component.remove.subscribe(() => events.push('remove'));

    (el.querySelector('.check-btn') as HTMLButtonElement).click();
    (el.querySelector('.remove-btn') as HTMLButtonElement).click();

    expect(events).toEqual(['toggle', 'remove']);
  });

  it('should show the drag handle only when asked', async () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.drag-handle')).toBeNull();

    fixture.componentRef.setInput('showHandle', true);
    await fixture.whenStable();
    expect(el.querySelector('.drag-handle')).not.toBeNull();
  });

  describe('note', () => {
    async function edit() {
      const el = fixture.nativeElement as HTMLElement;
      const saved: Record<string, unknown>[] = [];
      component.save.subscribe((x) => saved.push(x as unknown as Record<string, unknown>));
      (el.querySelector('.edit-btn') as HTMLButtonElement).click();
      await fixture.whenStable();
      const note = el.querySelector('input[formControlName="note"]') as HTMLInputElement;
      const submit = async () => {
        (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
        await fixture.whenStable();
      };
      return { el, saved, note, submit };
    }

    it('should show no note line when there is no note', () => {
      expect((fixture.nativeElement as HTMLElement).querySelector('.item-note')).toBeNull();
    });

    it('should show the note under the item', async () => {
      fixture.componentRef.setInput('item', { id: '1', name: 'Молоко', quantity: 1, price: 0, categoryId: '', note: 'без лактози' });
      await fixture.whenStable();
      expect((fixture.nativeElement as HTMLElement).querySelector('.item-note')!.textContent).toContain('без лактози');
    });

    it('should save a trimmed note from the edit form', async () => {
      const { note, saved, submit } = await edit();
      note.value = '  бренд Х  ';
      note.dispatchEvent(new Event('input'));
      await submit();

      expect(saved[0]['note']).toBe('бренд Х');
    });

    it('should start the form with the existing note and drop the field when it is cleared', async () => {
      fixture.componentRef.setInput('item', { id: '1', name: 'Молоко', quantity: 1, price: 0, categoryId: '', note: 'без лактози' });
      await fixture.whenStable();
      const { note, saved, submit } = await edit();
      expect(note.value).toBe('без лактози');

      note.value = '   ';
      note.dispatchEvent(new Event('input'));
      await submit();

      expect('note' in saved[0]).toBe(false); // Firestore не принимает undefined — поля не должно быть совсем
    });

    it('should limit the note length in the field', async () => {
      const { note } = await edit();
      expect(note.getAttribute('maxlength')).toBe('100');
    });
  });

  describe('store and price hint', () => {
    it('should show the store next to the price', async () => {
      fixture.componentRef.setInput('item', { id: '1', name: 'Молоко', quantity: 1, price: 1.5, categoryId: '', store: 'Сільпо' });
      await fixture.whenStable();
      expect((fixture.nativeElement as HTMLElement).querySelector('.item-meta')!.textContent).toContain('🏪 Сільпо');
    });

    it('should save a trimmed store and drop the field when it is cleared', async () => {
      const el = fixture.nativeElement as HTMLElement;
      const saved: Record<string, unknown>[] = [];
      component.save.subscribe((x) => saved.push(x as unknown as Record<string, unknown>));
      const submit = async () => {
        (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
        await fixture.whenStable();
      };

      (el.querySelector('.edit-btn') as HTMLButtonElement).click();
      await fixture.whenStable();
      const store = el.querySelector('input[formControlName="store"]') as HTMLInputElement;
      store.value = '  АТБ ';
      store.dispatchEvent(new Event('input'));
      await submit();
      expect(saved[0]['store']).toBe('АТБ');

      fixture.componentRef.setInput('item', saved[0] as never);
      await fixture.whenStable();
      (el.querySelector('.edit-btn') as HTMLButtonElement).click();
      await fixture.whenStable();
      const again = el.querySelector('input[formControlName="store"]') as HTMLInputElement;
      expect(again.value).toBe('АТБ');
      again.value = '';
      again.dispatchEvent(new Event('input'));
      await submit();
      expect('store' in saved[1]).toBe(false);
    });

    it('should show the cheaper-store hint with the whole price list in its tooltip', async () => {
      fixture.componentRef.setInput('hint', { text: 'Дешевше в Сільпо: €1.20 (на €0.30 менше)', title: 'Сільпо: €1.20\nМетро: €1.50' });
      await fixture.whenStable();
      const hint = (fixture.nativeElement as HTMLElement).querySelector('.item-hint')!;
      expect(hint.textContent).toContain('Дешевше в Сільпо');
      expect(hint.getAttribute('title')).toContain('Метро: €1.50');
    });

    it('should show no hint by default', () => {
      expect((fixture.nativeElement as HTMLElement).querySelector('.item-hint')).toBeNull();
    });
  });

  describe('who bought', () => {
    const info = { text: 'Оксана · 14:20', title: 'Купив(ла): Оксана\nКоли: 24.10.2026 14:20' };

    it('should show who and when next to a bought item, with the full date in the tooltip', async () => {
      fixture.componentRef.setInput('bought', true);
      fixture.componentRef.setInput('boughtInfo', info);
      await fixture.whenStable();

      const label = (fixture.nativeElement as HTMLElement).querySelector('.item-bought-by')!;
      expect(label.textContent).toContain('Оксана · 14:20');
      expect(label.getAttribute('title')).toContain('24.10.2026');
    });

    it('should not show it on an item that is still to buy', async () => {
      fixture.componentRef.setInput('boughtInfo', info);
      await fixture.whenStable();
      expect((fixture.nativeElement as HTMLElement).querySelector('.item-bought-by')).toBeNull();
    });
  });
});
