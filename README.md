# dsh-plugin-shell-skin 🐚

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-plugin-shell-skin"><img alt="npm version" src="https://img.shields.io/npm/v/dsh-plugin-shell-skin?label=npm&color=blue"></a>
  <a href="https://www.npmjs.com/package/dsh-plugin-shell-skin"><img alt="npm downloads" src="https://img.shields.io/npm/dm/dsh-plugin-shell-skin?label=downloads&color=brightgreen"></a>
  <img alt="platform" src="https://img.shields.io/badge/platform-DeepSeek%20Harness%20Web-8A2BE2">
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/github/license/raven3005672/dsh-plugin-shell-skin?color=orange"></a>
</p>

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 换一层外观：**开场动画、壁纸、面板透明度**，一个设置页全管。

所有效果都在页面里完成，不碰会话、模型请求，也不读写你的文件系统。

> 名字里的 **shell 指应用外壳（app shell）**，不是侧边栏里的终端；这个插件给整个界面换壁纸和外观，不修改终端配色。

<p align="center">
  <img src="https://raw.githubusercontent.com/raven3005672/dsh-plugin-shell-skin/master/assets/preview/home-light.jpg" width="880" alt="浅色主题：壁纸透过半透明面板">
</p>

## 功能特性

| 功能 | 说明 |
|---|---|
| **开场动画** | 页面加载时播放一段约 1.5 秒的动画，然后淡出；系统开启“减少动态效果”时自动跳过 |
| **壁纸** | 自带三张（当前 / 极光 / 几何弧线）；也可以上传最多 9 张自己的图片，打开随机模式后每次启动换一张 |
| **面板透明度** | 分别控制浅色 / 深色下侧边栏和面板的透明度，拖动时实时预览 |
| **启动时的底色** | 应用加载前先铺上颜色，避免打开瞬间闪白 |
| **设置页** | 在「设置 → 界面皮肤」里，所有项即时生效 |
| **中英文** | 跟随 DSH 的语言设置，设置页文案与插件卡片都会切换 |

## 安装

### npm（推荐）

```sh
dsh plugin --profile web add dsh-plugin-shell-skin
```

装完**重启** DSH——运行中的进程持有内存里的旧插件树。

### 桌面应用

在「插件」页的安装框里填 `dsh-plugin-shell-skin`，不用开终端；装完重开应用。

### 从源码

`lib/` 构建产物不入库，clone 后先构建：

```sh
git clone git@github.com:raven3005672/dsh-plugin-shell-skin.git
cd dsh-plugin-shell-skin
pnpm install
pnpm build
dsh plugin --profile web add "file:$PWD"
```

## 开场动画

<p align="center">
  <img src="https://raw.githubusercontent.com/raven3005672/dsh-plugin-shell-skin/master/assets/preview/splash.jpg" width="880" alt="开场动画">
</p>

三段式：底环呼吸 → 标识亮起 → 整层淡出。可以在设置里关掉，但**关闭要刷新一次页面**才生效——它改变的是插槽注册，不是纯样式。

## 壁纸与透明度

深色主题下壁纸会更突出，因为深色面板的默认透明度更低：

<p align="center">
  <img src="https://raw.githubusercontent.com/raven3005672/dsh-plugin-shell-skin/master/assets/preview/home-dark.jpg" width="880" alt="深色主题：壁纸与半透明面板">
</p>

壁纸的取值顺序是明确的：

| 自定义壁纸 | 内置壁纸 | 结果 |
|---|---|---|
| 开 + 已选图 | 任意 | 你的图 |
| 开 + 没选图 | 开 | 内置图 |
| 开 + 没选图 | 关 | 无图，只剩首帧底色 |
| 关 | 开 | 内置图 |
| 关 | 关 | 无图，只剩首帧底色 |

选完文件会自动把「自定义壁纸」打开，避免“选了图却没反应”。

## 设置页

<p align="center">
  <img src="https://raw.githubusercontent.com/raven3005672/dsh-plugin-shell-skin/master/assets/preview/settings-light.jpg" width="440" alt="设置页（浅色）">
  <img src="https://raw.githubusercontent.com/raven3005672/dsh-plugin-shell-skin/master/assets/preview/settings-dark.jpg" width="440" alt="设置页（深色）">
