# dsh-plugins

DeepSeek Harness plugins, one package per plugin.

| Package | What it does |
|---|---|
| [`packages/shell-skin`](packages/shell-skin) | Browser-only skin: startup flourish in `shell.overlay`; custom app background (in progress) |

## Requirements

- Node `^22.19.0 || >=24`
- pnpm 11 (`corepack pnpm ...` works)

## Build

```sh
pnpm install
pnpm build
```

Each package builds two faces: an ESM host entry (`lib/index.js`) and a browser
bundle (`lib/client.js`) wrapped in the `window.__ModuleLoader__.load` factory
registration the DSH web shell expects.

## Try a plugin from a source checkout

From the `deepseek-harness` checkout, with the plugin built:

```sh
pnpm dsh web --patch ../dsh-plugins/dev.patch.yml
```

The overlay mounts `packages/shell-skin/lib/index.js` by absolute path, so no
profile install is needed while iterating. Rebuild after editing client code and
restart the process: the overlay patch is read at boot.

## Structure

```
packages/<name>/
├── package.json        # dsh.client + dsh.bundle manifests
├── cordis.patch.yml    # the profile layer a bundle install activates
├── build.mjs           # esbuild: host ESM + client factory bundle
└── src/
    ├── index.ts        # host half (Loader seat, no host behavior)
    └── client/index.tsx  # browser half (slots, theme, UI)
```
