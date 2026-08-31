import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { supabase } from "./supabase";

// Same values as public/firebase-messaging-sw.js, but read from Vite env
// vars here since this file *is* bundled (unlike the service worker).
// These are public/non-secret identifiers — safe to ship in the client
// bundle. Set them in your .env / Vercel Environment Variables:
//   VITE_FIREBASE_API_KEY
//   VITE_FIREBASE_AUTH_DOMAIN
//   VITE_FIREBASE_PROJECT_ID
//   VITE_FIREBASE_STORAGE_BUCKET
//   VITE_FIREBASE_MESSAGING_SENDER_ID
//   VITE_FIREBASE_APP_ID
//   VITE_FIREBASE_VAPID_KEY   (Firebase Console -> Project settings ->
//     Cloud Messaging -> Web Push certificates -> generate a key pair)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export type WebPushResult =
  | { status: "enabled" }
  | { status: "unsupported" }
  | { status: "denied" }
  | { status: "not_configured" }
  | { status: "error"; message: string };

/**
 * Call this from a button the user explicitly taps (e.g. "Enable
 * notifications" in Settings) — browsers require the permission prompt to
 * be triggered by a real user gesture, it can't happen silently on page
 * load.
 */
export async function enableWebPush(userId: string): Promise<WebPushResult> {
  if (!firebaseConfig.apiKey || !import.meta.env.VITE_FIREBASE_VAPID_KEY) {
    return { status: "not_configured" };
  }

  const supported = await isSupported().catch(() => false);
  if (!supported || !("Notification" in window) || !("serviceWorker" in navigator)) {
    return { status: "unsupported" };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { status: "denied" };

    if (getApps().length === 0) initializeApp(firebaseConfig);

    // Firebase's SDK expects its own dedicated service worker registration
    // (separate from the offline-cache /sw.js registered in main.tsx).
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

    const messaging = getMessaging();
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (!token) return { status: "error", message: "No token returned" };

    const { error } = await supabase
      .from("push_tokens")
      .upsert(
        { user_id: userId, token, platform: "web", updated_at: new Date().toISOString() },
        { onConflict: "user_id,platform" }
      );

    if (error) return { status: "error", message: error.message };

    return { status: "enabled" };
  } catch (err: any) {
    console.error("enableWebPush failed", err);
    return { status: "error", message: err?.message || "Unknown error" };
  }
}
