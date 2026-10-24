import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RATES_URL, ShoppingList, arrangeByPrice, sortByCostDesc } from './shopping-list';
import { ListsStore } from '../lists-store';
import { Item } from '../item';
import { FakeListsStore, provideFakeListsStore } from '../testing/fake-lists-store';
import { FakeScanEngine, provideFakeScanEngine } from '../testing/fake-scan-engine';
import { ScanEngine } from '../barcode-scanner/scan-engine';

/** Товар для тестов: указываем только то, что важно в конкретном тесте */
const item = (name: string, extra: Partial<Item> = {}): Item => ({
  id: name,
  name,
  quantity: 1,
  price: 0,
  categoryId: '',
  ...extra,
});

/**
 * Открывает страницу списка с нужными товарами, курс 1 € = 50 ₴.
 * Возвращает всё, что нужно тестам: хранилище, страницу и помощники для поиска кнопок.
 */
async function openList(toBuy: Item[] = [], bought: Item[] = []) {
  await TestBed.configureTestingModule({
    imports: [ShoppingList],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideFakeListsStore(),
      provideFakeScanEngine(),
    ],
  }).compileComponents();

  const store = TestBed.inject(ListsStore) as unknown as FakeListsStore;
  const id = store.create('Продукти');
  store.update(id, (l) => ({ ...l, toBuy, bought }));

  const fixture = TestBed.createComponent(ShoppingList);
  fixture.componentRef.setInput('id', id);
  TestBed.tick();
  TestBed.inject(HttpTestingController).expectOne(RATES_URL).flush({ rates: { UAH: 50 } });
  await fixture.whenStable();

  const page = fixture.nativeElement as HTMLElement;
  const list = () => store.lists()[0];
  const names = (items: Item[]) => items.map((x) => x.name);
  /** Кнопка с таким текстом */
  const button = (text: string) =>
    [...page.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;
  /** Строка товара по названию */
  const row = (name: string) =>
    [...page.querySelectorAll<HTMLElement>('li[app-shopping-item]')].find((li) =>
      li.querySelector('.item-name')?.textContent?.includes(name),
    )!;
  const stable = () => fixture.whenStable();

  return { store, fixture, page, list, names, button, row, stable };
}

