export interface NotificationPrefs {
  trades: boolean;
  profits: boolean;
  losses: boolean;
  aiDecisions: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  trades: true,
  profits: true,
  losses: true,
  aiDecisions: true,
};

const PREFS_KEY = 'titan_notification_prefs';
export const LAST_READ_KEY = 'titan_notifications_last_read';
export const PREFS_EVENT = 'titan:notification-prefs';

export function loadNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_PREFS;
    return { ...DEFAULT_NOTIFICATION_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
}

export function saveNotificationPrefs(prefs: NotificationPrefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new Event(PREFS_EVENT));
}
