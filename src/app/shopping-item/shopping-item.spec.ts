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
});
