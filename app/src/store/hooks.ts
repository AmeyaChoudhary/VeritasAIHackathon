import { getStore, useSnapshot, type Role } from "./store";

let role: Role = "demo";

/** Called once in main.tsx, before the first render. */
export function initRole(r: Role) {
  role = r;
  getStore(r);
}

export const useSnap = () => useSnapshot(role);
export const useStore = () => getStore(role);
