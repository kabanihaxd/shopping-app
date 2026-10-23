import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { ListsStore } from './lists-store';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly store = inject(ListsStore);

  /** true, когда service worker скачал новую версию сайта */
  protected readonly updateReady = signal(false);

  constructor() {
    // optional: в тестах и при `ng serve` service worker выключен
    const updates = inject(SwUpdate, { optional: true });
    if (updates?.isEnabled) {
      updates.versionUpdates.subscribe((event) => {
        if (event.type === 'VERSION_READY') this.updateReady.set(true);
      });
    }
  }

  protected reload() {
    location.reload();
  }
}
