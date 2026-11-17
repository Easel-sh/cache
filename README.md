# easel-sh/cache

Persistent cache volumes for GitHub Actions jobs on [Easel](https://easel.sh) runners. A job keeps paths on its repository's volume (`~/.cargo/registry`, `~/.npm`, `target`, a toolchain), and the next job finds them already there: no download, no untar. Only the files a job reads are fetched.

```yaml
jobs:
  test:
    runs-on: easel-8cpu
    steps:
      - uses: actions/checkout@v5
      - uses: easel-sh/cache@v1
        with:
          key: rust
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            target
      - run: cargo test
```

## Inputs

| Input | | |
|---|---|---|
| `path` | required | Directories to keep, one per line. `~` is the home directory; relative paths are from the workspace. Globs aren't supported. |
| `key` | default `default` | The volume's name in this repository: letters, digits, `.`, `_` and `-`. Jobs with the same key share it. At most 4 keys per job. |

## How it works

- The step asks Easel for the repository's volume for `key`; Easel mounts it into the runner at `/easel/cache/{key}`, and the step bind-mounts each `path` from it. The first time, what a path already holds moves onto the volume.
- Each job works on its own copy of the volume. After the job, Easel keeps that copy as the volume only if the job was a successful push, schedule or manual run on the repository's default branch, from the repository itself. Pull requests, forks included, read the volume but never change it.
- The post step unmounts the paths and flushes the volume, so the job's writes are saved before the runner stops.
- A volume holds up to 50 GiB. A volume no job used for 7 days is deleted.
- On a runner that isn't Easel's, the step prints a warning and changes nothing, so a workflow still runs elsewhere.
