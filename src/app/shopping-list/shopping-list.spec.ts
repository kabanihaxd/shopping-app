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

  it('should group items by category', async () => {
    const store = TestBed.inject(ListsStore) as unknown as FakeListsStore;
    const id = store.create('Продукти');
    store.update(id, (l) => ({
      ...l,
      toBuy: [
        { id: '1', name: 'Сік', quantity: 1, price: 0, categoryId: 'drinks' },
        { id: '2', name: 'Батарейки', quantity: 1, price: 0, categoryId: '' },
        { id: '3', name: 'Яблука', quantity: 1, price: 0, categoryId: 'produce' },
      ],
    }));
    fixture.componentRef.setInput('id', id);
    await fixture.whenStable();

    const titles = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.group-title')].map((h) =>
      h.textContent?.trim(),
    );
    // Порядок — как у категорий, «Без категорії» в конце
    expect(titles).toEqual(['🥦 Овочі та фрукти', '🥤 Напої', 'Без категорії']);
  });

  it('should suggest a previous item and fill in its category and price', async () => {
    const store = TestBed.inject(ListsStore) as unknown as FakeListsStore;
    const id = store.create('Продукти');
    store.history.set([{ name: 'Молоко', categoryId: 'dairy', price: 1.5, count: 3, lastUsed: 0 }]);
    fixture.componentRef.setInput('id', id);
    await fixture.whenStable();

    const page = fixture.nativeElement as HTMLElement;
    const name = page.querySelector<HTMLInputElement>('input[placeholder="Що купити?"]')!;
    name.focus();
    name.value = 'мо';
    name.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    const option = page.querySelector<HTMLElement>('.suggestions li')!;
    expect(option.textContent).toContain('Молоко');

    // Стрелка вниз + Enter = выбрать подсказку
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
    expect(name.value).toBe('Молоко');
    expect(page.querySelector<HTMLInputElement>('input[placeholder="Ціна, €"]')!.value).toBe('1.5');
    expect(page.querySelector<HTMLSelectElement>('.add-row select')!.value).toBe('dairy');

    // Ещё раз Enter = добавить товар; в истории счётчик +1
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await fixture.whenStable();
    expect(store.lists()[0].toBuy[0]).toMatchObject({ name: 'Молоко', categoryId: 'dairy', price: 1.5 });
    expect(store.history()[0].count).toBe(4);
  });

  it('should reorder items by drag and drop and change category when dropped into another group', async () => {
    const store = TestBed.inject(ListsStore) as unknown as FakeListsStore;
    const id = store.create('Продукти');
    store.update(id, (l) => ({
      ...l,
      toBuy: [
        { id: 'apple', name: 'Яблука', quantity: 1, price: 0, categoryId: 'produce' },
        { id: 'carrot', name: 'Морква', quantity: 1, price: 0, categoryId: 'produce' },
        { id: 'juice', name: 'Сік', quantity: 1, price: 0, categoryId: 'drinks' },
      ],
    }));
    fixture.componentRef.setInput('id', id);
    await fixture.whenStable();

    const list = component as unknown as {
      groups: () => { id: string }[];
      drop: (e: unknown) => void;
    };
    const group = (gid: string) => ({ data: list.groups().find((g) => g.id === gid) });
    const names = () => store.lists()[0].toBuy.map((x) => x.name);

    // Внутри «Овочі»: Морква наверх
    list.drop({ previousContainer: group('produce'), container: group('produce'), previousIndex: 1, currentIndex: 0 });
    expect(names()).toEqual(['Морква', 'Яблука', 'Сік']);

    // Яблука → в «Напої» после Соку: товар переезжает и получает категорию drinks
    list.drop({ previousContainer: group('produce'), container: group('drinks'), previousIndex: 1, currentIndex: 1 });
    expect(names()).toEqual(['Морква', 'Сік', 'Яблука']);
    expect(store.lists()[0].toBuy[2].categoryId).toBe('drinks');

    // На странице есть ручки для перетаскивания
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.drag-handle').length).toBe(3);
  });

  it('should rename the list on Enter and keep the name on Escape', async () => {
    const store = TestBed.inject(ListsStore) as unknown as FakeListsStore;
    const id = store.create('Продукти');
    fixture.componentRef.setInput('id', id);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;

    const rename = async (text: string, key: string) => {
      page.querySelector<HTMLButtonElement>('.rename-btn')!.click();
      await fixture.whenStable();
      const field = page.querySelector<HTMLInputElement>('.rename-input')!;
      expect(document.activeElement).toBe(field); // курсор сразу в поле
      field.value = text;
      field.dispatchEvent(new KeyboardEvent('keydown', { key }));
      await fixture.whenStable();
    };

    await rename('Чернетка', 'Escape');
    expect(store.lists()[0].name).toBe('Продукти');

    await rename('  На вихідні  ', 'Enter');
    expect(store.lists()[0].name).toBe('На вихідні');
    expect(page.querySelector('h1')?.textContent).toContain('На вихідні');
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
