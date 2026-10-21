# DSH 插件开发 Playbook

从 `dsh-plugin-shell-skin` 的实际代码反向整理：**结论 + 做法 + 踩过的坑**。
教程在 DSH 仓库的 `docs/user/develop/`，这里只记“写插件时真正会用到、会踩到的东西”。

读完这一篇，应该能从一个空仓库写到一个能发 npm、能在桌面端正常工作的插件。

---

## 0. 先分清两半

DSH 插件是一个 Cordis 插件，可选地再带一个**浏览器半边**：

| 半边 | 入口 | 运行在 | 能做什么 |
|---|---|---|---|
| host | `src/index.ts` → `lib/index.js` | Node（DSH 主进程） | 配置、读文件、注册 HTTP 路由、注入启动 HTML |
| client | `src/client/index.tsx` → `lib/client.js` | 浏览器（Web / Electron renderer） | DOM、插槽、主题、设置页 UI |

两半通过 **row 配置**（host → client 注入的全局变量）和 **HTTP 路由**（client → host）通信。

**判断放哪半边**：碰 DOM / React / 样式 → client；碰文件、网络、进程、凭据 → host。
只有 client 的插件最安全，也最容易写。

---

## 1. 仓库形态

单插件单仓库，仓库根就是包根：

```
.
├── package.json
├── cordis.patch.yml      # 装进 profile 时应用的层
├── dev.patch.yml         # 本地调试用的 overlay（按绝对路径挂载）
├── tsconfig.json
├── scripts/{build.mjs, smoke.mjs}
├── src/{index.ts, client/index.tsx}
├── locale/{en,zh}.json   # 插件卡片文案
├── icon.svg
└── assets/               # 会被内联进 client bundle 的资源
```

---

## 2. 最小 manifest

```jsonc
{
  "name": "dsh-plugin-xxx",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./package.json": "./package.json",
    "./locale/*.json": "./locale/*.json"
  },
  "files": ["lib", "cordis.patch.yml", "locale", "icon.svg"],
  "icon": "icon.svg",
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web" },
    "compatibility": { "dshReleases": { "0.2.1-rc.2": "compatible" } }
  },
  "engines": { "node": "^22.19.0 || >=24.0.0", "dsh": ">=0.2.0 <0.3.0" }
}
```

要点：

- `dsh.bundle` 声明它是 bundle，`dsh.client` 声明浏览器半边；
- `exports["./locale/*.json"]` 是**必须的**，否则插件管理器读不到卡片文案；
- `icon` 是相对路径，读的时候不执行代码，上限 256 KiB；
- `engines.dsh` 必填，市场按它判断兼容性。

---

## 3. patch 与 row id

`cordis.patch.yml`：

```yaml
- insert:
    - id: dsh-plugin-xxx      # 必须等于包名
      name: dsh-plugin-xxx
```

- **row id 用包名**：社区商城按 entry id 与包名比对；裸名容易和别的插件冲突；
- row id 同时是**设置命名空间**和配置页 key 的前缀（`包名#行id`），改它等于迁移配置；
- 行内不要写行尾注释——部分商城的预检用正则抓这一行。

`dev.patch.yml`（只用于本地）：

```yaml
- insert:
    - id: dsh-plugin-xxx
      name: /绝对路径/lib/index.js
```

---

## 4. 构建：一个产物两种格式

`scripts/build.mjs` 做两件事：

1. host：ESM，`platform: node`，`@deepseek-ai/schemastery` 等由宿主提供 → external；
2. client：**CJS**，再用 `window.__ModuleLoader__.load({ id, factory })` 包起来。

```js
await build({ entryPoints: ['src/index.ts'], outfile: 'lib/index.js', format: 'esm', platform: 'node', ... })

await build({ entryPoints: ['src/client/index.tsx'], outfile: 'lib/client.body.cjs', format: 'cjs', platform: 'browser', jsx: 'automatic', ... })

const body = await readFile(bodyFile, 'utf8')
await writeFile('lib/client.js', `window.__ModuleLoader__.load({
  id: ${JSON.stringify(pkg.name)},
  factory: (require) => { const module = { exports: {} }; (function (module, exports, require) { ${body} })(module, module.exports, require); return module.exports },
})`)
```

**必须 external 的模块**（浏览器里由 shell 的平台模块表提供，打进去会破坏 React 身份）：

```
react, react/jsx-runtime, react-dom, react-dom/client, @deepseek-ai/dsh-client-ui-primitives
```

图片资源用 `dataurl` loader 内联，省掉运行时请求。

---

## 5. client 半边的最小骨架

