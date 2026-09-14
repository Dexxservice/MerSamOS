importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCKF4yb7X6XDt5PSTMwiXmn0y7j9aTVMjc",
  authDomain: "date-decision-maker.firebaseapp.com",
  databaseURL: "https://date-decision-maker-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "date-decision-maker",
  storageBucket: "date-decision-maker.firebasestorage.app",
  messagingSenderId: "187389563873",
  appId: "1:187389563873:web:4fa5fea6a44c42e18078a0"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || 'MerSam OS';
  const body = (payload.notification && payload.notification.body) || '';
  self.registration.showNotification(title, {
    body,
    icon: '/icon.png',
    badge: '/icon.png',
    tag: (payload.data && payload.data.tag) || 'mersam-os',
    data: payload.data || {}
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
