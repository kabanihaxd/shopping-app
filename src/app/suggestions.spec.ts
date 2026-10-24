import { HistoryEntry, forgetItem, rememberItem, suggest } from './suggestions';

const entry = (name: string, count = 1, lastUsed = 0): HistoryEntry => ({
  name,
  categoryId: '',
  price: 0,
  count,
  lastUsed,
});

describe('suggest', () => {
  const history = [
    entry('Молоко', 5),
    entry('Кокосове молоко', 9),
    entry('Мило', 1),
    entry('Шоколад молочний', 2),
    entry('Хліб', 7),
  ];

  it('should put matches from the beginning first, then by how often', () => {
    expect(suggest('мол', history).map((e) => e.name)).toEqual([
      'Молоко', // с начала названия
      'Кокосове молоко', // с начала слова: чаще, чем «молочний»
      'Шоколад молочний',
    ]);
  });

  it('should ignore letter case and spaces around', () => {
    expect(suggest('  ХЛІ ', history).map((e) => e.name)).toEqual(['Хліб']);
  });

  it('should not suggest what is already in the list', () => {
    expect(suggest('мол', history, ['молоко']).map((e) => e.name)).not.toContain('Молоко');
  });

  it('should return nothing for empty input', () => {
    expect(suggest('', history)).toEqual([]);
  });
});

describe('rememberItem', () => {
  const item = { id: '1', name: 'Молоко', quantity: 1, price: 1.5, categoryId: 'dairy' };

  it('should count repeated items instead of duplicating them', () => {
    const once = rememberItem([], item, 1);
    const twice = rememberItem(once, { ...item, name: 'молоко', price: 0 }, 2);

    expect(twice.length).toBe(1);
    expect(twice[0]).toMatchObject({ count: 2, lastUsed: 2, price: 1.5 }); // без цены — прошлая цена
  });

  it('should forget an item', () => {
    expect(forgetItem(rememberItem([], item), 'МОЛОКО')).toEqual([]);
  });
});
