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
});
