# rime-omp-pet

<img width="163" height="104" alt="image" src="https://github.com/user-attachments/assets/5d486141-6270-4657-914a-3232208953a9" />

An ASCII pet widget for the Oh My Pi (OMP) prompt, driven by coding-agent state. A cat (or dog) sits above your editor and reacts to the agent's lifecycle — thinking, running a tool, waiting for your approval, celebrating a passed test, panicking on failure. A config-file parrot pack shows off large-scale motion: whole-sprite travel across a 24-column canvas.

Cat/dog art derived from [dropdevrahul/campy](https://github.com/dropdevrahul/campy) (MIT, see `licenses/CAMPY-MIT.txt`). Parrot artwork is original to this repo (an homage to [ascii.live](https://ascii.live) style, not a copy of its GPL frames).


## Summary

- **State-driven animation** — maps OMP lifecycle events (`turn_start`, `tool_execution_start/end`, `tool_approval_*`, …) to pet states: thinking, tool-running, waiting-user, error. Short-lived reactions (file-read, test-passed, turn-failed, …) overlay the current state.
- **Widget** — mounts to the editor's right in TUI mode and re-renders frames via `requestRender`; artwork is left-aligned within that widget by default.
- **Pack discovery** — the repo's own `packs/` directory is enumerated at runtime: clone, drop a new `<animal>.json` in `packs/`, restart OMP, and `/pet <animal>` works. The same JSON format also loads from `~/.omp/agent/pets/` and `<session cwd>/.omp/pets/` (user/project packs override same-id bundled ones). Malformed packs are disabled with a warning, never fatal.
- **Options** — `packs` (in-process values), `packPaths` (explicit files/directories), `defaultPack` (initial pack id, default `cat`). `/pet <unknown>` lists available ids; `/pet status` shows the pack list.

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


Add your own animal — either drop a JSON pack into the cloned repo's `packs/`
(restart OMP, then `/pet <id>`), or keep it out of the repo in a project dir:

```bash
cp packs/parrot.json your-project/.omp/pets/parrot.json
```

Alignment — the widget uses `rightEditor`, and the pet artwork is left-aligned
inside it by default. To right-align the artwork, add a `pet.json` beside your
packs (project-level `.omp/pet.json` overrides the user-level
`~/.omp/agent/pet.json`):

```json
{ "align": "right" }
```

## Development

```bash
bun install   # if/when dependencies are added; currently dependency-free
bun test      # 30 tests / 694 assertions
```

Layout:

```
extension.ts        # OMP extension: event wiring, pack discovery, widget mount
src/pet/
  state.ts          # lifecycle/reaction -> animation resolution
  renderer.ts       # frame -> padded text lines
  validate.ts       # PetPack schema validation
  types.ts
packs/              # all pets live here as PetPack JSON — built-ins included
  cat.json          # built-in cat (art derived from campy, MIT)
  dog.json          # built-in dog (art derived from campy, MIT)
  parrot.json       # large-scale motion showcase (original art)
scripts/
  build-parrot.ts   # sprite composer that generates packs/parrot.json
test/               # unit + FakeHost extension tests (bun:test)
```

Pack JSON schema and design notes: `docs/rime-omp-pet-deisgn.md`. Asset provenance: `provenance.json`.

## License

MIT
