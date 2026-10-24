import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ListsPage } from './lists-page';
import { ListsStore } from '../lists-store';
import { FakeListsStore, provideFakeListsStore } from '../testing/fake-lists-store';

describe('ListsPage', () => {
  let store: FakeListsStore;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ListsPage],
      providers: [provideRouter([]), provideFakeListsStore()],
    }).compileComponents();
    store = TestBed.inject(ListsStore) as unknown as FakeListsStore;
  });

  async function openPage() {
    const fixture = TestBed.createComponent(ListsPage);
    await fixture.whenStable();
    return { fixture, page: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => vi.restoreAllMocks());

  it('should say there are no lists yet', async () => {
    const { page } = await openPage();
    expect(page.textContent).toContain('Списків поки немає');
  });

  it('should create a list and open it', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const { page } = await openPage();
    const name = page.querySelector<HTMLInputElement>('input[placeholder="Назва нового списку"]')!;

    name.value = '  На свято ';
    page.querySelector<HTMLButtonElement>('.add-btn')!.click();

    expect(store.lists().map((l) => l.name)).toEqual(['На свято']);
    expect(navigate).toHaveBeenCalledWith(['/list', store.lists()[0].id]);
    expect(name.value).toBe('');
  });

  it('should show counts and that a list is shared', async () => {
    const id = store.create('Продукти');
    store.update(id, (l) => ({
      ...l,
      members: [...l.members, 'friend@example.com'],
      toBuy: [{ id: '1', name: 'Хліб', quantity: 1, price: 0, categoryId: '' }],
      bought: [{ id: '2', name: 'Сир', quantity: 1, price: 0, categoryId: '' }],
    }));
    const { page } = await openPage();

    expect(page.querySelector('.list-meta')?.textContent).toContain('залишилось 1 з 2');
    expect(page.querySelector('.shared')?.textContent).toContain('👥 2');
    expect(page.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('50');
  });

  it('should delete my own list only after confirmation', async () => {
    store.create('Продукти');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { page } = await openPage();
    const removeBtn = page.querySelector<HTMLButtonElement>('.remove-btn')!;

    removeBtn.click();
    expect(store.lists().length).toBe(1);
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('у всіх учасників'));

    confirmSpy.mockReturnValue(true);
    removeBtn.click();
    expect(store.lists().length).toBe(0);
  });

  it('should offer to leave a list that belongs to someone else', async () => {
    const id = store.create('Чужий');
    store.update(id, (l) => ({ ...l, ownerEmail: 'boss@example.com' }));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { page } = await openPage();

    const removeBtn = page.querySelector<HTMLButtonElement>('.remove-btn')!;
    expect(removeBtn.getAttribute('aria-label')).toBe('Вийти зі списку');
    removeBtn.click();
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Вийти зі списку «Чужий»'));
  });

  it('should copy a list with all items back in "to buy" and open the copy', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const id = store.create('Щотижневі продукти');
    store.update(id, (l) => ({
      ...l,
      members: [...l.members, 'friend@example.com'],
      toBuy: [{ id: 'a', name: 'Хліб', quantity: 1, price: 2, categoryId: 'bakery' }],
      bought: [{ id: 'b', name: 'Сир', quantity: 2, price: 5, categoryId: 'dairy', boughtAt: 123 }],
    }));
    const { page } = await openPage();

    page.querySelector<HTMLButtonElement>('.copy-btn')!.click();

    const [original, copy] = store.lists();
    expect(copy.name).toBe('Щотижневі продукти (копія)');
    expect(copy.toBuy.map((x) => x.name)).toEqual(['Хліб', 'Сир']);
    expect(copy.toBuy[1]).toEqual({ id: expect.any(String), name: 'Сир', quantity: 2, price: 5, categoryId: 'dairy' });
    expect(copy.bought).toEqual([]);
    expect(copy.members).toEqual(['me@example.com']); // друзья доступа к копии не получают
    expect(copy.toBuy[0].id).not.toBe('a'); // новые id — копия не связана с оригиналом
    expect(original.bought.length).toBe(1); // оригинал не тронут
    expect(navigate).toHaveBeenCalledWith(['/list', copy.id]);
  });

  it('should rename a list right on the main page', async () => {
    store.create('Продукти');
    const { fixture, page } = await openPage();

    page.querySelector<HTMLButtonElement>('.rename-btn')!.click();
    await fixture.whenStable();
    const field = page.querySelector<HTMLInputElement>('.rename-input')!;
    field.value = 'Для дачі';
    field.dispatchEvent(new Event('blur')); // клик мимо поля тоже сохраняет
    await fixture.whenStable();

    expect(store.lists()[0].name).toBe('Для дачі');
    expect(page.querySelector('.list-name')?.textContent).toContain('Для дачі');
  });

  it('should cancel renaming on Escape', async () => {
    store.create('Продукти');
    const { fixture, page } = await openPage();

    page.querySelector<HTMLButtonElement>('.rename-btn')!.click();
    await fixture.whenStable();
    const field = page.querySelector<HTMLInputElement>('.rename-input')!;
    field.value = 'Чернетка';
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();

    expect(store.lists()[0].name).toBe('Продукти');
    expect(page.querySelector('.rename-input')).toBeNull();
  });
});