describe('ShoppingList — товары', () => {
  it('adds an item with quantity, price and category, then clears the fields', async () => {
    const { page, list, button, stable } = await openList();
    const field = (placeholder: string) => page.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)!;

    field('Що купити?').value = '  Сир  ';
    field('К-сть').value = '2';
    field('Ціна, €').value = '3.5';
    page.querySelector<HTMLSelectElement>('.add-row select')!.value = 'dairy';
    button('Додати').click();
    await stable();

    expect(list().toBuy).toEqual([
      { id: expect.any(String), name: 'Сир', quantity: 2, price: 3.5, categoryId: 'dairy' },
    ]);
    expect(field('Що купити?').value).toBe('');
    expect(field('К-сть').value).toBe('');
  });

  it('uses quantity 1 and price 0 when they are left empty', async () => {
    const { page, list, button } = await openList();
    page.querySelector<HTMLInputElement>('input[placeholder="Що купити?"]')!.value = 'Хліб';
    button('Додати').click();

    expect(list().toBuy[0]).toMatchObject({ name: 'Хліб', quantity: 1, price: 0 });
  });

  it('does not add an item without a name', async () => {
    const { page, list, button } = await openList();
    page.querySelector<HTMLInputElement>('input[placeholder="Що купити?"]')!.value = '   ';
    button('Додати').click();

    expect(list().toBuy).toEqual([]);
  });

  it('moves an item to "bought" with the checkbox and back again', async () => {
    const { list, names, row, stable } = await openList([item('Молоко'), item('Хліб')]);

    row('Молоко').querySelector<HTMLButtonElement>('.check-btn')!.click();
    await stable();
    expect(names(list().toBuy)).toEqual(['Хліб']);
    expect(names(list().bought)).toEqual(['Молоко']);
    expect(row('Молоко').classList).toContain('bought');

    row('Молоко').querySelector<HTMLButtonElement>('.check-btn')!.click();
    await stable();
    expect(names(list().toBuy)).toEqual(['Хліб', 'Молоко']);
    expect(list().bought).toEqual([]);
  });

  it('stamps the purchase time when bought and drops it when returned', async () => {
    const { list, row, stable } = await openList([item('Молоко')]);
    const before = Date.now();

    row('Молоко').querySelector<HTMLButtonElement>('.check-btn')!.click();
    await stable();
    expect(list().bought[0].boughtAt).toBeGreaterThanOrEqual(before);

    row('Молоко').querySelector<HTMLButtonElement>('.check-btn')!.click();
    await stable();
    expect('boughtAt' in list().toBuy[0]).toBe(false); // Firestore не принимает undefined — поля не должно быть совсем
  });

  it('deletes an item with ×', async () => {
    const { list, names, row } = await openList([item('Молоко'), item('Хліб')]);

    row('Молоко').querySelector<HTMLButtonElement>('.remove-btn')!.click();

    expect(names(list().toBuy)).toEqual(['Хліб']);
  });

  it('clears all bought items', async () => {
    const { list, names, button } = await openList([item('Хліб')], [item('Молоко'), item('Сир')]);

    button('Очистити').click();

    expect(list().bought).toEqual([]);
    expect(names(list().toBuy)).toEqual(['Хліб']); // «Треба купити» не трогаем
  });

  it('counts what is left and how much it costs in euro and hryvnia', async () => {
    const { page } = await openList(
      [item('Сир', { quantity: 2, price: 1.5 }), item('Хліб', { price: 1 })],
      [item('Молоко', { price: 0.9 })],
    );
    const text = page.textContent!.replace(/\s+/g, ' ');

    expect(text).toContain('Залишилось купити: 2 з 3');
    expect(text).toContain('€4.00'); // 2 × 1.50 + 1.00
    expect(text).toContain('₴200'); // 4 € × 50
    expect(text).toContain('Витрачено: €0.90');
    expect(text).toContain('1 € = 50.00 ₴');
  });

  it('makes items of a deleted category uncategorized', async () => {
    const { fixture, list } = await openList([item('Сік', { categoryId: 'drinks' })], [item('Вода', { categoryId: 'drinks' })]);
    const component = fixture.componentInstance as unknown as { setCategories: (c: unknown[]) => void };

    component.setCategories(list().categories.filter((c) => c.id !== 'drinks'));

    expect(list().categories.some((c) => c.id === 'drinks')).toBe(false);
    expect(list().toBuy[0].categoryId).toBe('');
    expect(list().bought[0].categoryId).toBe('');
  });
});

describe('ShoppingList — подсказки', () => {
  async function typeName(text: string) {
    const env = await openList([item('Хліб')]);
    env.store.history.set([
      { name: 'Молоко', categoryId: 'dairy', price: 1.5, count: 3, lastUsed: 0 },
      { name: 'Хліб', categoryId: 'bakery', price: 1, count: 9, lastUsed: 0 },
    ]);
    const field = env.page.querySelector<HTMLInputElement>('input[placeholder="Що купити?"]')!;
    field.focus();
    field.value = text;
    field.dispatchEvent(new Event('input'));
    await env.stable();
    const options = () => [...env.page.querySelectorAll('.suggestions li')].map((li) => li.textContent);
    return { ...env, field, options };
  }

  it('does not suggest an item that is already in the list', async () => {
    const { options } = await typeName('х');
    expect(options()).toEqual([]);
  });

  it('closes suggestions on Escape', async () => {
    const { field, options, stable } = await typeName('мо');
    expect(options().length).toBe(1);

    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await stable();
    expect(options()).toEqual([]);
  });

  it('picks a suggestion by tap', async () => {
    const { page, field, stable } = await typeName('мо');

    page.querySelector<HTMLElement>('.suggestions li')!.click();
    await stable();

    expect(field.value).toBe('Молоко');
  });

  it('forgets a suggestion with ×', async () => {
    const { page, store, options, stable } = await typeName('мо');

    page.querySelector<HTMLButtonElement>('.s-forget')!.click();
    await stable();

    expect(store.history().map((h) => h.name)).toEqual(['Хліб']);
    expect(options()).toEqual([]);
  });
});

