// easel-sh/cache: ask Easel for this repository's volume for `key`, mounted
// into this runner, then bind-mount each path from it, so the job finds
// what the repository's last kept job left there.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { isKey, isWithin, planMounts } from "./mounts.mjs";

const sudo = (...args) => execFileSync("sudo", ["-n", ...args], { stdio: ["ignore", "inherit", "inherit"] });
const isEmptyDir = (dir) => fs.readdirSync(dir).length === 0;

/** The volume, mounted: its path. Retried while GitHub hasn't yet told Easel which job this runner runs. */
async function mountVolume(key) {
  const url = `${process.env.EASEL_CACHE_URL.replace(/\/+$/, "")}/api/cache/mount`;
  const body = JSON.stringify({
    token: process.env.EASEL_CACHE_TOKEN,
    key,
    repo: process.env.GITHUB_REPOSITORY ?? "",
    runId: process.env.GITHUB_RUN_ID ?? "",
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "1",
  });
  let last = "";
  for (let attempt = 0; attempt < 12; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2500));
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body, signal: AbortSignal.timeout(120_000) }).catch(
      (e) => ({ ok: false, status: 0, json: async () => ({ error: String(e) }) }),
    );
    const answer = await r.json().catch(() => ({}));
    if (r.ok) {
      console.log(`volume "${key}" at ${answer.path} in ${answer.ms} ms`);
      return answer.path;
    }
    last = `${r.status}: ${answer.error ?? "no answer"}`;
    // Only "not yet" (409) and outages are worth asking again.
    if (r.status !== 409 && r.status !== 0 && r.status < 500) break;
  }
  throw new Error(`Easel didn't mount the cache volume: ${last}`);
}

try {
  const key = process.env.INPUT_KEY || "default";
  if (!isKey(key)) throw new Error(`key ${JSON.stringify(key)}: letters, digits, '.', '_' and '-' only`);
  if (!process.env.EASEL_CACHE_TOKEN || !process.env.EASEL_CACHE_URL) {
    console.log("::warning::Not an Easel runner (runs-on: easel): no cache volume. The paths are left as they are.");
    process.exit(0);
  }
  const home = os.homedir();
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  // Planned first: a bad path fails before anything is mounted.
  const volume = `/easel/cache/${key}`;
  const plan = planMounts(process.env.INPUT_PATH ?? "", volume, { home, workspace });
  await mountVolume(key);
  const mounted = [];
  for (const { source, target } of plan) {
    const t = Date.now();
    if (!fs.existsSync(target)) {
      if (isWithin(target, home) || isWithin(target, workspace)) {
        // The job's own directories (and any missing parents, like `~/.cargo`
        // for `~/.cargo/registry`) are the job's user's, as the tools expect.
        fs.mkdirSync(target, { recursive: true });
      } else {
        // A system path (`/var/cache/apt/archives`): root's, as its parents are.
        sudo("mkdir", "-p", target);
      }
    }
    const fresh = !fs.existsSync(source) || isEmptyDir(source);
    if (fresh) {
      // First use: what the path holds now (the image's files, apt's
      // `partial/`) moves onto the volume with its owners, so nothing
      // disappears under the mount.
      sudo("mkdir", "-p", source);
      sudo("chown", "--reference", target, source);
      sudo("chmod", "--reference", target, source);
      if (!isEmptyDir(target)) sudo("cp", "-a", `${target}/.`, `${source}/`);
    }
    sudo("mount", "--bind", source, target);
    mounted.push(target);
    // After each mount, so the post step unmounts what got mounted even if a later path fails.
    fs.appendFileSync(process.env.GITHUB_STATE, `targets=${JSON.stringify(mounted)}\n`);
    console.log(`${target} ← ${source}${fresh ? " (new)" : ""} in ${Date.now() - t} ms`);
  }
} catch (error) {
  console.log(`::error::${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
