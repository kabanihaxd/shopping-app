import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ListsStore } from '../lists-store';
import { MONTH_NAMES, MonthRef, monthOf, monthlyStats, shiftMonth } from '../stats';

@Component({
  imports: [CurrencyPipe, RouterLink],
  selector: 'app-stats-page',
  styleUrl: './stats-page.css',
  templateUrl: './stats-page.html',
})
export class StatsPage {
  private readonly store = inject(ListsStore);
  private readonly currentMonth = monthOf(Date.now());

  /** Какой месяц смотрим — сначала текущий */
  protected readonly shown = signal<MonthRef>(this.currentMonth);
  /** День месяца (индекс с 0), на который нажали в графике */
  protected readonly selectedDay = signal<number | null>(null);

  protected readonly stats = computed(() => monthlyStats(this.store.lists(), this.shown()));
  protected readonly monthName = computed(() => `${MONTH_NAMES[this.shown().month]} ${this.shown().year}`);
  /** В будущее смотреть незачем */
  protected readonly isCurrent = computed(
    () => this.shown().year === this.currentMonth.year && this.shown().month === this.currentMonth.month,
  );

  protected readonly maxCategory = computed(() => Math.max(0, ...this.stats().byCategory.map((c) => c.amount)));
  protected readonly maxDay = computed(() => Math.max(0, ...this.stats().byDay));

  /** Текст под графиком: «5 жовтня: €12.30» — после нажатия на колонку */
  protected readonly selectedText = computed(() => {
    const day = this.selectedDay();
    if (day === null) return null;
    return { day: day + 1, amount: this.stats().byDay[day] ?? 0 };
  });

  protected percent(value: number, max: number): number {
    return max > 0 ? (value / max) * 100 : 0;
  }

  protected go(by: number) {
    this.shown.update((m) => shiftMonth(m, by));
    this.selectedDay.set(null);
  }
}