describe('ShoppingList — доступ', () => {
  it('lets the owner invite by email and remove a member', async () => {
    const { page, list, button, stable } = await openList();
    const email = page.querySelector<HTMLInputElement>('.invite-input')!;

    email.value = ' Friend@Example.com ';
    button('Запросити').click();
    await stable();
    expect(list().members).toContain('Friend@Example.com'.toLowerCase());

    button('Прибрати').click();
    expect(list().members).toEqual(['me@example.com']);
  });

  it('ignores an invite without @', async () => {
    const { page, list, button } = await openList();
    page.querySelector<HTMLInputElement>('.invite-input')!.value = 'friend';
    button('Запросити').click();

    expect(list().members).toEqual(['me@example.com']);
  });

  it('sends the to-buy list as text through the phone share menu', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    try {
      const { page, list, stable } = await openList([{ id: 'a', name: 'Сир', quantity: 1, price: 0, categoryId: '' }]);
      const name = list().name;
      expect(page.textContent).toContain('Надіслати');
      page.querySelector<HTMLButtonElement>('.send-btn')!.click();
      await stable();
      expect(share).toHaveBeenCalledTimes(1);
      expect(share.mock.calls[0][0].text.startsWith(`🛒 ${name}`)).toBe(true);
      expect(share.mock.calls[0][0].text).toContain('• Сир');
    } finally {
      delete (navigator as { share?: unknown }).share;
    }
  });

  it('creates an invite link with a secret code, copies it, and can switch it off', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { page, list, button, stable } = await openList();
    expect(page.querySelector('input[aria-label="Посилання-запрошення"]')).toBeNull();

    button('🔗 Створити посилання-запрошення').click();
    await stable();
    const code = list().inviteCode!;
    expect(code).toMatch(/^[0-9a-f]{64}$/);
    const link = page.querySelector<HTMLInputElement>('input[aria-label="Посилання-запрошення"]')!.value;
    expect(link).toContain(`#/join/${list().id}/${code}`);

    button('Копіювати').click();
    await stable();
    expect(writeText).toHaveBeenCalledWith(link);
    expect(button('Скопійовано ✓')).toBeTruthy();

    button('Вимкнути посилання').click();
    await stable();
    expect(list().inviteCode).toBe('');
    expect(page.querySelector('input[aria-label="Посилання-запрошення"]')).toBeNull();
  });

  it('hides the invite link from guests', async () => {
    const { store, page, stable } = await openList();
    store.update(store.lists()[0].id, (l) => ({
      ...l,
      ownerEmail: 'boss@example.com',
      members: ['boss@example.com', 'me@example.com'],
      inviteCode: 'secret',
    }));
    await stable();

    expect(page.querySelector('input[aria-label="Посилання-запрошення"]')).toBeNull();
    expect(page.textContent).not.toContain('Створити посилання');
  });

  it('shows nicknames of members; the owner also sees their emails', async () => {
    const { store, page, stable } = await openList();
    store.update(store.lists()[0].id, (l) => ({ ...l, members: ['me@example.com', 'olga@example.com'] }));
    store.nicknames.set({ 'olga@example.com': 'Оля' });
    await stable();

    const members = page.querySelector('.members')!;
    expect(members.textContent).toContain('Оля');
    expect(members.querySelector('.member-email')!.textContent).toContain('olga@example.com');
  });

  it('shows only nicknames to a guest', async () => {
    const { store, page, stable } = await openList();
    store.update(store.lists()[0].id, (l) => ({
      ...l,
      ownerEmail: 'boss@example.com',
      members: ['boss@example.com', 'me@example.com'],
    }));
    store.nicknames.set({ 'boss@example.com': 'Шеф' });
    await stable();

    const members = page.querySelector('.members')!;
    expect(members.textContent).toContain('Шеф');
    expect(members.textContent).not.toContain('boss@example.com');
  });

  it('does not let a guest invite or remove people', async () => {
    const { store, page, stable } = await openList();
    // Список чужой: владелец — другой человек, я только участник
    store.update(store.lists()[0].id, (l) => ({ ...l, ownerEmail: 'boss@example.com', members: ['boss@example.com', 'me@example.com'] }));
    await stable();

    expect(page.querySelector('.invite-input')).toBeNull();
    expect(page.textContent).not.toContain('Прибрати');
    expect(page.textContent).toContain('(власник)');
  });
});

