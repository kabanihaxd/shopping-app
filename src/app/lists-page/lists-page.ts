import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ListsStore } from '../lists-store';

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

  protected delete(id: string, name: string) {
    if (confirm(`Удалить список «${name}»?`)) {
      this.store.deleteList(id);
    }
  }
}
