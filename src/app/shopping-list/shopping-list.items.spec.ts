import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RATES_URL, ShoppingList } from './shopping-list';
import { ListsStore } from '../lists-store';
import { Item } from '../item';
import { FakeListsStore, provideFakeListsStore } from '../testing/fake-lists-store';

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
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), provideFakeListsStore()],
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
