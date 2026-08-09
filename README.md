# Artistic-Signature-Generator

纯前端的字体轮廓特效器：输入单行文本，基于规则引擎把字体轮廓实时变形为五种风格的艺术签名。
不依赖任何服务端与大模型——所有计算（文字整形、骨架提取、风格变形、导出）都在浏览器内完成，文本与字体文件不出本机。

## 功能

- **五种风格引擎**
  - 商务连笔：轮廓 → 栅格化 → Zhang-Suen 细化 → 中心线矢量化，均匀描边，相邻字母最近端点平滑桥接
  - 花体飘逸：正弦波扰动 + 末端藤蔓卷曲 + 笔画粗细渐变
  - 极简几何：RDP 曲线抽直 + 45° 角度吸附
  - 涂鸦手绘：确定性随机抖动 + 多重描边模拟手抖
  - 印章：方/圆/椭圆外框，朱文/白文，feTurbulence 做旧
- **多文种混排**：HarfBuzz（WASM）整形，中文/英文/数字/符号/阿拉伯文混排（如 `M0nesy.`），阿拉伯文连写形式与 RTL 正确；缺字自动按回退链选字体
- **参数微调**：各引擎只展示其真正响应的滑块（名称即语义，如极简模式的"简化程度"、涂鸦模式的"抖动幅度"）
- **字体**：内置 8 款 OFL 开源可商用字体（西文/中文/阿文），支持上传 ttf/otf/woff（字体保留在本机 IndexedDB，刷新不丢）
- **导出**：SVG 矢量、透明背景 PNG ×2/×4、SMIL 书写动画 SVG、WebM 白底书写视频
- **分享**：设计状态编码进 URL hash，复制链接即分享（hash 经运行时 schema 校验与颜色白名单，防注入）
- **隐私**：纯前端，无网络请求（除首次加载字体资源）

## 技术栈

React 19 + TypeScript + Vite + Tailwind + shadcn/ui；harfbuzzjs（vendored WASM）；场景构建在常驻 Web Worker 中执行（字体缓存跨构建保留，10s 看门狗防死循环）。

```
src/lib/
  hb.ts            HarfBuzz WASM 封装与类型
  fonts.ts         字体注册表 / 懒加载 / 上传字体（IndexedDB 持久化）
  layout.ts        分段 → 按需回退 → 整形 → 轮廓定位
  skeleton.ts      中心线提取（栅格化 → 距离变换 → 细化 → 图追踪 → 交汇缝合 → 拟合）
  engines/         五个风格引擎
  exporter.ts      SVG / PNG / SMIL / WebM 导出（所有 XML 属性值经转义）
  share.ts         URL hash 编解码 + sanitizeState 运行时校验
  scene.worker.ts  常驻构建 Worker（latest-wins，新请求作废旧请求）
```

## 开发

```bash
npm install        # 依赖安装（锁文件指向 registry.npmjs.org）
npm run dev        # 开发服务器（端口 3000）
npm run build      # 类型检查 + 生产构建
npm run lint       # ESLint（0 error 基线）
npm test           # Vitest 单元测试（路径/骨架/分享校验/转义）
```

## Windows 便携版

项目包含一个 Go 编写的 Windows 启动器，双击即可启动本地 HTTP 服务并用系统浏览器打开应用，无需 Node.js 或联网。

```bash
npm run package    # 生成 release/staging/艺术签名生成器/ 目录与 ZIP 压缩包
```

打包需要：
- Node.js 20+
- Go 1.22+
- goversioninfo：`go install github.com/josephspurrier/goversioninfo/cmd/goversioninfo@v1.4.0`

产物结构：
```
release/
├── staging/
│   └── 艺术签名生成器/
│       ├── 艺术签名生成器.exe
│       └── app/              # Vite 构建后的网页、字体、WASM 资源
└── Artistic-Signature-Generator-v0.3.0-windows-x64.zip
```

启动器特性：
- 自动选择空闲端口，仅监听 `127.0.0.1`。
- 系统托盘提供“打开页面”与“退出”。
- 命名互斥体 + 命名管道 IPC：重复双击会通知已有实例打开新标签页，不启动第二个服务。
- 支持 `--open-url` 参数用于调试（仅限 `http://localhost` 和 `http://127.0.0.1`）。

GitHub Actions 会在 push/PR 时自动打包并上传 Artifact；推送 `v*` 标签时发布 Release。

## 适用范围与限制（诚实声明）

- 导出物是面向屏幕的矢量/位图：含 SVG 滤镜、渐变、未展开描边，无物理尺寸与色彩管理。
  正式印刷或刻章前，请在专业软件中展开描边、转曲并核对尺寸与色彩。
- WebM 视频无法使用 SVG 滤镜，印章"做旧"在视频中为确定性噪声侵蚀的近似效果。
- 分享链接无法携带上传的字体文件；接收方打开时将回退到内置字体（界面有明确提示）。
- 书写动画为风格化笔画顺序（按字形分组），不等于真实笔顺。

## 字体

内置字体均为 SIL OFL 1.1 开源许可，版权归属与许可证全文见 [FONT-LICENSES.md](FONT-LICENSES.md)。
上传字体请在本地自行确认授权范围，文件不会被上传。
