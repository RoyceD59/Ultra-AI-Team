/**
 * Notification utilities for the Ultra-Clear Companion.
 *
 * Responsibilities:
 *   1. Notification permission + Expo push-token retrieval
 *   2. Scheduling the full 5-notification filter lifecycle sequence
 *   3. Filter activation state management (stored in AsyncStorage)
 *   4. Foreground notification handler
 *
 * All scheduling functions are no-ops on web.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Foreground handler ───────────────────────────────────────────────────────
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
const PUSH_TOKEN_KEY       = 'uc_push_token';
const FILTER_ACTIVATION_KEY = 'uc_filter_activation';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface FilterActivation {
  activatedAt:  string;   // ISO date — when the filter was installed / activated
  productId:    number;
  productName:  string;
  lifespanDays: number;   // total rated lifespan for this product
  notifIds:     string[]; // IDs of all scheduled local notifications for this cycle
}

// ── Products with rated lifespans ────────────────────────────────────────────
// Matches the server MOCK_PRODUCTS; kept here so the client can work offline.
export const FILTER_PRODUCTS: Array<{
  id: number; name: string; lifespanDays: number; icon: string;
}> = [
  { id: 101, name: 'UCF-500 Reverse Osmosis System',   lifespanDays: 365, icon: 'water'          },
  { id: 102, name: 'UCF-200 Ultrafiltration System',   lifespanDays: 540, icon: 'layers-outline'  },
  { id: 103, name: 'UCF-UV100 UV Purifier',            lifespanDays: 365, icon: 'flash-outline'   },
  { id: 104, name: 'UCF-WH1000 Whole-House System',    lifespanDays: 365, icon: 'home-outline'    },
  { id: 105, name: 'UCF-500 Replacement Filter Set',   lifespanDays: 365, icon: 'refresh-outline' },
  { id: 106, name: 'UCF-200 Replacement Membrane',     lifespanDays: 548, icon: 'filter-outline'  },
  { id: 107, name: 'Sediment Filter 10"',              lifespanDays:  90, icon: 'funnel-outline'  },
  { id: 108, name: 'Carbon Block Filter 10"',          lifespanDays: 180, icon: 'leaf-outline'    },
];

// ── Permission helpers ────────────────────────────────────────────────────────
export type NotifPermStatus = 'granted' | 'denied' | 'undetermined';

// expo-notifications v57 types don't re-export PermissionResponse fields;
// we access them via a runtime cast.
type PermResult = { granted: boolean; canAskAgain: boolean };
function parsePermResult(raw: unknown): PermResult {
  const r = raw as Record<string, unknown>;
  return { granted: Boolean(r['granted']), canAskAgain: r['canAskAgain'] !== false };
}

export async function getNotificationPermissionStatus(): Promise<NotifPermStatus> {
  if (Platform.OS === 'web') return 'undetermined';
  try {
    const { granted, canAskAgain } = parsePermResult(await Notifications.getPermissionsAsync());
    if (granted) return 'granted';
    if (!canAskAgain) return 'denied';
    return 'undetermined';
  } catch { return 'undetermined'; }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if (parsePermResult(await Notifications.getPermissionsAsync()).granted) return true;
    return parsePermResult(await Notifications.requestPermissionsAsync()).granted;
  } catch { return false; }
}

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

export async function getExpoPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const cached = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
    if (cached) return cached;
    const granted = await requestNotificationPermission();
    if (!granted) return null;
    await ensureAndroidChannel();
    const { data } = await Notifications.getExpoPushTokenAsync();
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, data);
    return data;
  } catch { return null; }
}

// ── Filter activation state ───────────────────────────────────────────────────

export async function getFilterActivation(): Promise<FilterActivation | null> {
  try {
    const s = await AsyncStorage.getItem(FILTER_ACTIVATION_KEY);
    if (!s) return null;
    return JSON.parse(s) as FilterActivation;
  } catch { return null; }
}

// ── Filter lifecycle notifications ───────────────────────────────────────────
//
// 5 notifications per filter cycle:
//   1. Day  0 (+2 h)         — Activate your filter
//   2. Day 30               — 30-day performance check
//   3. Day 60               — 60-day performance + water quality advisory
//   4. lifespan−30 days      — Replacement offer: 10% / 15% discount
//   5. lifespan−15 days      — Urgent offer: 10% off for 48 h
//
// Notifications whose target date has already passed are silently skipped.

/**
 * Schedules all 5 filter lifecycle notifications and persists the activation.
 * Cancels any previously scheduled cycle first.
 */
