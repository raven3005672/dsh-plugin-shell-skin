# dsh-plugin-shell-skin

An unofficial skin for the DeepSeek Harness Web UI: a startup flourish, a
wallpaper behind the panels, and one settings surface for both.

Everything runs in the browser half. The plugin never touches Sessions, model
requests, tools, or the host filesystem.

## What it adds

| Feature | Behaviour |
|---|---|
| Startup splash | A full-screen flourish in `shell.overlay` that fades out after about 1.5s |
| Wallpaper | The artwork bundled with the package, or an image you pick in this browser |
| Panel opacity | How much wallpaper shows through the sidebar and panels, per palette |
| Boot colour | The colour painted behind the wallpaper, including the first frame |

## Install

```sh
dsh plugin --profile web add dsh-plugin-shell-skin
```

In the desktop app, type `dsh-plugin-shell-skin` into the install field on the
Plugins page. Restart the app afterwards: a running process keeps the previously
loaded plugin tree in memory.

## Settings

Open **Plugins**, select the bundle, and use the configure control on the
`dsh-plugin-shell-skin` row:

| Setting | Applies |
|---|---|
| Startup splash | Next page load |
| Light / dark opacity | Immediately while dragging, committed on release |
| Boot colour, light / dark | Immediately |
| Custom wallpaper | Immediately |
| Bundled wallpaper | Immediately |
| Image | Immediately after the file is stored |

Wallpaper precedence: a custom image when that switch is on and an image is
stored, otherwise the bundled artwork when that switch is on, otherwise no image
at all (the boot colour shows through).

## Where the uploaded image lives

The picked file is stored in this browser's IndexedDB and applied through a Blob
URL. It is never uploaded to the Host.

- Bound to the page origin: another port or another browser does not share it.
- Not synchronized across devices.
- `Remove image` clears it and restores the bundled wallpaper or the bare boot
  colour.

## Limitations

- The splash switch is not live: it changes slot registration, so a reload is
  needed.
- On the Electron desktop app the sidebar keeps the platform's vibrancy mix, so
  the wallpaper reads more transparent there than in the browser.
- The settings page copy follows `ctx.locale`; the plugin card title and
  description come from `locale/<lang>.json`.

## Development

```sh
pnpm install
pnpm build           # lib/index.js + lib/client.js
pnpm typecheck
pnpm smoke           # load the built client bundle without a browser
```

Mount the checkout into a running Harness from the `deepseek-harness` directory:

```sh
pnpm dsh web --patch ../dsh-plugin-shell-skin/dev.patch.yml
```

The overlay mounts `lib/index.js` by absolute path, so no profile install is
needed while iterating. Rebuild after edits; restart when the host half or the
overlay changed.

## Repository layout

```
.
├── package.json        # dsh.bundle + dsh.client manifests, icon, locale wiring
├── cordis.patch.yml    # the profile layer an install applies
├── dev.patch.yml       # local overlay mounting this checkout by path
├── tsconfig.json
├── scripts/
│   ├── build.mjs       # two-face build: host ESM + browser factory bundle
│   └── smoke.mjs       # load-time contract test, no browser needed
├── assets/             # artwork inlined into the client bundle
├── locale/<lang>.json  # localized card title and description
├── icon.svg
└── src/
    ├── index.ts        # host half: volatile config, boot injection
    └── client/         # browser half: splash, theme layer, settings page
```

## Status

Not published yet: no npm release and no market index. The planned first
distribution is a Git-source market index.
