import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withHashLocation } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withHashLocation: адреса вида /#/list/123 — GitHub Pages не умеет отдавать index.html на любой путь
    provideRouter(routes, withComponentInputBinding(), withHashLocation()),
    provideHttpClient(),
  ]
};
