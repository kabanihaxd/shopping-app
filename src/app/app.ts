import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { ListsStore } from './lists-store';
import { NicknameForm } from './nickname-form/nickname-form';

/** Куда вернуться после входа, если человек пришёл по ссылке-приглашению */
const PENDING_JOIN_KEY = 'pending-join';
/** Для кого человек нажал «Пропустити» в форме нікнейма — чтобы не спрашивать при каждом входе */
const NICKNAME_SKIPPED_KEY = 'nickname-skipped';
const THEME_KEY = 'theme';

/** auto — как в системе, иначе выбрано вручную */
export type Theme = 'auto' | 'light' | 'dark';
const THEMES: Theme[] = ['auto', 'light', 'dark'];
const THEME_LABELS: Record<Theme, { icon: string; name: string }> = {
  auto: { icon: '🌓', name: 'авто (як у системі)' },
  light: { icon: '☀️', name: 'світла' },
  dark: { icon: '🌙', name: 'темна' },
};

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

function readSkipped(): string {
  try {
    return localStorage.getItem(NICKNAME_SKIPPED_KEY) ?? '';
  } catch {
    return '';
  }
}

@Component({
  imports: [NicknameForm, RouterLink, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly store = inject(ListsStore);
  private readonly router = inject(Router);

  /** Тема оформления: авто / світла / темна. Запоминается на этом устройстве. */
  protected readonly theme = signal<Theme>(readTheme());
  protected readonly themeLabel = computed(() => THEME_LABELS[this.theme()]);

  /** Меняет нікнейм вручную (кнопка с именем вверху) */
  protected readonly editingNickname = signal(false);
  private readonly skippedFor = signal(readSkipped());
  /** Форма нікнейма: по просьбе человека или сама, если ника ещё нет и его не пропускали */
  protected readonly showNicknameForm = computed(
    () =>
      this.editingNickname() ||
      (this.store.profileReady() && !this.store.nickname() && this.skippedFor() !== this.store.email()),
  );

  /** true, когда service worker скачал новую версию сайта */
  protected readonly updateReady = signal(false);

  constructor() {
    // Тема — атрибут на <html>; сами цвета лежат в переменных (src/styles.css)
    effect(() => {
      const theme = this.theme();
      if (theme === 'auto') delete document.documentElement.dataset['theme'];
      else document.documentElement.dataset['theme'] = theme;
    });

    // Вход через Google уводит со страницы и возвращает на главную — адрес приглашения терялся бы.
    // Поэтому запоминаем его и после входа открываем снова.
    try {
      if (location.hash.startsWith('#/join/')) localStorage.setItem(PENDING_JOIN_KEY, location.hash.slice(1));
    } catch {
      // хранилище недоступно — тогда просто откроется главная
    }
    effect(() => {
      if (!this.store.user()) return;
      try {
        const pending = localStorage.getItem(PENDING_JOIN_KEY);
        if (!pending) return;
        localStorage.removeItem(PENDING_JOIN_KEY);
        this.router.navigateByUrl(pending);
      } catch {
        // см. выше
      }
    });

    // optional: в тестах и при `ng serve` service worker выключен
    const updates = inject(SwUpdate, { optional: true });
    if (updates?.isEnabled) {
      updates.versionUpdates.subscribe((event) => {
        if (event.type === 'VERSION_READY') this.updateReady.set(true);
      });
    }
  }

  /** По кругу: авто → світла → темна → авто */
  protected cycleTheme() {
    const next = THEMES[(THEMES.indexOf(this.theme()) + 1) % THEMES.length];
    this.theme.set(next);
    try {
      if (next === 'auto') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, next);
    } catch {
      // не запомнится — после перезагрузки снова «авто»
    }
  }

  protected saveNickname(nickname: string) {
    this.store.setNickname(nickname);
    this.editingNickname.set(false);
  }

  protected closeNicknameForm() {
    this.editingNickname.set(false);
    const email = this.store.email();
    this.skippedFor.set(email);
    try {
      localStorage.setItem(NICKNAME_SKIPPED_KEY, email);
    } catch {
      // не запомнится — спросим снова при следующем входе
    }
  }

  protected reload() {
    location.reload();
  }
}