export async function scheduleAllFilterNotifications(
  params: Omit<FilterActivation, 'notifIds'>
): Promise<FilterActivation> {
  if (Platform.OS === 'web') {
    const activation: FilterActivation = { ...params, notifIds: [] };
    await AsyncStorage.setItem(FILTER_ACTIVATION_KEY, JSON.stringify(activation));
    await AsyncStorage.setItem('uc_filter_last_changed', new Date(params.activatedAt).getTime().toString());
    return activation;
  }

  await cancelAllFilterNotifications();

  const status = await getNotificationPermissionStatus();
  if (status !== 'granted') {
    const activation: FilterActivation = { ...params, notifIds: [] };
    await AsyncStorage.setItem(FILTER_ACTIVATION_KEY, JSON.stringify(activation));
    await AsyncStorage.setItem('uc_filter_last_changed', new Date(params.activatedAt).getTime().toString());
    return activation;
  }

  await ensureAndroidChannel();

  const { productName, lifespanDays } = params;
  const activationDate = new Date(params.activatedAt);
  const now             = Date.now();
  const ids: string[]   = [];

  /** Schedule a notification at `targetDate`; returns the ID or null if already past. */
  async function scheduleAt(
    targetDate: Date,
    content: { title: string; body: string; data?: Record<string, unknown> }
  ): Promise<void> {
    const secondsFromNow = Math.floor((targetDate.getTime() - now) / 1000);
    if (secondsFromNow < 30) return; // already past or imminent — skip
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: { ...content, sound: false },
        trigger: { seconds: secondsFromNow } as unknown as null,
      });
      ids.push(id);
    } catch { /* non-critical — silently ignore scheduling failures */ }
  }

  // ── 1. Activation reminder (+2 hours if activated today or yesterday)
  const daysSinceActivation = (now - activationDate.getTime()) / 86_400_000;
  if (daysSinceActivation < 2) {
    await scheduleAt(
      new Date(activationDate.getTime() + 2 * 3_600_000),
      {
        title: `🔧 Activate your ${productName}`,
        body:  `Follow the installation guide to get your filter running. Clean, purified water in minutes! Tap for step-by-step help.`,
        data:  { screen: 'support', type: 'activation' },
      }
    );
  }

  // ── 2. Day-30 performance check
  if (lifespanDays > 45) {
    await scheduleAt(
      new Date(activationDate.getTime() + 30 * 86_400_000),
      {
        title: `💧 30-day filter check-in`,
        body:  `Your ${productName} has been running for 30 days — ${lifespanDays - 30} days remaining. How's the water taste and flow?`,
        data:  { screen: 'support', type: 'performance_check', daysLeft: lifespanDays - 30 },
      }
    );
  }

  // ── 3. Day-60 performance + Nairobi water quality advisory
  if (lifespanDays > 75) {
    const daysLeft60 = lifespanDays - 60;
    await scheduleAt(
      new Date(activationDate.getTime() + 60 * 86_400_000),
      {
        title: `⚠️ Filter performance check`,
        body:  `Your filter is at 60 days (${daysLeft60} days left). Nairobi's water can be harsh on filters — slow flow or unusual taste? Try a flush, or let our AI assistant guide you.`,
        data:  { screen: 'support', type: 'performance_ai', daysLeft: daysLeft60 },
      }
    );
  }

  // ── 4. 30 days before replacement — discount offer
  const offset4 = Math.max(Math.min(lifespanDays - 30, lifespanDays - 1), Math.ceil(daysSinceActivation) + 1);
  await scheduleAt(
    new Date(activationDate.getTime() + offset4 * 86_400_000),
    {
      title: `📅 Time to order your replacement filter`,
      body:  `Your ${productName} needs replacing in ~30 days. Order now and save: 10% off 1 filter (REPLACE10) or 15% off 2 (REPLACE15). Delivery takes 1–2 days.`,
      data:  { screen: 'products', type: 'discount_30', code1: 'REPLACE10', code2: 'REPLACE15' },
    }
  );

  // ── 5. 15 days before replacement — urgent 48-hour offer
  const offset5 = Math.max(offset4 + 1, lifespanDays - 15);
  await scheduleAt(
    new Date(activationDate.getTime() + offset5 * 86_400_000),
    {
      title: `🚨 Filter expires in ~15 days — 10% off`,
      body:  `Order your ${productName} replacement today with code FRESH48 for 10% off (valid 48 hrs). Clean water protects your family and your appliances. Don't risk it!`,
      data:  { screen: 'products', type: 'discount_15', code: 'FRESH48' },
    }
  );

  const activation: FilterActivation = { ...params, notifIds: ids };
  await AsyncStorage.setItem(FILTER_ACTIVATION_KEY, JSON.stringify(activation));
  // Keep the legacy key in sync so the home screen filter card still works
  await AsyncStorage.setItem('uc_filter_last_changed', activationDate.getTime().toString());
  return activation;
}

/** Cancel all scheduled notifications for the current filter cycle. */
export async function cancelAllFilterNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const s = await AsyncStorage.getItem(FILTER_ACTIVATION_KEY);
    if (!s) return;
    const a: FilterActivation = JSON.parse(s);
    await Promise.all((a.notifIds ?? []).map(id =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => {})
    ));
  } catch {}
}

/** Remove the filter activation record (call when user resets / unregisters filter). */
export async function clearFilterActivation(): Promise<void> {
  await cancelAllFilterNotifications();
  await AsyncStorage.removeItem(FILTER_ACTIVATION_KEY);
  await AsyncStorage.removeItem('uc_filter_last_changed');
}