describe('сортировка по цене и закрепление', () => {
  const priced = (name: string, price: number, quantity = 1, categoryId = '', extra: Partial<Item> = {}): Item =>
    item(name, { price, quantity, categoryId, ...extra });

  /** В названии строки перед словом стоит эмодзи категории — для сравнения отбрасываем его 😀 */
  const word = (el: Element) => el.textContent!.trim().replace(/^[^\p{L}]+/u, '');

  it('sortByCostDesc: by quantity × price, equal ones keep their order, no price goes last', () => {
    const sorted = sortByCostDesc([
      priced('Безкоштовно', 0),
      priced('Яйця', 0.3, 30), // 9
      priced('Стейк', 8), // 8
      priced('Перше', 2),
      priced('Друге', 2),
    ]);
    expect(sorted.map((x) => x.name)).toEqual(['Яйця', 'Стейк', 'Перше', 'Друге', 'Безкоштовно']);
  });

  it('arrangeByPrice: pinned items keep their place, the others fill the rest by price', () => {
    const arranged = arrangeByPrice([
      priced('Дешево', 1, 1, '', { pinned: true }),
      priced('Середньо', 5),
      priced('Дорого', 9),
      priced('Закріплено знизу', 3, 1, '', { pinned: true }),
      priced('Ще дорожче', 20),
    ]);
    expect(arranged.map((x) => x.name)).toEqual(['Дешево', 'Ще дорожче', 'Дорого', 'Закріплено знизу', 'Середньо']);
  });

  it('arrangeByPrice without pinned items is plain sorting', () => {
    const arranged = arrangeByPrice([priced('A', 1), priced('B', 3), priced('C', 2)]);
    expect(arranged.map((x) => x.name)).toEqual(['B', 'C', 'A']);
  });

  it('sorts every group and the bought list on its own, keeping the stored order', async () => {
    const { page, list, names } = await openList(
      [
        priced('Сік', 1, 1, 'drinks'),
        priced('Вино', 9, 1, 'drinks'),
        priced('Хліб', 2, 1, 'bakery'),
        priced('Багет', 3, 1, 'bakery'),
      ],
      [priced('Сіль', 1), priced('Ікра', 20), priced('Чай', 5)],
    );
    const groupNames = [...page.querySelectorAll('.drop-list')].map((ul) =>
      [...ul.querySelectorAll('li[app-shopping-item] .item-name')].map(word),
    );
    const bought = [...page.querySelectorAll('li.bought .item-name')].map(word);

    expect(groupNames).toEqual([['Багет', 'Хліб'], ['Вино', 'Сік']]);
    expect(bought).toEqual(['Ікра', 'Чай', 'Сіль']);
    expect(names(list().toBuy)).toEqual(['Сік', 'Вино', 'Хліб', 'Багет']); // в базе порядок прежний
  });

  it('keeps a dragged item where it was dropped, even when pricier items arrive; 📌 unpins it', async () => {
    const { fixture, page, store, list, names, stable } = await openList([
      priced('Дешево', 1),
      priced('Середньо', 5),
      priced('Дорого', 9),
    ]);
    const shown = () => [...page.querySelectorAll('li[app-shopping-item] .item-name')].map(word);
    expect(shown()).toEqual(['Дорого', 'Середньо', 'Дешево']);

    // Тянем «Дешево» (последнее) на самый верх
    const view = fixture.componentInstance as unknown as { groups: () => { id: string }[]; drop: (e: unknown) => void };
    const group = { data: view.groups()[0] };
    view.drop({ previousContainer: group, container: group, previousIndex: 2, currentIndex: 0 });
    await stable();
    expect(shown()).toEqual(['Дешево', 'Дорого', 'Середньо']);
    expect(list().toBuy.find((x) => x.name === 'Дешево')!.pinned).toBe(true);

    // Появился самый дорогой товар — «Дешево» всё равно остаётся первым
    store.update(list().id, (l) => ({ ...l, toBuy: [...l.toBuy, priced('Ікра', 20)] }));
    await stable();
    expect(shown()).toEqual(['Дешево', 'Ікра', 'Дорого', 'Середньо']);

    // Сняли закрепление — «Дешево» ушло по цене вниз
    page.querySelector<HTMLButtonElement>('button[aria-label="Зняти закріплення"]')!.click();
    await stable();
    expect(shown()).toEqual(['Ікра', 'Дорого', 'Середньо', 'Дешево']);
    expect('pinned' in list().toBuy.find((x) => x.name === 'Дешево')!).toBe(false);
    expect(names(list().toBuy)).toContain('Дешево');
    expect(page.querySelector('button[aria-label="Зняти закріплення"]')).toBeNull();
  });

  it('forgets the pin when a pinned item is bought', async () => {
    const { list, row, stable } = await openList([priced('Дешево', 1, 1, '', { pinned: true })]);
    row('Дешево').querySelector<HTMLButtonElement>('.check-btn')!.click();
    await stable();
    expect('pinned' in list().bought[0]).toBe(false);
  });
});

