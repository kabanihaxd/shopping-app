import { Component, input, output, signal } from '@angular/core';
import { CATEGORY_ICONS, Category } from '../category';

/**
 * Редактор категорий: переименовать, сменить иконку, переставить, удалить, добавить.
 * Сам ничего не сохраняет — отдаёт родителю новый массив категорий через (update).
 */
@Component({
  selector: 'app-categories-editor',
  styleUrl: './categories-editor.css',
  templateUrl: './categories-editor.html',
})
export class CategoriesEditor {
  readonly categories = input.required<Category[]>();
  readonly update = output<Category[]>();

  protected readonly icons = CATEGORY_ICONS;
  /** Для какой категории открыт выбор иконки: её id, 'new' — для новой, null — ни для какой */
  protected readonly picking = signal<string | null>(null);
  /** Иконка для категории, которую сейчас добавляют */
  protected readonly newIcon = signal(CATEGORY_ICONS[0]);

  protected togglePicker(id: string) {
    this.picking.update((current) => (current === id ? null : id));
  }

  protected setIcon(id: string, icon: string) {
    if (id === 'new') {
      this.newIcon.set(icon);
    } else {
      this.update.emit(this.categories().map((c) => (c.id === id ? { ...c, icon } : c)));
    }
    this.picking.set(null);
  }

  protected rename(cat: Category, nameInput: HTMLInputElement) {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.value = cat.name; // пустое имя не сохраняем — возвращаем старое
      return;
    }
    if (name === cat.name) return;
    this.update.emit(this.categories().map((c) => (c.id === cat.id ? { ...c, name } : c)));
  }

  /** Сдвинуть категорию вверх (-1) или вниз (+1) — в этом порядке идут группы товаров */
  protected move(index: number, step: -1 | 1) {
    const list = [...this.categories()];
    [list[index], list[index + step]] = [list[index + step], list[index]];
    this.update.emit(list);
  }

  protected remove(cat: Category) {
    if (!confirm(`Видалити категорію «${cat.name}»? Товари з неї залишаться без категорії.`)) return;
    this.update.emit(this.categories().filter((c) => c.id !== cat.id));
  }

  protected add(nameInput: HTMLInputElement) {
    const name = nameInput.value.trim();
    if (!name) return;
    this.update.emit([...this.categories(), { id: crypto.randomUUID(), name, icon: this.newIcon() }]);
    nameInput.value = '';
    this.picking.set(null);
  }
}
