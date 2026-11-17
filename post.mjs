// easel-sh/cache, after the job: unmount the paths (children first), then
// the volume's own file system, cleanly, so the copy Easel keeps needs no
// journal replay or orphan cleanup when the next job mounts it (35 s on a
// big volume read cold). The job is over: processes it left holding the
// volume (a build daemon, a server) are stopped first, never the runner's
// own. When the run's writes may be kept, the volume is flushed too.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";

const sudo = (...args) => spawnSync("sudo", ["-n", ...args], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
// Not inside a bind mount ourselves (a step starts in the workspace).
process.chdir("/");

const targets = JSON.parse(process.env.STATE_targets || "[]");
for (const target of [...targets].reverse()) {
  if (sudo("umount", target).status !== 0) {
    // Something still holds it: the lazy unmount lets go of the path; the
    // volume's unmount below deals with the holder.
    sudo("umount", "--lazy", target);
  }
}

/** Processes with files open on `volume`, but this one and the runner's. */
function holders(volume) {
  const out = sudo("fuser", "-m", volume);
  const pids = `${out.stdout} ${out.stderr}`.match(/\d+/g) ?? [];
  return [...new Set(pids.map(Number))].filter((pid) => {
    if (pid === process.pid || pid === process.ppid) return false;
    let comm = "";
    try {
      comm = fs.readFileSync(`/proc/${pid}/comm`, "utf8").trim();
    } catch {}
    return !comm.startsWith("Runner.");
  });
}

const volume = process.env.STATE_volume;
if (volume) {
  let clean = sudo("umount", volume).status === 0;
  if (!clean) {
    const pids = holders(volume);
    if (pids.length > 0) {
      sudo("kill", "-TERM", ...pids.map(String));
      for (let i = 0; i < 20 && holders(volume).length > 0; i++) spawnSync("sleep", ["0.25"]);
      const left = holders(volume);
      if (left.length > 0) sudo("kill", "-KILL", ...left.map(String));
    }
    clean = sudo("umount", volume).status === 0;
  }
  console.log(clean ? "cache volume unmounted cleanly" : "::warning::the cache volume is still in use; it's kept as it is");
}

if (process.env.STATE_keep === "false") {
  console.log("cache volume not flushed: this run's writes aren't kept");
} else {
  const t = Date.now();
  execFileSync("sync");
  console.log(`cache volume flushed in ${Date.now() - t} ms`);
}