describe('сканер штрихкодов', () => {
  const OFF = 'https://world.openfoodfacts.org/api/v2/product/5449000000996.json?fields=product_name,product_name_uk';

  async function openScanner() {
    const env = await openList();
    const engine = TestBed.inject(ScanEngine) as unknown as FakeScanEngine;
    const http = TestBed.inject(HttpTestingController);
    const nameField = () => env.page.querySelector<HTMLInputElement>('input[placeholder="Що купити?"]')!;
    env.page.querySelector<HTMLButtonElement>('.scan-btn')!.click();
    await env.stable();
    return { ...env, engine, http, nameField };
  }

  it('opens the scanner, finds the product by code and fills in the name', async () => {
    const { page, engine, http, nameField, stable } = await openScanner();
    expect(page.querySelector('app-barcode-scanner')).not.toBeNull();

    engine.emit('5449000000996');
    http.expectOne(OFF).flush({ status: 1, product: { product_name: 'Coca-Cola Original', product_name_uk: '' } });
    await stable();

    expect(page.querySelector('app-barcode-scanner')).toBeNull(); // окно закрылось
    expect(nameField().value).toBe('Coca-Cola Original');
    expect(page.querySelector('.scan-message')!.textContent).toContain('Знайдено: «Coca-Cola Original»');
  });

  it('says so when the product is not in the database', async () => {
    const { page, engine, http, nameField, stable } = await openScanner();

    engine.emit('5449000000996');
    http.expectOne(OFF).flush({ status: 0 });
    await stable();

    expect(nameField().value).toBe('');
    expect(page.querySelector('.scan-message')!.textContent).toContain('немає в базі');
  });

  it('explains a network problem', async () => {
    const { page, engine, http, stable } = await openScanner();

    engine.emit('5449000000996');
    http.expectOne(OFF).error(new ProgressEvent('error'));
    await stable();

    expect(page.querySelector('.scan-message')!.textContent).toContain('Перевірте інтернет');
  });

  it('does not ask the database about something that is not a barcode', async () => {
    const { page, engine, http, stable } = await openScanner();

    engine.emit('молоко');
    await stable();

    http.expectNone(() => true);
    expect(page.querySelector('.scan-message')!.textContent).toContain('лише цифри');
  });

  it('lets the user type the code by hand and close the window', async () => {
    const { page, http, button, stable } = await openScanner();

    page.querySelector<HTMLInputElement>('input[aria-label="Код товару вручну"]')!.value = '5449000000996';
    button('Знайти').click();
    http.expectOne(OFF).flush({ status: 1, product: { product_name: 'Cola' } });
    await stable();
    expect(page.querySelector('input[placeholder="Що купити?"]') as HTMLInputElement).toHaveProperty('value', 'Cola');

    page.querySelector<HTMLButtonElement>('.scan-btn')!.click();
    await stable();
    button('Закрити').click();
    await stable();
    expect(page.querySelector('app-barcode-scanner')).toBeNull();
  });
});

