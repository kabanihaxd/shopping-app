import { Component, input, output, signal } from '@angular/core';
import { NICKNAME_MAX, cleanNickname, nicknameError } from '../nickname';

/** Форма «придумайте нікнейм»: и при первом входе, и при смене ника позже */
@Component({
  selector: 'app-nickname-form',
  templateUrl: './nickname-form.html',
  styleUrl: './nickname-form.css',
})
export class NicknameForm {
  /** Текущий ник (пусто, если ещё нет) */
  readonly current = input('');
  /** Закрыть форму без сохранения: при первом входе это «Пропустити», при смене — «Скасувати» */
  readonly skip = output();
  readonly save = output<string>();

  protected readonly maxLength = NICKNAME_MAX;
  protected readonly error = signal<string | null>(null);

  protected submit(field: HTMLInputElement) {
    const problem = nicknameError(field.value);
    this.error.set(problem);
    if (!problem) this.save.emit(cleanNickname(field.value));
  }
}
