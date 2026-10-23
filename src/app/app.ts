import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ListsStore } from './lists-store';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly store = inject(ListsStore);
}
