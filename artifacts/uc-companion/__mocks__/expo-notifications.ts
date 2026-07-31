/**
 * expo-notifications stub for the Node.js test runner.
 *
 * Exported `_*` helpers let the test file inspect state and reset between tests.
 */

export const _scheduled: string[] = [];
export const _cancelled: string[] = [];
let _counter = 0;

export function _reset(): void {
  _scheduled.length = 0;
  _cancelled.length = 0;
  _counter = 0;
}

// ── Stubs used by useNotifications.ts ────────────────────────────────────────

export function setNotificationHandler(_handler: unknown): void { /* no-op */ }

export async function getPermissionsAsync() {
  return { granted: true, canAskAgain: true };
}

export async function requestPermissionsAsync() {
  return { granted: true, canAskAgain: true };
}

export async function setNotificationChannelAsync(
  _channelId: string,
  _channel: unknown,
): Promise<void> { /* no-op */ }

export async function scheduleNotificationAsync(
  _request: unknown,
): Promise<string> {
  const id = `notif-${++_counter}`;
  _scheduled.push(id);
  return id;
}

export async function cancelScheduledNotificationAsync(id: string): Promise<void> {
  _cancelled.push(id);
}

export const AndroidImportance = { DEFAULT: 3 } as const;