describe('режим «У магазині»', () => {
  afterEach(() => {
    localStorage.removeItem('store-mode');
    delete (navigator as { wakeLock?: unknown }).wakeLock;
  });

  /** Подставляем «экранный замок» браузера, которого в тестовом окружении нет */
  function mockWakeLock() {
    const sentinel = { release: vi.fn().mockResolvedValue(undefined) };
    const request = vi.fn().mockResolvedValue(sentinel);
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    return { sentinel, request };
  }

  const toggle = (page: HTMLElement) => page.querySelector<HTMLButtonElement>('.store-toggle')!;

  it('keeps the screen awake and enlarges the controls, then turns off again', async () => {
    const { request, sentinel } = mockWakeLock();
    const { page, stable } = await openList([item('Молоко')]);
    expect(page.querySelector('.card')!.classList).not.toContain('store-mode');
    expect(request).not.toHaveBeenCalled();

    toggle(page).click();
    await stable();
    expect(page.querySelector('.card')!.classList).toContain('store-mode');
    expect(request).toHaveBeenCalledWith('screen');
    expect(page.querySelector('.store-note')!.textContent).toContain('Екран не гасне');
    expect(toggle(page).getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('store-mode')).toBe('1');

    toggle(page).click();
    await stable();
    expect(page.querySelector('.card')!.classList).not.toContain('store-mode');
    expect(sentinel.release).toHaveBeenCalled();
    expect(page.querySelector('.store-note')).toBeNull();
  });

  it('starts in store mode when it was left on', async () => {
    localStorage.setItem('store-mode', '1');
    const { request } = mockWakeLock();
    const { page } = await openList();
    expect(page.querySelector('.card')!.classList).toContain('store-mode');
    expect(request).toHaveBeenCalled();
  });

  it('lets the screen sleep again when leaving the list', async () => {
    localStorage.setItem('store-mode', '1');
    const { sentinel } = mockWakeLock();
    const { fixture, stable } = await openList();
    await stable();

    fixture.destroy();
    await Promise.resolve();
    expect(sentinel.release).toHaveBeenCalled();
  });

  it('is honest when the browser cannot keep the screen on', async () => {
    const { page, stable } = await openList(); // в jsdom wakeLock нет
    toggle(page).click();
    await stable();

    expect(page.querySelector('.card')!.classList).toContain('store-mode'); // кнопки всё равно крупнее
    expect(page.querySelector('.store-note')!.textContent).toContain('не вміє тримати екран');
  });
});

describe('отмена удаления', () => {
  /** Плашка «Скасувати», которую показал список (её рисует App, а нажатие — это вызов action.run) */
  const undo = (store: FakeListsStore) => store.notices()[0].action!.run();

  it('shows «Видалено · Скасувати» for 5 seconds', async () => {
    const { store, row, stable } = await openList([item('Молоко')]);

    row('Молоко').querySelector<HTMLButtonElement>('.remove-btn')!.click();
    await stable();

    expect(store.notices()[0].text).toBe('Видалено «Молоко»');
    expect(store.notices()[0].action!.label).toBe('Скасувати');
    expect((store as unknown as { lastNoticeMs: number }).lastNoticeMs).toBe(5000);
  });

  it('puts an item back exactly where it was', async () => {
    const { store, list, names, row, stable } = await openList([item('A'), item('B'), item('C')]);

    row('B').querySelector<HTMLButtonElement>('.remove-btn')!.click();
    await stable();
    expect(names(list().toBuy)).toEqual(['A', 'C']);

    undo(store);
    await stable();
    expect(names(list().toBuy)).toEqual(['A', 'B', 'C']);
  });

  it('brings back a bought item with its purchase date', async () => {
    const bought = item('Хліб', { price: 2, boughtAt: 123 });
    const { store, list, row, stable } = await openList([], [bought, item('Сіль')]);

    row('Хліб').querySelector<HTMLButtonElement>('.remove-btn')!.click();
    await stable();
    expect(list().bought.map((x) => x.name)).toEqual(['Сіль']);

    undo(store);
    await stable();
    expect(list().bought[0]).toEqual(bought);
    expect(list().toBuy).toEqual([]);
  });

  it('does not lose what others added in the meantime, and does not duplicate on a second tap', async () => {
    const { store, list, names, row, stable } = await openList([item('A'), item('B')]);

    row('A').querySelector<HTMLButtonElement>('.remove-btn')!.click();
    await stable();
    store.update(list().id, (l) => ({ ...l, toBuy: [...l.toBuy, item('Від друга')] })); // тем временем добавил другой участник

    undo(store);
    undo(store);
    await stable();
    expect(names(list().toBuy)).toEqual(['A', 'B', 'Від друга']);
  });

  it('undoes «Очистити» for the whole bought list', async () => {
    const { store, list, names, button, stable } = await openList([item('Новий')], [item('A'), item('B')]);

    button('Очистити').click();
    await stable();
    expect(list().bought).toEqual([]);
    expect(store.notices()[0].text).toBe('Очищено куплене: 2');

    undo(store);
    await stable();
    expect(names(list().bought)).toEqual(['A', 'B']);
    expect(names(list().toBuy)).toEqual(['Новий']);
  });
});

