# dsh-plugin-shell-skin 🐚

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-plugin-shell-skin"><img alt="npm version" src="https://img.shields.io/npm/v/dsh-plugin-shell-skin?label=npm&color=blue"></a>
  <a href="https://www.npmjs.com/package/dsh-plugin-shell-skin"><img alt="npm downloads" src="https://img.shields.io/npm/dm/dsh-plugin-shell-skin?label=downloads&color=brightgreen"></a>
  <img alt="platform" src="https://img.shields.io/badge/platform-DeepSeek%20Harness%20Web-8A2BE2">
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/github/license/raven3005672/dsh-plugin-shell-skin?color=orange"></a>
</p>

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 换一层壳：**开场动画、壁纸、面板透明度**，一个设置页全管。

全部逻辑跑在**浏览器半边**，不碰会话、模型请求、工具，也不读写你的文件系统。

<p align="center">
  <img src="https://raw.githubusercontent.com/raven3005672/dsh-plugin-shell-skin/master/assets/preview/home-light.jpg" width="880" alt="浅色主题：壁纸透过半透明面板">
</p>

## 功能特性

| 功能 | 说明 |
|---|---|
| **开场动画** | 页面加载时播放一段约 1.5 秒的入场动画，然后淡出；尊重 `prefers-reduced-motion` |
| **壁纸** | 自带一张，也可以选你自己电脑里的图片，只存在浏览器里 |
| **面板透明度** | 分别控制浅色 / 深色下侧栏和面板的透明度，拖动时实时预览 |
| **首帧底色** | 应用挂载前先刷上底色，避免启动瞬间闪白 |
| **设置页** | 集成在插件配置页里，所有项即时生效（开关除外，见下方限制） |
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
  <img src="https://raw.githubusercontent.com/raven3005672/dsh-plugin-shell-skin/master/assets/preview/splash.jpg" width="880" alt="启动动画">
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
| 开场动画 | 下次加载 |
| 浅色 / 深色透明度 | 拖动时实时预览，松手保存 |
| 侧边栏显示壁纸 | 即时 |
| 侧边栏透明度 | 拖动时实时预览，松手保存（两种配色共用） |
| 首帧底色（浅色 / 深色） | 即时 |
| 自定义壁纸 / 内置壁纸 | 即时 |
| 图片 | 选中并存入浏览器后即时 |

## 自定义壁纸存在哪

图片存在**当前浏览器的 IndexedDB** 里，用 Blob URL 应用到页面，不会上传到 Host：

- 绑定页面 origin：换端口、换浏览器都看不到；
- 不跨设备同步；
- 「移除图片」只删文件，不动开关——删完自动回落到内置图或纯底色。

## 桌面端差异

在 Electron 桌面应用里同样生效，但有两处观感差异：

- macOS 的侧栏有官方的 vibrancy 混合规则，会把面板透明度再乘一次，所以壁纸在侧栏里更透；
- 桌面端 `body` 本来是透明的（让原生毛玻璃透出来），铺上壁纸后这层毛玻璃就被盖住了。

另外，上传的图片按 origin 隔离，Web 和桌面端不会共享。

## 已知限制

- **开场动画开关不即时**：它控制 `shell.overlay` 的注册，改动后需要刷新；
- 深色面板默认 0.55、浅色 0.85，想更透可以自己调；
- 壁纸按 `cover` 铺满，极端长宽比会被裁切（暂不支持平铺 / 居中等模式）。

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

改了 client 半边刷新页面即可；改了 host 半边或 overlay 需要重启。

## 素材与版权声明

插件内置的默认壁纸图片**来自网络**，仅用于演示和装饰目的，作者未持有该图片的明确授权，版权归原作者所有。

如果你是版权方，认为这张图片的使用侵犯了你的权益，请通过 [Issues](https://github.com/raven3005672/dsh-plugin-shell-skin/issues) 联系作者，附上图片说明与权利依据。确认后我们会尽快替换或移除该素材，并发布新版本。

另外说明：用户自行上传的壁纸只保存在本地浏览器（IndexedDB），不会随插件分发，也不会上传到任何服务器；由用户自行确保其上传内容的合法性。

## 更新日志

各版本的功能变更与问题修复见 [CHANGELOG.md](CHANGELOG.md)。

## 许可

[MIT](LICENSE)
