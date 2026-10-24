import { loadItems, toList } from './lists-store';
import { DEFAULT_CATEGORIES } from './category';

// Проверяем, что старые данные из базы (сохранённые прошлыми версиями приложения) читаются без ошибок
describe('loadItems', () => {
  it('turns old plain-text items into full items', () => {
    const [x] = loadItems(['Хліб']);
    expect(x).toEqual({ id: expect.any(String), name: 'Хліб', quantity: 1, price: 0, categoryId: '' });
  });

  it('fills in fields that older items did not have', () => {
    expect(loadItems([{ id: '1', name: 'Сир' }])).toEqual([
      { id: '1', name: 'Сир', quantity: 1, price: 0, categoryId: '' },
    ]);
  });

  it('keeps all fields of a modern item', () => {
    const modern = { id: '1', name: 'Сир', quantity: 2, price: 3.5, categoryId: 'dairy' };
    expect(loadItems([modern])).toEqual([modern]);
  });

  it('returns an empty list for missing or broken data', () => {
    expect(loadItems(undefined)).toEqual([]);
    expect(loadItems('не масив')).toEqual([]);
  });
});

describe('toList archive', () => {
  it('should default to an empty purchase log and keep a saved one', () => {
    expect(toList('a', {}).archive).toEqual([]);
    const log = [{ r: '1', name: 'Сир', amount: 6, category: 'Молочне', icon: '🥛', at: 5 }];
    expect(toList('a', { archive: log }).archive).toEqual(log);
  });
});

describe('toList', () => {
  it('gives default categories to lists created before categories existed', () => {
    const list = toList('abc', { name: 'Старий', ownerEmail: 'me@example.com', members: ['me@example.com'] });

    expect(list).toMatchObject({ id: 'abc', name: 'Старий', toBuy: [], bought: [], createdAt: 0 });
    expect(list.categories).toEqual(DEFAULT_CATEGORIES);
  });

  it('keeps the categories of the list, even an empty set', () => {
    const own = [{ id: 'x', name: 'Своє', icon: '🎁' }];
    expect(toList('a', { categories: own }).categories).toEqual(own);
    expect(toList('a', { categories: [] }).categories).toEqual([]); // все удалили — не возвращаем стандартные
  });

  it('names a list without a name', () => {
    expect(toList('a', {}).name).toBe('Без назви');
  });
});
