// Firebase Web Push background handler.
//
// This file MUST live at the site root (/firebase-messaging-sw.js) and be a
// plain, unbundled script — Firebase's SDK looks for it at exactly that
// path when registering for push. It's intentionally separate from
// /sw.js (the existing offline-cache service worker); the two run
// independently and don't conflict.
//
// The values below are NOT secret — a Firebase web app config is meant to
// be publicly visible (it identifies your project, it doesn't grant
// access to it). Fill these in from:
//   Firebase Console -> Project settings -> General -> Your apps
//   -> (add a Web app if you don't have one yet) -> SDK setup and config
importScripts("https://www.gstatic.com/firebasejs/12.0.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.0.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "REPLACE_WITH_FIREBASE_API_KEY",
  authDomain: "REPLACE_WITH_FIREBASE_AUTH_DOMAIN", // e.g. your-project.firebaseapp.com
  projectId: "REPLACE_WITH_FIREBASE_PROJECT_ID",
  storageBucket: "REPLACE_WITH_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "REPLACE_WITH_FIREBASE_MESSAGING_SENDER_ID",
  appId: "REPLACE_WITH_FIREBASE_APP_ID",
});

const messaging = firebase.messaging();

// api/send-push.ts always sends data-only payloads (no `notification`
// block) on every platform, so this handler is what actually puts a
// notification on screen for the website — same shape of data the
// Android app's own FCM service reads.
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = data.title || "VoiceID";
  const body = data.body || "You have a new notification";
  const deepLink = data.deep_link || "/dashboard";

  self.registration.showNotification(title, {
    body,
    icon: "/apple-touch-icon.png",
    badge: "/apple-touch-icon.png",
    data: { deepLink },
    tag: data.type || "voiceid-notification", // collapses repeats of the same kind instead of stacking
  });
});

// Tapping the notification focuses an existing VoiceID tab if one's open,
// otherwise opens a new one at the relevant page.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const deepLink = event.notification.data?.deepLink || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(deepLink);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(deepLink);
    })
  );
});
