import { Component, computed, inject, input } from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { Item } from '../item';
import { ListsStore } from '../lists-store';
import { ShoppingItem } from '../shopping-item/shopping-item';

export const RATES_URL = 'https://open.er-api.com/v6/latest/EUR';

/** Ответ API курсов валют (берём только нужные поля) */
type RatesResponse = {
  rates: Record<string, number>;
};

function sumCost(list: Item[]): number {
  return list.reduce((sum, x) => sum + x.quantity * x.price, 0);
}

@Component({
  imports: [CurrencyPipe, DecimalPipe, RouterLink, ShoppingItem],
  selector: 'app-shopping-list',
  styleUrl: './shopping-list.css',
  templateUrl: './shopping-list.html',
})
export class ShoppingList {
  private readonly store = inject(ListsStore);

  /** Берётся из адреса /list/:id (withComponentInputBinding в app.config.ts) */
  readonly id = input.required<string>();

  protected readonly list = this.store.find(() => this.id());
  protected readonly toBuy = computed(() => this.list()?.toBuy ?? []);
  protected readonly bought = computed(() => this.list()?.bought ?? []);

  protected readonly remaining = computed(() => this.toBuy().length);
  protected readonly total = computed(() => this.toBuy().length + this.bought().length);
  protected readonly remainingCost = computed(() => sumCost(this.toBuy()));
  protected readonly boughtCost = computed(() => sumCost(this.bought()));

  /** Курс евро из интернета: загружается сам при открытии страницы */
  protected readonly rates = httpResource<RatesResponse>(() => RATES_URL);
  protected readonly rubRate = computed(() => this.rates.value()?.rates['RUB']);

  protected add(nameInput: HTMLInputElement, qtyInput: HTMLInputElement, priceInput: HTMLInputElement) {
    const name = nameInput.value.trim();
    if (!name) return;
    const quantity = Number(qtyInput.value) || 1;
    const price = Number(priceInput.value) || 0;
    const item: Item = { id: crypto.randomUUID(), name, quantity, price };
    this.store.update(this.id(), (l) => ({ ...l, toBuy: [...l.toBuy, item] }));
    nameInput.value = '';
    qtyInput.value = '';
    priceInput.value = '';
    nameInput.focus();
  }

  protected buy(item: Item) {
    this.store.update(this.id(), (l) => ({
      ...l,
      toBuy: l.toBuy.filter((x) => x.id !== item.id),
      bought: [...l.bought, item],
    }));
  }

  protected returnItem(item: Item) {
    this.store.update(this.id(), (l) => ({
      ...l,
      bought: l.bought.filter((x) => x.id !== item.id),
      toBuy: [...l.toBuy, item],
    }));
  }

  protected remove(item: Item) {
    this.store.update(this.id(), (l) => ({
      ...l,
      toBuy: l.toBuy.filter((x) => x.id !== item.id),
      bought: l.bought.filter((x) => x.id !== item.id),
    }));
  }

  protected updateItem(updated: Item) {
    const replace = (items: Item[]) => items.map((x) => (x.id === updated.id ? updated : x));
    this.store.update(this.id(), (l) => ({
      ...l,
      toBuy: replace(l.toBuy),
      bought: replace(l.bought),
    }));
  }

  protected clearBought() {
    this.store.update(this.id(), (l) => ({ ...l, bought: [] }));
  }
}
