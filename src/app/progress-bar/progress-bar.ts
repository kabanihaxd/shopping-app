import { Component, computed, input } from '@angular/core';

/** Полоска прогресса: сколько куплено из скольких. */
@Component({
  selector: 'app-progress-bar',
  templateUrl: './progress-bar.html',
  styleUrl: './progress-bar.css',
})
export class ProgressBar {
  readonly done = input.required<number>();
  readonly total = input.required<number>();

  /** Процент 0–100; для пустого списка — 0 (без деления на ноль) */
  protected readonly percent = computed(() => {
    const total = this.total();
    if (total <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((this.done() / total) * 100)));
  });
}
