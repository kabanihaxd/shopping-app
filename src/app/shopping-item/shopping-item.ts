import { Component, computed, inject, input, output, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Category } from '../category';
import { Item, NOTE_MAX, STORE_MAX } from '../item';
import { DealHint } from '../price-book';

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
  /** «Дешевше в Сільпо…» — подсказка из истории цен (только для товаров «треба купити») */
  readonly hint = input<DealHint | null>(null);
  /** Категории списка — для иконки и выбора в форме */
  readonly categories = input<Category[]>([]);
  /** Нажали на галочку: перенести в «Уже купил» или обратно */
  readonly toggle = output();
  /** Нажали 📌: снять закрепление, товар снова встанет по цене */
  readonly unpin = output();
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
    note: ['', Validators.maxLength(NOTE_MAX)],
    store: ['', Validators.maxLength(STORE_MAX)],
  });

  protected readonly noteMax = NOTE_MAX;
  protected readonly storeMax = STORE_MAX;

  protected startEdit() {
    const { name, quantity, price, note, store } = this.item();
    // Если категорию тем временем удалили — в форме будет «Без категорії»
    this.form.reset({ name, quantity, price, categoryId: this.category()?.id ?? '', note: note ?? '', store: store ?? '' });
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
    const { name, quantity, price, categoryId, note, store } = this.form.getRawValue();
    // Пустые заметка и магазин — полей нет совсем (Firestore не принимает undefined)
    const { note: oldNote, store: oldStore, ...rest } = this.item();
    const edited: Item = { ...rest, name: name.trim(), quantity, price, categoryId };
    const text = note.trim();
    const shop = store.trim();
    this.save.emit({ ...edited, ...(text ? { note: text } : {}), ...(shop ? { store: shop } : {}) });
    this.editing.set(false);
  }
}
