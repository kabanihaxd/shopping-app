// Настройки проекта Firebase: Firebase Console → ⚙ Project settings → Your apps → SDK setup and configuration.
// Это не секрет: такие ключи всегда видны в коде сайта. Защищают данные правила в firestore.rules.
export const firebaseConfig = {
  apiKey: 'AIzaSyCz147hlWs9dWcU4JNhwzUYLj9CmMM3izU',
  // Совпадает с адресом сайта (Firebase Hosting) — иначе Safari блокирует вход через Google
  authDomain: 'shopping-app-78237.web.app',
  projectId: 'shopping-app-78237',
  storageBucket: 'shopping-app-78237.firebasestorage.app',
  messagingSenderId: '740485314108',
  appId: '1:740485314108:web:bc1223da425e8d54693539',
};

// Админ — только он видит, кто заходил на сайт. Это UID (номер аккаунта в Firebase), а не email:
// по нему нельзя узнать почту. Тот же номер записан в firestore.rules — там настоящая защита.
export const ADMIN_UID = 'IEZM3sFzcGQZd5ByRNPlHzamfjT2';
