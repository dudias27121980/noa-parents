/** A fresh in-memory stand-in for the browser's localStorage; `failWrites` simulates a full storage */
export function memoryStorage(): Storage & { failWrites: boolean } {
  const m = new Map<string, string>();
  return {
    failWrites: false,
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem(k, v) {
      if (this.failWrites) throw new DOMException('full', 'QuotaExceededError');
      m.set(k, v);
    },
  };
}
