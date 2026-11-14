// Barèmes modifiables par l'administrateur, sans code.
// PROVISOIRE : enregistrés dans ce navigateur uniquement, en attendant une base de données.
import { useSyncExternalStore } from "react";
import { defaultP2PConfig, type P2PConfig } from "./p2p";
import { defaultProConfig, type ProConfig } from "./pro";
import { defaultVehicleConfig, type VehicleConfig } from "./vehicle";

export type Baremes = { version: 1; p2p: P2PConfig; pro: ProConfig; vehicle: VehicleConfig };
export const defaultBaremes: Baremes = { version: 1, p2p: defaultP2PConfig, pro: defaultProConfig, vehicle: defaultVehicleConfig };

const KEY = "mqr-baremes-v1";
const listeners = new Set<() => void>();
let cache: Baremes | null = null;

function read(): Baremes {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Baremes) : defaultBaremes;
  } catch {
    cache = defaultBaremes;
  }
  return cache;
}

export function saveBaremes(b: Baremes) {
  cache = b;
  localStorage.setItem(KEY, JSON.stringify(b));
  listeners.forEach((l) => l());
}
export function resetBaremes() {
  localStorage.removeItem(KEY);
  cache = defaultBaremes;
  listeners.forEach((l) => l());
}

export function useBaremes(): Baremes {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    read,
    () => defaultBaremes,
  );
}
