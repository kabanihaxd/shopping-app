import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ListsStore, ShoppingListData } from '../lists-store';

@Component({
  imports: [RouterLink],
  selector: 'app-lists-page',
  styleUrl: './lists-page.css',
  templateUrl: './lists-page.html',
})
export class ListsPage {
  private readonly router = inject(Router);
  protected readonly store = inject(ListsStore);

  protected create(input: HTMLInputElement) {
    const name = input.value.trim();
    if (!name) return;
    const id = this.store.create(name);
    input.value = '';
    this.router.navigate(['/list', id]);
  }

  protected delete(list: ShoppingListData) {
    const question =
      list.ownerEmail === this.store.email()
        ? `Видалити список «${list.name}» у всіх учасників?`
        : `Вийти зі списку «${list.name}»? Він зникне лише у вас.`;
    if (confirm(question)) {
      this.store.deleteList(list.id);
    }
  }
}
