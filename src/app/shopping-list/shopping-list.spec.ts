import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RATES_URL, ShoppingList } from './shopping-list';
import { provideFakeListsStore } from '../testing/fake-lists-store';

describe('ShoppingList', () => {
  let component: ShoppingList;
  let fixture: ComponentFixture<ShoppingList>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShoppingList],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideFakeListsStore(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ShoppingList);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('id', 'unknown');

    // В тестах нет интернета: отвечаем на запрос курса сами
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
    http.expectOne(RATES_URL).flush({ rates: { UAH: 50 } });
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show "not found" for an unknown list', () => {
    const h1 = (fixture.nativeElement as HTMLElement).querySelector('h1');
    expect(h1?.textContent).toContain('Список не знайдено');
  });

  it('should request the euro exchange rate only once', () => {
    http.verify();
  });
});
