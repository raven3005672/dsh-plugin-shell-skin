# @deepseek-ai/dsh-plugin-shell-skin

An unofficial skin for the DeepSeek Harness Web UI: a startup flourish, a
wallpaper behind the panels, and one control surface for both.

Everything runs in the browser half. The plugin never touches Sessions, model
requests, tools, or the host filesystem.

## What it adds

| Feature | Behaviour |
|---|---|
| Startup splash | A full-screen flourish in `shell.overlay` that fades out after about 1.5s |
| Wallpaper | The artwork bundled with the package, or an image you pick in this browser |
| Panel opacity | How much wallpaper shows through the sidebar and panels, per palette |
| Boot colour | The colour painted behind the wallpaper, including the first frame |

## Settings

Open **Plugins**, select the bundle, and use the configure control on the
`shell-skin` row:

| Setting | Applies |
|---|---|
| Startup splash | Next page load |
| Light / dark opacity | Immediately while dragging, committed on release |
| Boot colour, light / dark | Immediately |
| Custom wallpaper | Immediately |
| Bundled wallpaper | Immediately |
| Image | Immediately after the file is stored |

Wallpaper precedence: a custom image when that switch is on and an image is
stored, otherwise the bundled artwork when that switch is on, otherwise no
image at all (the boot colour shows through).

## Where the uploaded image lives

The picked file is stored in this browser's IndexedDB and applied through a
Blob URL. It is never uploaded to the Host.

- Bound to the page origin: another port or another browser does not share it.
- Not synchronized across devices.
- Clearing it (`Remove image`) restores the bundled wallpaper or the bare boot
  colour.

## Limitations

- The splash switch is not live: it changes slot registration, so a reload is
  needed.
- On the Electron desktop app the sidebar keeps the platform's vibrancy mix, so
  the wallpaper reads more transparent there than in the browser.
- The settings page copy is localized through `ctx.locale`; the plugin card
  title and description come from `locale/<lang>.json`.

## Development

```sh
pnpm install
pnpm build           # lib/index.js + lib/client.js
pnpm typecheck
pnpm smoke           # load the built client bundle without a browser
pnpm dsh web --patch ../dsh-plugins/dev.patch.yml   # from the harness checkout
```
