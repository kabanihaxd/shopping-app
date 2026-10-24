import { DEFAULT_CATEGORIES } from './category';
import { Item } from './item';
import { ShoppingListData } from './lists-store';
import { describeChange } from './notices';

const item = (name: string): Item => ({ id: name, name, quantity: 1, price: 0, categoryId: '' });

function list(toBuy: Item[], bought: Item[] = [], extra: Partial<ShoppingListData> = {}): ShoppingListData {
  return {
    id: 'l', name: 'Продукти', ownerEmail: 'me@example.com', members: ['me@example.com'],
    categories: DEFAULT_CATEGORIES, toBuy, bought, createdAt: 0, ...extra,
  };
}

const ME = 'me@example.com';
const OLGA = { updatedBy: 'olga@example.com' };

describe('describeChange', () => {
  it('should say who added what', () => {
    const text = describeChange(list([item('Хліб')]), list([item('Хліб'), item('Сир')], [], OLGA), ME);
    expect(text).toBe('olga у «Продукти»: додано — Сир');
  });

  it('should shorten a long list of new items', () => {
    const many = ['A', 'B', 'C', 'D', 'E'].map(item);
    expect(describeChange(list([]), list(many, [], OLGA), ME)).toContain('додано — A, B, C і ще 2');
  });

  it('should report bought items, not as added', () => {
    const text = describeChange(list([item('Хліб')]), list([], [item('Хліб')], OLGA), ME);
    expect(text).toBe('olga у «Продукти»: куплено — Хліб');
  });

  it('should report removed items by count', () => {
    const text = describeChange(list([item('A'), item('B')]), list([item('A')], [], OLGA), ME);
    expect(text).toContain('видалено товарів: 1');
  });

  it('should stay silent about my own changes from another device', () => {
    expect(describeChange(list([]), list([item('Сир')], [], { updatedBy: ME }), ME)).toBeNull();
  });

  it('should fall back to a generic text, and to "Хтось" for old documents', () => {
    expect(describeChange(list([item('A')]), list([item('A')], [], { name: 'Нова назва' }), ME)).toBe(
      'Хтось у «Нова назва»: список змінено',
    );
  });

  it('should tell about a new member, but not to the member themselves', () => {
    const before = list([], [], { members: [ME] });
    const after = list([], [], { members: [ME, 'olga@example.com'], updatedBy: ME });
    expect(describeChange(before, after, ME)).toBe('Новий учасник у «Продукти»: olga');
    expect(describeChange(before, after, 'olga@example.com')).toBeNull();
  });

  it('should stay silent when the owner only switches the invite link', () => {
    const before = list([item('A')]);
    const after = list([item('A')], [], { inviteCode: 'secret', updatedBy: 'boss@example.com' });
    expect(describeChange(before, after, ME)).toBeNull();
  });

  it('should use nicknames instead of emails when it knows them', () => {
    const nicks: Record<string, string> = { 'olga@example.com': 'Оля' };
    const nameOf = (e: string) => nicks[e] ?? e.split('@')[0];
    const text = describeChange(list([]), list([item('Сир')], [], OLGA), ME, nameOf);
    expect(text).toBe('Оля у «Продукти»: додано — Сир');
  });

  it('should tell that a list was shared with me', () => {
    expect(describeChange(undefined, list([]), ME)).toBe('Вам надали доступ до списку «Продукти»');
  });
});
