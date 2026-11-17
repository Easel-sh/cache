// easel-sh/cache, after the job: unmount the paths (children first) and,
// when the run's writes may be kept, flush the volume, so they're in the
// object store before the runner's sandbox stops (a VM that won't flush in
// time is stopped anyway). The job waits for that upload; runs whose writes
// are thrown away (pull requests, other branches) don't.
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
if (process.env.STATE_keep === "false") {
  console.log("cache volume not flushed: this run's writes aren't kept");
} else {
  const t = Date.now();
  execFileSync("sync");
  console.log(`cache volume flushed in ${Date.now() - t} ms`);
}
