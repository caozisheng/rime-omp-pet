# rime-omp-pet

An ASCII pet widget for the Oh My Pi (OMP) prompt, driven by coding-agent state. A cat (or dog) sits above your editor and reacts to the agent's lifecycle — thinking, running a tool, waiting for your approval, celebrating a passed test, panicking on failure.

Cat/dog art derived from [dropdevrahul/campy](https://github.com/dropdevrahul/campy) (MIT, see `licenses/CAMPY-MIT.txt`).

## Summary

- **State-driven animation** — maps OMP lifecycle events (`turn_start`, `tool_execution_start/end`, `tool_approval_*`, …) to pet states: thinking, tool-running, waiting-user, error. Short-lived reactions (file-read, test-passed, turn-failed, …) overlay the current state.
- **Widget** — mounts above the editor in TUI mode and re-renders frames via `requestRender`.
- **Pack discovery** — built-in cat/dog packs plus JSON packs from `~/.omp/agent/pets/` and `<session cwd>/.omp/pets/`. Malformed packs are disabled with a warning, never fatal.
- **Options** — `packs` (in-process values), `packPaths` (explicit files/directories), `defaultPack` (initial pack id, default `cat`).

## Install

Requires [Bun](https://bun.sh) (Oh My Pi runs extensions with it).

```bash
# From this repository
git clone https://github.com/caozisheng/rime-omp-pet.git
```

Register the extension in `~/.omp/agent/config.yml` (user-level; a project-level
`.omp/agent/` or `.omp/extensions/` layout also works):

```yaml
extensions:
  - C:/path/to/rime-omp-pet/extension.ts
```

Optional per-project packs — drop JSON pack files into `.omp/pets/` in your project:

```
your-project/
  .omp/
    pets/
      marten.json
```

## Development

```bash
bun install   # if/when dependencies are added; currently dependency-free
bun test      # 21 tests / 441 assertions
```

Layout:

```
extension.ts        # OMP extension: event wiring, pack discovery, widget mount
src/pet/
  state.ts          # lifecycle/reaction -> animation resolution
  animator.ts       # frame sequencing
  renderer.ts       # frame -> padded text lines
  assets.ts         # built-in cat/dog packs
  validate.ts       # PetPack schema validation
  types.ts
test/               # unit + FakeHost extension tests (bun:test)
```

Pack JSON schema and design notes: `docs/rime-omp-pet-deisgn.md`. Asset provenance: `provenance.json`.

## License

MIT
