const vapidPublicKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined;

export function isWebPushConfigured() {
  return Boolean(vapidPublicKey);
}

export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

export async function subscribeToPush() {
  if (!vapidPublicKey) throw new Error("Web Push public key is missing");
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push is not supported in this browser");
  }

  const registration = await navigator.serviceWorker.ready;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications were not granted");

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
}

