import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ListsStore } from '../lists-store';

/** Страница, на которую ведёт ссылка-приглашение: /#/join/<id списка>/<код> */
@Component({
  imports: [RouterLink],
  selector: 'app-join-page',
  styleUrl: './join-page.css',
  templateUrl: './join-page.html',
})
export class JoinPage {
  private readonly store = inject(ListsStore);
  private readonly router = inject(Router);

  /** Из адреса (withComponentInputBinding) */
  readonly id = input.required<string>();
  readonly code = input.required<string>();

  protected readonly state = signal<'ready' | 'joining' | 'failed'>('ready');
  /** Вступили и ждём, пока сервер пришлёт нам этот список */
  private readonly joined = signal(false);

  protected readonly alreadyMember = computed(() => this.store.lists().some((l) => l.id === this.id()));

  constructor() {
    // Список приходит с сервера чуть позже, чем проходит вступление — открываем, как только он появился
    effect(() => {
      if (this.joined() && this.alreadyMember()) {
        this.router.navigate(['/list', this.id()], { replaceUrl: true });
      }
    });
  }

  protected async join() {
    this.state.set('joining');
    const ok = await this.store.join(this.id(), this.code());
    if (ok) {
      this.joined.set(true);
    } else {
      this.state.set('failed');
    }
  }
}
