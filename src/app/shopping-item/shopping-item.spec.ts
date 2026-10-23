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
    fixture.componentRef.setInput('item', { id: '1', name: 'Хлеб', quantity: 1, price: 0 });
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

    expect(saved).toEqual([{ id: '1', name: 'Батон', quantity: 1, price: 0 }]);
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
});
