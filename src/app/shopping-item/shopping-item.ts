import { Component, computed, inject, input, output, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Category } from '../category';
import { Item } from '../item';

@Component({
  imports: [CdkDragHandle, CurrencyPipe, ReactiveFormsModule],
  selector: 'li[app-shopping-item]',
  styleUrl: './shopping-item.css',
  templateUrl: './shopping-item.html',
})
export class ShoppingItem {
  private readonly fb = inject(NonNullableFormBuilder);

  readonly item = input.required<Item>();
  /** Товар уже куплен — галочка закрашена */
  readonly bought = input(false);
  /** Показать ручку ⠿ для перетаскивания (только в «Треба купити») */
  readonly showHandle = input(false);
  /** Категории списка — для иконки и выбора в форме */
  readonly categories = input<Category[]>([]);
  /** Нажали на галочку: перенести в «Уже купил» или обратно */
  readonly toggle = output();
  readonly remove = output();
  readonly save = output<Item>();

  protected readonly editing = signal(false);
  protected readonly category = computed(() =>
    this.categories().find((c) => c.id === this.item().categoryId),
  );

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.pattern(/\S/)]],
    quantity: [1, [Validators.required, Validators.min(1)]],
    price: [0, [Validators.required, Validators.min(0)]],
    categoryId: [''],
  });

  protected startEdit() {
    const { name, quantity, price } = this.item();
    // Если категорию тем временем удалили — в форме будет «Без категорії»
    this.form.reset({ name, quantity, price, categoryId: this.category()?.id ?? '' });
    this.editing.set(true);
  }

  protected cancel() {
    this.editing.set(false);
  }

  protected submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, quantity, price, categoryId } = this.form.getRawValue();
    this.save.emit({ ...this.item(), name: name.trim(), quantity, price, categoryId });
    this.editing.set(false);
  }
}
