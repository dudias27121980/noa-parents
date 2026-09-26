import { Dispatch, SetStateAction, useEffect, useState } from 'react';

/**
 * Browser persistence (localStorage). Each key holds { v, data }; bump SCHEMA_VERSION when a stored
 * shape changes so old saves are ignored instead of crashing the app.
 * Every storage access is guarded: private mode, blocked storage or a full quota fall back to the
 * in-memory state and report through onSaveError.
 */
const PREFIX = 'tactical-ops:';
const SCHEMA_VERSION = 1;

export const STORAGE_KEYS = [
  'screen',
  'alertLevel',
  'audio',
  'milestones',
  'incidents',
  'units',
  'logs',
  'frequency',
  'shift',
  'agencies',
] as const;
export type StorageKey = (typeof STORAGE_KEYS)[number];

const fullKey = (key: StorageKey) => PREFIX + key;

/** Upgrades data saved by an older build (e.g. fills in fields added since) before it is validated */
export type Migrate = (data: unknown) => unknown;

export function loadStored<T>(key: StorageKey, isValid: (v: unknown) => v is T, migrate?: Migrate): T | undefined {
  try {
    const raw = localStorage.getItem(fullKey(key));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { v?: number; data?: unknown };
    if (parsed?.v !== SCHEMA_VERSION) return undefined;
    const data = migrate ? migrate(parsed.data) : parsed.data;
    return isValid(data) ? data : undefined;
  } catch {
    return undefined;
  }
}

const serialize = (data: unknown) => JSON.stringify({ v: SCHEMA_VERSION, data });

export function clearStored() {
  try {
    STORAGE_KEYS.forEach((k) => localStorage.removeItem(fullKey(k)));
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

/**
 * useState that is restored from and saved to localStorage, and kept in sync across open tabs.
 */
export function usePersistentState<T>(
  key: StorageKey,
  initial: () => T,
  isValid: (v: unknown) => v is T,
  onSaveError?: () => void,
  migrate?: Migrate
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => loadStored(key, isValid, migrate) ?? initial());

  useEffect(() => {
    const serialized = serialize(value);
    try {
      // Skipping identical writes also stops two tabs from echoing each other's updates forever
      if (localStorage.getItem(fullKey(key)) !== serialized) localStorage.setItem(fullKey(key), serialized);
    } catch {
      onSaveError?.();
    }
    // onSaveError is a notification callback; re-running the save when it changes is pointless
  }, [key, value]);

  // Another tab changed (or cleared) this key
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== localStorage) return;
      if (e.key !== null && e.key !== fullKey(key)) return;
      setValue(loadStored(key, isValid, migrate) ?? initial());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  return [value, setValue];
}

/* ---------- Validators (shallow: shape + key fields, enough to reject foreign/corrupt data) ---------- */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export const arrayOf =
  <T>(fields: Record<string, 'string' | 'number' | 'array'>) =>
  (v: unknown): v is T[] =>
    Array.isArray(v) &&
    v.every(
      (item) =>
        isObj(item) &&
        Object.entries(fields).every(([f, t]) => (t === 'array' ? Array.isArray(item[f]) : typeof item[f] === t))
    );

export const oneOf =
  <T extends string>(values: readonly T[]) =>
  (v: unknown): v is T =>
    typeof v === 'string' && (values as readonly string[]).includes(v);

/** Migration helper: give every item in a saved array a default for a field it lacks */
export const withDefault =
  (field: string, value: () => unknown): Migrate =>
  (data) =>
    Array.isArray(data)
      ? data.map((item) => (isObj(item) && !(field in item) ? { ...item, [field]: value() } : item))
      : data;

export const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean';

/** Next free numeric id for a prefix, e.g. nextIdNumber(['INC-7241'], 7300) -> 7300; with 'INC-7400' -> 7401 */
export const nextIdNumber = (ids: string[], floor: number) =>
  ids.reduce((max, id) => {
    const n = Number(/(\d+)$/.exec(id)?.[1]);
    return Number.isFinite(n) && n >= max ? n + 1 : max;
  }, floor);