```ts
export const name = 'xxx'
export const inject = ['slots']        // 用到主题/locale 就加上 'theme'、'locale'

export function apply(ctx: Context): void {
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    { name: 'shell.overlay', id: 'xxx.overlay' },
    Overlay,
  ))
}
```

要点：

- `slots.inject(name, setup)` 等插槽声明后再注册，避免加载顺序问题；
- 注册返回 disposer，`ctx.effect` 里注册可自动清理；
- 组件里不要直接 import React 平台模块以外的东西。

### 常用插槽

| 插槽 | 用途 | 选项 |
|---|---|---|
| `shell.overlay` | 全屏层（启动动画、遮罩） | `id` |
| `plugins.row.config` | 插件页里点插件行打开的配置页 | `key: 包名#行id`，可选 `locale`、`inject` |
| `settings.general.item` | 设置页「通用」里的一行 | `id`、`order` |
| `settings.section` | 设置左侧新增一整页 | `id`、`order`、`label`、`locale`、`inject` |

`plugins.row.config` 的 owner props 会递给你 `form`；`settings.section` 不会——需要自己取：

```ts
ctx.slots.register({ name: 'settings.section', id: 'xxx', label: () => t('nav'),
  locale: NS, inject: () => ({ form: ctx.configForms.get(NS) }) }, Section)
```

并且 **client 的 `inject` 要加 `'configForms'`**，否则运行时报
`cannot get property "configForms" without inject`。

---

## 6. 设置页：volatile Config + configForms

host 侧：

```ts
export const Config = z.object({
  opacity: z.number().min(0).max(1).default(0.85).volatile(),
})
```

- `.volatile()` 让字段走**可写配置**而不是只读快照；
- 所有字段都要有默认值，否则 profile 里缺键时读不到；
- 配置变更不需要重启，client 通过 `configForms` 订阅。

client 侧：

```ts
const ns = 'dsh-plugin-xxx'           // = row id
const form = ctx.configForms.get(ns)
const value = form.getSnapshot().value
const unsubscribe = form.subscribe(sync)   // 先订阅再读，避免读和订阅之间丢变更
form.mutate([{ op: 'set', path: ['opacity'], value: 0.5 }], revision)
```

UI 写法上的两个经验：

- **滑块**：拖动时只 `preview` 本地重绘，`pointerup/keyup/blur` 时提交一次，否则每像素一次写回，界面会卡；
- **颜色输入**：`change` 触发非常密，加 350ms 防抖再提交。

---

## 7. 主题：覆盖 token，而不是改组件

```ts
ctx.theme.overrideTokens('xxx', {
  '--dsw-alias-bg-base': { light: 'rgba(255,255,255,0.85)', dark: 'rgba(12,14,20,0.55)' },
})
```

- token 定义在 `<body>` 上，覆盖用 inline CSS 变量，优先级最高；
- 返回 disposer，别忘记 `ctx.effect` 管理。

### CSS 优先级的坑（真实踩过）

1. **桌面端会重画侧栏**：

   ```css
   [data-platform="darwin"] .sidebarCol {
     background: linear-gradient(...), color-mix(in srgb, ... 40%, transparent);
   }
   ```

   它把宽度再乘一次，且带蓝色渐变。只改 token 在桌面端**看起来没反应**。
   要接管就写更高优先级的选择器：

   ```css
   html[data-platform='darwin']:root [class*='sidebarCol'] {
     background-color: var(--dsw-specific-sidebar-fill);
     background-image: none;
   }
   ```

   用 `[class*='sidebarCol']` 匹配哈希类名，不要写死 `_xxx_1a2b`。

2. **桌面端 html/body 被设成 transparent**：

   ```css
   html[data-platform=darwin], html[data-platform=darwin] body { background: transparent }
   ```

   这是 `background` 简写，会把 `background-image` 一起清掉。
   在 `html` 上画壁纸的插件必须用 `html[data-platform='darwin']:root` 重新声明。

3. **深色主题标记在 `<body>` 上**，选择器要写 `html:has(body[data-ds-dark-theme])`。

---

## 8. 启动注入：首帧不发白

host 监听 `webserver/index-inject`，往表里推样式和全局变量：

```ts
ctx.on('webserver/index-inject', (table) => {
  table.push({ kind: 'style', text: 'html body{background:#fff}' })
  table.push({ kind: 'global', name: '__XXX__', value: { opacity: 0.85 } })
})
```

- 样式在应用挂载前生效，client 再接管；
- global 是 client 读配置的初始值，client 启动后以 `configForms` 为准。

---

## 9. 浏览器存储：IndexedDB 的两个坑

