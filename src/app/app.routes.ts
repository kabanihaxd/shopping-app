import { Routes } from '@angular/router';
import { ListsPage } from './lists-page/lists-page';
import { ShoppingList } from './shopping-list/shopping-list';

export const routes: Routes = [
  { path: '', component: ListsPage },
  { path: 'list/:id', component: ShoppingList },
  { path: 'join/:id/:code', loadComponent: () => import('./join-page/join-page').then((m) => m.JoinPage) },
  { path: 'stats', loadComponent: () => import('./stats-page/stats-page').then((m) => m.StatsPage) },
  { path: '**', redirectTo: '' },
];