describe('«Купити знову»', () => {
  const bought = (name: string, extra: Partial<Item> = {}) =>
    item(name, { price: 2, quantity: 3, boughtAt: 5000, categoryId: 'dairy', ...extra });

  it('is hidden while nothing is bought', async () => {
    const { page } = await openList([item('Молоко')]);
    expect(page.querySelector('.buy-again-btn')).toBeNull();
  });

  it('returns everything bought to the list in one tap, without purchase dates', async () => {
    const { store, list, names, button, stable } = await openList([item('Новий')], [bought('Молоко'), bought('Сир')]);

    button('↩ Купити знову').click();
    await stable();

    expect(list().bought).toEqual([]);
    expect(names(list().toBuy)).toEqual(['Новий', 'Молоко', 'Сир']);
    expect(list().toBuy.every((x) => !('boughtAt' in x))).toBe(true);
    expect(list().toBuy[1]).toMatchObject({ quantity: 3, price: 2, categoryId: 'dairy' }); // остальное сохранено
    expect(store.notices()[0].text).toBe('Повернуто до списку: 2');
  });

  it('keeps the purchases in the log so statistics do not lose them', async () => {
    const { list, button, stable } = await openList([], [bought('Молоко'), bought('Хліб', { categoryId: 'bakery', price: 1 })]);

    button('↩ Купити знову').click();
    await stable();

    expect(list().archive!.map((r) => [r.name, r.amount, r.category, r.at])).toEqual([
      ['Молоко', 6, 'Молочне та яйця', 5000],
      ['Хліб', 3, 'Хліб і випічка', 5000],
    ]);
  });

  it('can be undone: items go back to «bought» with their dates and the log is cleaned', async () => {
    const { store, list, names, button, stable } = await openList([item('Новий')], [bought('Молоко'), bought('Сир')]);

    button('↩ Купити знову').click();
    await stable();
    store.notices()[0].action!.run();
    await stable();

    expect(names(list().toBuy)).toEqual(['Новий']);
    expect(list().bought.map((x) => [x.name, x.boughtAt])).toEqual([['Молоко', 5000], ['Сир', 5000]]);
    expect(list().archive).toEqual([]);
  });

  it('works week after week: the same items go bought → back → bought and the log grows', async () => {
    const { list, row, button, stable } = await openList([], [bought('Молоко')]);

    button('↩ Купити знову').click();
    await stable();
    row('Молоко').querySelector<HTMLButtonElement>('.check-btn')!.click(); // купили на следующей неделе
    await stable();
    button('↩ Купити знову').click();
    await stable();

    expect(list().archive).toHaveLength(2);
    expect(list().toBuy.map((x) => x.name)).toEqual(['Молоко']);
  });

  it('«Очистити» also keeps the purchases in the log', async () => {
    const { list, button, stable } = await openList([], [bought('Молоко')]);
    button('Очистити').click();
    await stable();
    expect(list().archive!.map((r) => r.name)).toEqual(['Молоко']);
  });
});