```ts
const tx = db.transaction(store, 'readwrite')
const req = tx.objectStore(store).put(record, key)
req.onsuccess = () => { /* 请求成功 ≠ 事务提交 */ }
tx.oncomplete = () => { resolve() }            // 必须等这个
```

- **`request.onsuccess` 后立刻 `db.close()` 会把未提交的事务 abort**，写入静默丢失；
- Blob URL 只在当前 document 有效，刷新后要重新 `URL.createObjectURL`；
- 存储按 origin 隔离：Web 与桌面端、不同端口互不可见。

自定义文件选择器不要用原生 `<input type="file">` 的按钮文字——它由浏览器 locale 决定，无法本地化。隐藏 input，用自己的按钮触发 `click()`，并显示已选文件名。

---

## 10. i18n：两条独立链路

| 位置 | 机制 |
|---|---|
| 设置页等 UI 文案 | `ctx.locale.register(ns, { zh, en })` + 插槽 `locale: ns` + 组件里的 `t()` |
| 插件卡片标题/描述 | 包内 `locale/<lang>.json` 的 `meta.title` / `meta.description` |

UI 文案：

```ts
ctx.effect(() => ctx.locale.register('xxx', { zh, en }))

ctx.slots.register(
  { name: 'plugins.row.config', key: '包名#行id', locale: 'xxx', inject: () => ({ ... }) },
  SettingsRow,
)

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { xxx: SkinKey }
}
```

卡片文案：

```json
{ "meta": { "title": "插件名", "description": "一句话说明" } }
```

- 文件名即语言 id（`en.json`、`zh.json`）；
- 必须有 `exports["./locale/*.json"]`，否则解析不到；
- 标题缺失回退包名，描述缺失回退 `package.json.description`。

---

## 11. 测试：smoke 不需要浏览器

`scripts/smoke.mjs` 用一个假环境加载 `lib/client.js`：

- 假 `window.__ModuleLoader__` 收集注册；
- 假 `document` / `documentElement`；
- 假 `ctx`（`slots.register` 记录调用，`theme/locale` 返回 disposer，`configForms` 返回快照）；
- 断言：注册了哪些插槽、覆盖了哪些 token、`inject` 列表是否正确。

它抓不到样式问题，但能抓住“加载即崩”和“注册丢失”这两类回归，值得保留。

---

## 12. 发布：tag → CI → Trusted Publishing

```
改版本号 + 写 CHANGELOG + 提交
git tag v0.1.x && git push origin v0.1.x
```

`.github/workflows/publish.yml`：

- `permissions: id-token: write`（OIDC 换 token 的前提）；
- `pnpm/action-setup@v4` **不要**再传 `version`，否则和 `packageManager` 冲突报 “Multiple versions of pnpm specified”；
- 先 `npm i -g npm@latest`（trusted publishing 需要 npm ≥ 11.5.2）；
- 校验 tag 与 `package.json` 版本一致；
- `pnpm build` 之后再跑 smoke（它加载 `lib/`）；
- `npm publish --provenance`。

npm 侧一次性配置：包设置 → Trusted publisher → GitHub Actions，填仓库与 workflow 文件名，允许 `npm publish`。

**npm 是异步发布**：`npm publish` 返回成功后，registry 上可能还要 2–8 分钟才可见。别用“刚发完查不到”判断失败。

---

## 13. 调试

**本地 overlay（推荐）**

```sh
cd deepseek-harness && pnpm dsh web --patch ../repo/dev.patch.yml
```

改了 client 刷新页面即可；改 host 或 overlay 需要重启。

**桌面端 CSS**

- 模拟：`document.documentElement.dataset.platform = 'darwin'`，只能验证选择器优先级；
- 真实验证：用 `--remote-debugging-port=9222` 启动桌面应用，用 Playwright 连 CDP 读 computed style、截图、点控件。**不要**拿模拟结果当“桌面端已修复”。

**本地 profile 用 link**

```json
"dsh-plugin-xxx": "link:/绝对路径"
```

改了代码 `pnpm build` 后刷新，不必每次发版。注意桌面应用的 profile 由应用管理，通过 UI 安装会把它改回注册表版本。

---

## 14. 交付前检查清单

- [ ] `row id` = 包名
- [ ] `engines.dsh` 与实测版本一致
- [ ] `exports["./locale/*.json"]` 存在
- [ ] client bundle 的 external 列表完整
- [ ] `pnpm build` / `typecheck` / `smoke` 全绿
- [ ] 浅色与深色都看过
- [ ] Web 与桌面端都验证过（不是模拟）
- [ ] 刷新后状态还在（存储类功能）
- [ ] 中英文文案都出现
- [ ] `npm pack` 的 files 列表符合预期
- [ ] CHANGELOG 已更新
