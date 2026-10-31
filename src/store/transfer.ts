// Import/export of every user preset as one JSON file.
import { newId, type SessionPlan } from '../engine/plan';
import { userPresets, savePreset } from './presets';

export interface ExportFile { app: 'fight-timer'; version: 1; exportedAt: string; presets: SessionPlan[] }

export function exportPresets(): string {
  const file: ExportFile = { app: 'fight-timer', version: 1, exportedAt: new Date().toISOString(), presets: userPresets.value };
  return JSON.stringify(file, null, 2);
}

/** Returns how many presets were imported, or null when the file is not ours. */
export function importPresets(text: string): number | null {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return null; }
  const list = Array.isArray(parsed) ? parsed : (parsed as Partial<ExportFile>)?.app === 'fight-timer' ? (parsed as ExportFile).presets : null;
  if (!Array.isArray(list)) return null;
  const existing = new Set(userPresets.value.map((p) => p.id));
  let n = 0;
  for (const p of list) {
    if (!p || typeof p !== 'object' || (p as SessionPlan).version !== 1 || !Array.isArray((p as SessionPlan).blocks)) continue;
    const plan = { ...(p as SessionPlan), builtIn: false, id: existing.has((p as SessionPlan).id) ? newId() : (p as SessionPlan).id || newId() };
    savePreset(plan); n++;
  }
  return n;
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
