// easel-sh/cache, after the job: unmount the paths (children first) and
// flush the volume, so its writes are in the object store before the
// runner's sandbox stops (a VM that won't flush in time is stopped anyway).
// The job waits for that upload.
import { execFileSync } from "node:child_process";

const targets = JSON.parse(process.env.STATE_targets || "[]");
for (const target of [...targets].reverse()) {
  try {
    execFileSync("sudo", ["-n", "umount", target], { stdio: "inherit" });
  } catch {
    // Something still holds it (a leftover process): the lazy unmount lets
    // the job end; the sync below still flushes its writes.
    try {
      execFileSync("sudo", ["-n", "umount", "--lazy", target], { stdio: "inherit" });
    } catch {}
  }
}
const t = Date.now();
execFileSync("sync");
console.log(`cache volume flushed in ${Date.now() - t} ms`);
