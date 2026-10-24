import { DEFAULT_CATEGORIES } from './category';
import { Item } from './item';
import { purchasesOf } from './purchase';

const item = (name: string, extra: Partial<Item> = {}): Item => ({
  id: name, name, quantity: 2, price: 3, categoryId: 'dairy', boughtAt: 1000, ...extra,
});

describe('purchasesOf', () => {
  it('should record amount, date and a text snapshot of the category', () => {
    const [p] = purchasesOf([item('Сир')], DEFAULT_CATEGORIES);
    expect(p).toEqual({ r: expect.any(String), name: 'Сир', amount: 6, category: 'Молочне та яйця', icon: '🥛', at: 1000 });
  });

  it('should fall back for an unknown or empty category', () => {
    const [p] = purchasesOf([item('Дещо', { categoryId: 'gone' })], DEFAULT_CATEGORIES);
    expect(p.category).toBe('Без категорії');
    expect(p.icon).toBe('🛒');
  });

  it('should remember the store and unit price only when a store is set', () => {
    const [withStore, without] = purchasesOf([item('Сир', { store: 'Сільпо', price: 4 }), item('Хліб')], DEFAULT_CATEGORIES);
    expect(withStore).toMatchObject({ store: 'Сільпо', unit: 4, amount: 8 });
    expect('store' in without).toBe(false);
    expect('unit' in without).toBe(false);
  });

  it('should skip items without a purchase date, and give every record its own id', () => {
    const records = purchasesOf([item('A'), item('Давнє', { boughtAt: undefined }), item('B')], DEFAULT_CATEGORIES);
    expect(records.map((r) => r.name)).toEqual(['A', 'B']);
    expect(records[0].r).not.toBe(records[1].r);
  });
});
