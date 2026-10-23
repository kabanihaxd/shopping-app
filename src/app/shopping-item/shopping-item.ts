import { Component, input, output } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { Item } from '../item';

@Component({
  imports: [CurrencyPipe],
  selector: 'li[app-shopping-item]',
  styleUrl: './shopping-item.css',
  templateUrl: './shopping-item.html',
})
export class ShoppingItem {
  readonly item = input.required<Item>();
  readonly remove = output();
}
