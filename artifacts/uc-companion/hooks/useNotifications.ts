/**
 * Notification utilities for the Ultra-Clear Companion.
 *
 * Covers three concerns:
 *   1. Permission request + Expo push-token retrieval
 *   2. Local scheduled notifications for filter replacement reminders
 *   3. Foreground notification handler (set at module load, before any render)
 *
 * All functions are no-ops on web — expo-notifications only works on native.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Foreground handler ───────────────────────────────────────────────────────
// Must be called before the first notification can arrive; module-level is safe.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert:  true,
      shouldPlaySound:  false,
      shouldSetBadge:   true,
      shouldShowBanner: true,
      shouldShowList:   true,
    }),
  });
}

// ── Storage keys ─────────────────────────────────────────────────────────────
const PUSH_TOKEN_KEY     = 'uc_push_token';
const FILTER_ALERTED_PFX = 'uc_filter_alerted_';

// ── Permission status helper ─────────────────────────────────────────────────

export type NotifPermStatus = 'granted' | 'denied' | 'undetermined';

/**
 * Returns current permission status without prompting.
 * Derives 'granted' / 'denied' / 'undetermined' from `granted` + `canAskAgain`
 * because expo-notifications v57 no longer exposes a top-level `status` string.
 */
// expo-notifications v57 ships with PermissionResponse from `expo` which is
// not re-exported in this version, so the fields granted/canAskAgain/status
// are missing from the generated .d.ts.  We cast through unknown to unblock
// the build; the real fix is pinning to the SDK-54 expected version (~0.32).
type PermResult = { granted: boolean; canAskAgain: boolean };

function parsePermResult(raw: unknown): PermResult {
  const r = raw as Record<string, unknown>;
  return {
    granted:     Boolean(r['granted']),
    canAskAgain: r['canAskAgain'] !== false,
  };
}

export async function getNotificationPermissionStatus(): Promise<NotifPermStatus> {
  if (Platform.OS === 'web') return 'undetermined';
  try {
    const raw = await Notifications.getPermissionsAsync();
    const { granted, canAskAgain } = parsePermResult(raw);
    if (granted) return 'granted';
    if (!canAskAgain) return 'denied';
    return 'undetermined';
  } catch {
    return 'undetermined';
  }
}

/** Prompts for permission if not already granted. Returns true when granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const existing = parsePermResult(await Notifications.getPermissionsAsync());
    if (existing.granted) return true;
    const result = parsePermResult(await Notifications.requestPermissionsAsync());
    return result.granted;
  } catch {
    return false;
  }
}

// ── Android channel (required for Android 8+) ────────────────────────────────
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('uc-default', {
    name: 'Ultra-Clear',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200, 200, 200],
    lightColor: '#0054A6',
    showBadge: true,
  });
}

// ── Expo push token ───────────────────────────────────────────────────────────

/**
 * Returns the Expo push token, fetching and caching it if needed.
 * Returns null on web, or if permission is denied.
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const cached = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (cached) return cached;

    const granted = await requestNotificationPermission();
    if (!granted) return null;

    await ensureAndroidChannel();

    // projectId is required for standalone EAS builds; optional in Expo Go
    const { data } = await Notifications.getExpoPushTokenAsync();
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, data);
    return data;
  } catch {
    return null;
  }
}

// ── Filter replacement reminder ───────────────────────────────────────────────

/**
 * Fires a local notification if the filter is within 30 days of its due date
 * and that threshold bucket hasn't been alerted yet this cycle.
 *
 * Buckets: 'month' (≤30d), 'week' (≤7d), 'overdue' (≤0d).
 * Stored in AsyncStorage so they survive app restarts.
 */
export async function scheduleFilterReminder(daysLeft: number): Promise<void> {
  if (Platform.OS === 'web') return;
  if (daysLeft > 30) return;

  const bucket  = daysLeft <= 0 ? 'overdue' : daysLeft <= 7 ? 'week' : 'month';
  const key     = `${FILTER_ALERTED_PFX}${bucket}`;
  const already = await AsyncStorage.getItem(key);
  if (already) return;

  // Only fire if permission is already granted — don't implicitly prompt here
  const status = await getNotificationPermissionStatus();
  if (status !== 'granted') return;

  await AsyncStorage.setItem(key, Date.now().toString());

  const title =
    daysLeft <= 0 ? '⚠️ Filter overdue for replacement' :
    daysLeft <= 7 ? `Filter due in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` :
                    'Filter replacement reminder';

  const body =
    daysLeft <= 0
      ? 'Replace your Ultra-Clear filter now to keep your water safe.'
      : daysLeft <= 7
      ? 'Your filter needs replacing very soon — order before you run out.'
      : 'Your filter should be replaced within 30 days. Order replacements now.';

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { screen: 'products', category: 'Replacement Filters' },
    },
    trigger: null, // deliver immediately
  });
}

/**
 * Clears the alerted flags for a given filter cycle so reminders will fire
 * again after the user records a new filter change date.
 */
export async function clearFilterReminderFlags(): Promise<void> {
  await Promise.all(
    ['month', 'week', 'overdue'].map(b =>
      AsyncStorage.removeItem(`${FILTER_ALERTED_PFX}${b}`)
    )
  );
}
