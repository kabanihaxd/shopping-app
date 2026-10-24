import { DEFAULT_CATEGORIES } from './category';
import { Item } from './item';
import { ShoppingListData } from './lists-store';
import { daysInMonth, monthlyStats, shiftMonth } from './stats';

const OCT = { year: 2026, month: 9 };

/** 15:00 местного времени — далеко от границ суток, чтобы часовой пояс не мешал */
const day = (month: number, d: number) => new Date(2026, month, d, 15).getTime();

function item(name: string, price: number, boughtAt: number | undefined, categoryId = '', quantity = 1): Item {
  return { id: name, name, quantity, price, categoryId, ...(boughtAt === undefined ? {} : { boughtAt }) };
}

function list(bought: Item[], categories = DEFAULT_CATEGORIES): ShoppingListData {
  return { id: 'l', name: 'L', ownerEmail: '', members: [], categories, toBuy: [], bought, createdAt: 0 };
}

describe('monthlyStats', () => {
  it('should sum only purchases of the chosen month', () => {
    const stats = monthlyStats(
      [list([item('Хліб', 2, day(9, 3)), item('Молоко', 3, day(9, 20)), item('Старе', 100, day(8, 30))])],
      OCT,
    );
    expect(stats.total).toBe(5);
    expect(stats.count).toBe(2);
  });

  it('should multiply price by quantity', () => {
    expect(monthlyStats([list([item('Яйця', 0.5, day(9, 1), '', 10)])], OCT).total).toBe(5);
  });

  it('should group by category, biggest first, and merge lists', () => {
    const stats = monthlyStats(
      [
        list([item('Хліб', 2, day(9, 3), 'bakery'), item('Сир', 10, day(9, 3), 'dairy')]),
        list([item('Молоко', 4, day(9, 5), 'dairy')]),
      ],
      OCT,
    );
    expect(stats.byCategory.map((c) => [c.name, c.amount])).toEqual([
      ['Молочне та яйця', 14],
      ['Хліб і випічка', 2],
    ]);
  });

  it('should put unknown or deleted categories under "Без категорії"', () => {
    const stats = monthlyStats([list([item('Дещо', 7, day(9, 3), 'gone'), item('Інше', 1, day(9, 4), '')])], OCT);
    expect(stats.byCategory.map((c) => [c.name, c.amount])).toEqual([['Без категорії', 8]]);
  });

  it('should spread spending over days of the month', () => {
    const stats = monthlyStats([list([item('A', 2, day(9, 1)), item('B', 3, day(9, 1)), item('C', 4, day(9, 31))])], OCT);
    expect(stats.byDay).toHaveLength(31);
    expect(stats.byDay[0]).toBe(5);
    expect(stats.byDay[30]).toBe(4);
    expect(stats.byDay[1]).toBe(0);
  });

  it('should skip undated items but report how many', () => {
    const stats = monthlyStats([list([item('Давнє', 50, undefined), item('Нове', 1, day(9, 2))])], OCT);
    expect(stats.total).toBe(1);
    expect(stats.undated).toBe(1);
  });

  it('should give zeros for an empty month', () => {
    const stats = monthlyStats([], OCT);
    expect(stats).toEqual({ total: 0, count: 0, byCategory: [], byDay: new Array(31).fill(0), undated: 0 });
  });
});

describe('month helpers', () => {
  it('should count days, including leap February', () => {
    expect(daysInMonth({ year: 2026, month: 1 })).toBe(28);
    expect(daysInMonth({ year: 2028, month: 1 })).toBe(29);
  });

  it('should shift months across year borders', () => {
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
  });
});
