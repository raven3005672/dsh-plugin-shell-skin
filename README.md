# dsh-plugins

DeepSeek Harness plugins, one package per plugin.

| Package | What it does |
|---|---|
| [`packages/shell-skin`](packages/shell-skin) | Browser-only skin: startup flourish, wallpaper (bundled or uploaded), panel opacity, first-paint colours |

## Requirements

- Node `^22.19.0 || >=24`
- pnpm 11 (a standalone `pnpm` on `PATH`; see the note under Commands)

## Commands

| Command | What it does |
|---|---|
| `pnpm install` | install workspace dependencies |
| `pnpm build` | build every package (`lib/index.js` + `lib/client.js`) |
| `pnpm typecheck` | type-check every package |
| `pnpm smoke` | load each built client bundle without a browser and assert its registrations |

> Run these with `pnpm`, not `corepack pnpm`: the scripts delegate to each
> package through `pnpm -r`, and a nested `pnpm` invoked under corepack is
> refused with a version-mismatch error.

## Trying a plugin against a source checkout

From the `deepseek-harness` checkout, with the plugin built:

```sh
pnpm dsh web --patch ../dsh-plugins/dev.patch.yml
```

`dev.patch.yml` mounts `packages/shell-skin/lib/index.js` by absolute path, so no
profile install is needed while iterating. The overlay is read at boot; rebuild
after editing and restart when the host half changed.

## Installing into a profile

```sh
cd ~/github/deepseek-harness
pnpm dsh plugin --profile <name> add ../dsh-plugins/packages/shell-skin
```

That installs the bundle into `~/.dsh/profiles/<name>` and applies its
`cordis.patch.yml`; the plugin then appears in the Plugins page.

## Repository layout

```
.
├── scripts/build-plugin.mjs   # the shared two-face build for every package
├── tsconfig.base.json         # editor/type-check baseline
├── dev.patch.yml              # local overlay that mounts the packages by path
└── packages/<name>/           # one plugin per directory
    ├── package.json           # dsh.client + dsh.bundle manifests, icon, locale
    ├── cordis.patch.yml       # the layer a profile install applies
    ├── build.mjs              # three lines: delegates to scripts/build-plugin.mjs
    ├── icon.svg               # plugin-card artwork
    ├── locale/<lang>.json     # localized card title and description
    ├── assets/                # artwork inlined into the client bundle
    ├── scripts/smoke.mjs      # load-time contract test
    └── src/
        ├── index.ts           # host half (Loader seat / config / injections)
        └── client/            # browser half (slots, theme, settings page)
```

## Status

The plugins are not published yet: no npm release and no market index. The
distribution plan is a Git-source market index first, npm later if needed.
