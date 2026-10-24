import { ShoppingListData } from './lists-store';

/** Месяц для статистики; month — как в Date: 0 (січень) … 11 (грудень) */
export type MonthRef = { year: number; month: number };

export type CategoryTotal = {
  /** Название в нижнем регистре — по нему сливаются одноимённые категории из разных списков */
  key: string;
  name: string;
  icon: string;
  amount: number;
};

export type MonthStats = {
  /** Сколько потрачено за месяц (в евро, как и цены) */
  total: number;
  /** Сколько товаров куплено за месяц */
  count: number;
  /** По категориям — от самой дорогой к самой дешёвой, нулевые не показываем */
  byCategory: CategoryTotal[];
  /** Траты по дням: индекс 0 — 1-е число */
  byDay: number[];
  /** Купленных товаров без даты (куплены до появления статистики) — в месяцы не попадают */
  undated: number;
};

export const MONTH_NAMES = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];

export function daysInMonth({ year, month }: MonthRef): number {
  return new Date(year, month + 1, 0).getDate();
}

export function monthOf(ms: number): MonthRef {
  const d = new Date(ms);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** Соседний месяц: -1 — предыдущий, +1 — следующий (с переходом через год) */
export function shiftMonth({ year, month }: MonthRef, by: number): MonthRef {
  const d = new Date(year, month + by, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** Считает траты по купленным товарам из всех списков за один месяц (по местному времени). */
export function monthlyStats(lists: ShoppingListData[], ref: MonthRef): MonthStats {
  const byDay = new Array<number>(daysInMonth(ref)).fill(0);
  const categories = new Map<string, CategoryTotal>();
  let total = 0;
  let count = 0;
  let undated = 0;

  /** Учитывает одну покупку (если она в нужном месяце) */
  const add = (at: number, cost: number, name: string, icon: string) => {
    const bought = new Date(at);
    if (bought.getFullYear() !== ref.year || bought.getMonth() !== ref.month) return;
    total += cost;
    count++;
    byDay[bought.getDate() - 1] += cost;
    const key = name.trim().toLowerCase();
    const entry = categories.get(key) ?? { key, name, icon, amount: 0 };
    entry.amount += cost;
    categories.set(key, entry);
  };

  for (const list of lists) {
    for (const item of list.bought) {
      if (item.boughtAt === undefined) {
        undated++;
        continue;
      }
      const category = list.categories.find((c) => c.id === item.categoryId);
      add(item.boughtAt, item.quantity * item.price, category?.name ?? 'Без категорії', category?.icon ?? '🛒');
    }
    // Покупки, которые уже ушли из «Вже куплено» («Купити знову», «Очистити»), лежат в журнале
    for (const p of list.archive ?? []) add(p.at, p.amount, p.category, p.icon);
  }

  const byCategory = [...categories.values()]
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  return { total, count, byCategory, byDay, undated };
}
