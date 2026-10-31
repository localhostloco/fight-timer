// User-uploaded sound files, one per sound id, kept in IndexedDB (binary
// blobs do not belong in localStorage). The audio engine decodes them on
// unlock and they override both synthesized and shipped samples.
import { signal } from '@preact/signals';
import type { Sound } from '../engine/plan';

const DB = 'fight-timer', STORE = 'sounds', VERSION = 1;
export const MAX_BYTES = 1_000_000;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no-idb')); return; }
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export interface CustomSound { name: string; type: string; data: ArrayBuffer }

/** Ids that currently have a custom file, for the settings screen. */
export const customIds = signal<Sound[]>([]);

export async function listCustom(): Promise<Sound[]> {
  try { const keys = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys()); customIds.value = keys as Sound[]; return customIds.value; }
  catch { return []; }
}

export async function getCustom(id: Sound): Promise<CustomSound | undefined> {
  try { return await tx<CustomSound | undefined>('readonly', (s) => s.get(id)); } catch { return undefined; }
}

export async function putCustom(id: Sound, file: File): Promise<void> {
  if (file.size > MAX_BYTES) throw new Error('too-big');
  const data = await file.arrayBuffer();
  await tx('readwrite', (s) => s.put({ name: file.name, type: file.type, data } satisfies CustomSound, id));
  await listCustom();
}

export async function removeCustom(id: Sound): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
  await listCustom();
}
