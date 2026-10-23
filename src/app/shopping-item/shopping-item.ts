import { Component, inject, input, output, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Item } from '../item';

@Component({
  imports: [CurrencyPipe, ReactiveFormsModule],
  selector: 'li[app-shopping-item]',
  styleUrl: './shopping-item.css',
  templateUrl: './shopping-item.html',
})
export class ShoppingItem {
  private readonly fb = inject(NonNullableFormBuilder);

  readonly item = input.required<Item>();
  readonly remove = output();
  readonly save = output<Item>();

  protected readonly editing = signal(false);

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.pattern(/\S/)]],
    quantity: [1, [Validators.required, Validators.min(1)]],
    price: [0, [Validators.required, Validators.min(0)]],
  });

  protected startEdit() {
    const { name, quantity, price } = this.item();
    this.form.reset({ name, quantity, price });
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
    const { name, quantity, price } = this.form.getRawValue();
    this.save.emit({ ...this.item(), name: name.trim(), quantity, price });
    this.editing.set(false);
  }
}
