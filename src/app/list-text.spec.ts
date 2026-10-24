import { listToText } from './list-text';

const item = (name: string, quantity = 1, price = 0) => ({ id: name, name, quantity, price, categoryId: '' });

describe('listToText', () => {
  it('puts the name first, then items grouped by category', () => {
    const text = listToText('Тиждень', [
      { title: '🥛 Молочні', items: [item('Молоко', 2, 1.5), item('Сир')] },
      { title: 'Без категорії', items: [item('Хліб')] },
    ]);
    expect(text).toBe('🛒 Тиждень\n\n🥛 Молочні\n• Молоко × 2 — 3.00 €\n• Сир\n\nБез категорії\n• Хліб');
  });
});
