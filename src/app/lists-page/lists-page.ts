import { Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ListsStore, ShoppingListData } from '../lists-store';
import { ProgressBar } from '../progress-bar/progress-bar';

@Component({
  imports: [RouterLink, ProgressBar],
  selector: 'app-lists-page',
  styleUrl: './lists-page.css',
  templateUrl: './lists-page.html',
})
export class ListsPage {
  private readonly router = inject(Router);
  protected readonly store = inject(ListsStore);

  /** id списка, который сейчас переименовываем (null — никакой) */
  protected readonly renamingId = signal<string | null>(null);
  private readonly nameField = viewChild<ElementRef<HTMLInputElement>>('listName');

  constructor() {
    effect(() => {
      const field = this.nameField()?.nativeElement;
      field?.focus();
      field?.select();
    });
  }

  protected saveName(list: ShoppingListData, nameInput: HTMLInputElement) {
    if (this.renamingId() !== list.id) return; // отменили по Esc
    this.renamingId.set(null);
    const name = nameInput.value.trim();
    if (name && name !== list.name) {
      this.store.update(list.id, (l) => ({ ...l, name }));
    }
  }

  protected create(input: HTMLInputElement) {
    const name = input.value.trim();
    if (!name) return;
    const id = this.store.create(name);
    input.value = '';
    this.router.navigate(['/list', id]);
  }

  /** Копия списка (например, «Щотижневі продукти») — сразу открываем её */
  protected copy(list: ShoppingListData) {
    const id = this.store.duplicate(list.id);
    if (id) this.router.navigate(['/list', id]);
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
