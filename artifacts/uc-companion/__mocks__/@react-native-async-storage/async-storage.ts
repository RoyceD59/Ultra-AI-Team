/**
 * @react-native-async-storage/async-storage stub for the Node.js test runner.
 *
 * The `_storage` map and `_reset()` are exported so tests can pre-seed data
 * and clear state between runs.
 */

export const _storage: Map<string, string> = new Map();

export function _reset(): void {
  _storage.clear();
}

const AsyncStorage = {
  getItem:    async (key: string): Promise<string | null>  => _storage.get(key) ?? null,
  setItem:    async (key: string, value: string): Promise<void> => { _storage.set(key, value); },
  removeItem: async (key: string): Promise<void>           => { _storage.delete(key); },
  clear:      async (): Promise<void>                      => { _storage.clear(); },
};

export default AsyncStorage;
