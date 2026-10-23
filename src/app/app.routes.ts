import { Routes } from '@angular/router';
import { ListsPage } from './lists-page/lists-page';
import { ShoppingList } from './shopping-list/shopping-list';

export const routes: Routes = [
  { path: '', component: ListsPage },
  { path: 'list/:id', component: ShoppingList },
  { path: '**', redirectTo: '' },
];
