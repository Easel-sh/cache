// Planning for the easel-sh/cache action (docs/platform/runners.md, "Cache
// volumes"): which directory on the key's volume goes over which path.
// Kept free of side effects so it can be tested anywhere.
import path from "node:path";

/** Where Easel mounts a job's volumes: `/easel/cache/{key}`. */
export const VOLUME_ROOT = "/easel/cache";

/** A key: letters, digits, '.', '_' and '-', starting with a letter or digit, at most 64. */
export const isKey = (key) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(key);

/** Whether `p` is `dir` or inside it. */
export function isWithin(p, dir) {
  const d = dir.replace(/\/+$/, "");
  return p === d || p.startsWith(`${d}/`);
}

/**
 * `{ source, target }` per path: `target` is the path as a step's shell
 * means it (`~` is `home`, relative paths are from `workspace`); `source`
 * is its place on the key's volume (mounted at `volume`), `{volume}{target}`.
 * Parents come before their children, so both bind mounts land.
 */
export function planMounts(paths, volume, { home, workspace }) {
  const targets = new Set();
  for (const raw of paths.split("\n")) {
    const p = raw.trim();
    if (!p || p.startsWith("#")) continue;
    if (/[*?[]/.test(p)) throw new Error(`${p}: globs aren't supported; name the directory`);
    const expanded = p === "~" ? home : p.startsWith("~/") ? path.join(home, p.slice(2)) : p;
    const target = path.resolve(workspace, expanded);
    if (target === "/") throw new Error(`${p}: not the root directory`);
    if (isWithin(target, VOLUME_ROOT) || isWithin(VOLUME_ROOT, target)) throw new Error(`${p}: overlaps the volumes themselves (${VOLUME_ROOT})`);
    targets.add(target);
  }
  if (targets.size === 0) throw new Error("path: name at least one directory");
  return [...targets]
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))
    .map((target) => ({ source: path.join(volume, target), target }));
}
