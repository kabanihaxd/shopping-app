import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RATES_URL, ShoppingList } from './shopping-list';
import { FakeListsStore, provideFakeListsStore } from '../testing/fake-lists-store';
import { ListsStore } from '../lists-store';

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

  it('should not crash when the exchange rate fails to load', async () => {
    // Отдельный экземпляр, у которого сервер курсов отвечает ошибкой 404
    const broken = TestBed.createComponent(ShoppingList);
    broken.componentRef.setInput('id', 'unknown');
    TestBed.tick();
    http.expectOne(RATES_URL).flush('Not found', { status: 404, statusText: 'Not Found' });
    await broken.whenStable();

    expect(broken.componentInstance['uahRate']()).toBeUndefined();
  });

  it('should let the owner grant access to someone who visited the site', async () => {
    const store = TestBed.inject(ListsStore) as unknown as FakeListsStore;
    const id = store.create('Продукти');
    store.users.set([{ email: 'friend@example.com', name: 'Друг', lastSeen: 0 }]);
    fixture.componentRef.setInput('id', id);
    await fixture.whenStable();

    const page = fixture.nativeElement as HTMLElement;
    const grantBtn = [...page.querySelectorAll('button')].find((b) => b.textContent?.includes('Дати доступ'));
    expect(page.textContent).toContain('friend@example.com');
    grantBtn!.click();
    await fixture.whenStable();

    expect(store.lists()[0].members).toContain('friend@example.com');
    expect(page.textContent).not.toContain('Дати доступ');
  });
});
