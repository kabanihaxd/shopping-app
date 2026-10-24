import { Category } from './category';
import { Item } from './item';

/**
 * Запись в журнале покупок списка. Нужна, чтобы статистика не теряла покупки, когда товары
 * уходят из «Вже куплено» («Купити знову», «Очистити»). Категория сохраняется текстом:
 * её потом могут переименовать или удалить, а покупка должна остаться как была.
 */
export type Purchase = {
  /** Случайный номер записи — по нему отменяют конкретную запись */
  r: string;
  name: string;
  /** Потрачено: количество × цена */
  amount: number;
  category: string;
  icon: string;
  /** Когда куплено (мс) */
  at: number;
};

/** Записи журнала для купленных товаров. Товары без даты покупки (старые) в статистику не входят — пропускаем. */
export function purchasesOf(items: Item[], categories: Category[]): Purchase[] {
  return items.flatMap((item) => {
    if (item.boughtAt === undefined) return [];
    const category = categories.find((c) => c.id === item.categoryId);
    return [
      {
        r: crypto.randomUUID(),
        name: item.name,
        amount: item.quantity * item.price,
        category: category?.name ?? 'Без категорії',
        icon: category?.icon ?? '🛒',
        at: item.boughtAt,
      },
    ];
  });
}