</p>

| 设置项 | 何时生效 |
|---|---|
| 开场动画 | 即时（关闭会立刻移除当前动画） |
| 浅色 / 深色面板透明度 | 拖动时实时预览，松手保存 |
| 侧边栏显示壁纸 | 即时 |
| 侧边栏透明度 | 拖动时实时预览，松手保存（两种配色共用） |
| 启动时的底色（浅色 / 深色） | 即时 |
| 自定义壁纸 / 内置壁纸 | 即时 |
| 图片 | 选中并存入浏览器后即时；仅接受图片，上限 10 MB |
| 恢复默认 | 即时重置上面所有设置项（不删除已上传的图片） |

设置页底部还有两个按钮：「报告问题」打开带模板的 GitHub issue；「复制诊断信息」把版本、平台和当前设置复制到剪贴板——不含图片、文件名或任何个人信息。

## 自定义壁纸存在哪

图片存在**当前浏览器的 IndexedDB** 里，用 Blob URL 应用到页面，不会上传到 Host：

- 绑定页面 origin：换端口、换浏览器都看不到；
- 不跨设备同步；
- 「移除图片」只删文件，不动开关——删完自动回落到内置图或纯底色。

## 桌面端差异

在 Electron 桌面应用里同样生效，但有两处观感差异：

- macOS 的侧边栏用系统毛玻璃效果，会把面板透明度再乘一次，所以壁纸在侧边栏里更透；
- 桌面端 `body` 本来是透明的（让原生毛玻璃透出来），铺上壁纸后这层毛玻璃就被盖住了。

另外，上传的图片按浏览器地址隔离，Web 和桌面端不会共享。

## 已知限制

- 开场动画只在页面加载时播放一次，不会在切换设置时重复播放；
- 随机壁纸每次启动只抽一次，调设置不会重新抽；
- 深色面板默认 0.55、浅色 0.85，想更透可以自己调；
- 壁纸按比例铺满窗口，极端长宽比的图片会被裁切（暂不支持平铺或居中）。

## 开发

```sh
pnpm install
pnpm build        # lib/index.js + lib/client.js
pnpm typecheck
pnpm smoke        # 不启浏览器，加载 client bundle 并断言注册行为
```

边改边看：在 `deepseek-harness` 目录里挂本地 overlay，不用装进 profile：

```sh
pnpm dsh web --patch ../dsh-plugin-shell-skin/dev.patch.yml
```

改了前端代码刷新页面即可；改了后端代码或调试用的挂载配置需要重启。

写新插件时的完整检查清单见 [docs/PLUGIN_PLAYBOOK.md](docs/PLUGIN_PLAYBOOK.md)。

## 素材与版权声明

插件内置的默认壁纸图片**来自网络**，仅用于演示和装饰目的，作者未持有该图片的明确授权，版权归原作者所有。

如果你是版权方，认为这张图片的使用侵犯了你的权益，请通过 [Issues](https://github.com/raven3005672/dsh-plugin-shell-skin/issues) 联系作者，附上图片说明与权利依据。确认后我们会尽快替换或移除该素材，并发布新版本。

另外说明：用户自行上传的壁纸只保存在本地浏览器（IndexedDB），不会随插件分发，也不会上传到任何服务器；由用户自行确保其上传内容的合法性。

## 发布

版本号写在 `package.json` 里。发布走 GitHub Actions 的 Trusted Publishing（OIDC），不需要本地 token 或 OTP：

1. 改 `package.json` 的 `version`，更新 `CHANGELOG.md`，提交；
2. 打 tag 并推送：

```sh
git tag v0.1.4
git push origin v0.1.4
```

工作流 [`.github/workflows/publish.yml`](.github/workflows/publish.yml) 会校验 tag 与版本号一致、跑类型检查和 smoke，然后执行 `npm publish --provenance`。

首次使用需要在 npm 包设置里配置 Trusted publisher（GitHub Actions，仓库 `raven3005672/dsh-plugin-shell-skin`，工作流文件名 `publish.yml`）。

本地手动发布（`npm publish`）仍然可用，但需要网页登录过 2FA。

## 更新日志

各版本的功能变更与问题修复见 [CHANGELOG.md](CHANGELOG.md)。

## 许可

[MIT](LICENSE)
