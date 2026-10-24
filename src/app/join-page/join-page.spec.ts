import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { JoinPage } from './join-page';
import { ListsStore, ShoppingListData } from '../lists-store';
import { DEFAULT_CATEGORIES } from '../category';
import { FakeListsStore, provideFakeListsStore } from '../testing/fake-lists-store';

/** Чужой список с включённой ссылкой-приглашением */
const sharedList: ShoppingListData = {
  id: 'abc',
  name: 'Спільний',
  ownerEmail: 'boss@example.com',
  members: ['boss@example.com'],
  categories: DEFAULT_CATEGORIES,
  toBuy: [],
  bought: [],
  createdAt: 0,
  inviteCode: 'secret',
};

describe('JoinPage', () => {
  let store: FakeListsStore;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JoinPage],
      providers: [provideRouter([]), provideFakeListsStore()],
    }).compileComponents();
    store = TestBed.inject(ListsStore) as unknown as FakeListsStore;
    store.joinable = [sharedList];
  });

  async function openPage(code: string) {
    const fixture = TestBed.createComponent(JoinPage);
    fixture.componentRef.setInput('id', 'abc');
    fixture.componentRef.setInput('code', code);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    return { fixture, page, joinBtn: () => page.querySelector<HTMLButtonElement>('.join-btn')! };
  }

  it('should join with the right code and open the list', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const { fixture, joinBtn } = await openPage('secret');

    joinBtn().click();
    await fixture.whenStable();

    expect(store.lists().map((l) => l.id)).toEqual(['abc']);
    expect(store.lists()[0].members).toContain('me@example.com');
    expect(navigate).toHaveBeenCalledWith(['/list', 'abc'], { replaceUrl: true });
  });

  it('should explain the problem when the code is wrong', async () => {
    const { fixture, page, joinBtn } = await openPage('guess');

    joinBtn().click();
    await fixture.whenStable();

    expect(store.lists()).toEqual([]);
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('недійсне');
    expect(joinBtn().disabled).toBe(false); // можно попробовать ещё раз
  });

  it('should not offer to join a list I am already in', async () => {
    store.lists.set([{ ...sharedList, members: ['boss@example.com', 'me@example.com'] }]);
    const { page, joinBtn } = await openPage('secret');

    expect(joinBtn()).toBeNull();
    expect(page.querySelector('.open-btn')?.getAttribute('href')).toBe('/list/abc');
  });
});
