# 人工实机测试清单

在提交或发布前，按以下步骤在真实浏览器中验证关键路径。

## 1. 字体上传、生成与刷新恢复

1. 使用无痕窗口打开应用，确认初始字体为 `Great Vibes`。
2. 点击上传字体，选择本地 `Allura-Regular.ttf`。
3. 观察：
   - 上传成功后字体下拉框自动切换到 `Allura`。
   - 预览区在 1-3 秒内重新生成签名，无“未知字体”错误。
   - 所有导出按钮从禁用变为可用。
4. 修改文本内容，确认使用 `Allura` 重新生成。
5. 刷新页面（F5）：
   - 字体下拉框仍显示 `Allura`。
   - URL hash 中 `fontKey=up-1`（或对应的上传序号）。
   - 预览区正常生成，导出按钮可用。
6. 打开 DevTools → Application → IndexedDB → `artistic-signature-generator`，确认上传字体记录存在。

## 2. 未知字体分享链接自动回退

1. 在另一台设备 / 另一个浏览器配置文件 / 无痕窗口中，打开如下 URL：
   ```
   <origin>/#s=<任意有效 hash 但 fontKey=does-not-exist>
   ```
   例如构造：`http://localhost:3000/#s=eyJ2IjoxLCJ0ZXh0IjoiVGVzdCIsImZvbnRLZXkiOiJkb2VzLW5vdC1leGlzdCIsImVuZ2luZSI6ImZsb3VyaXNoIiwicGFyYW1zIjp7ImZsb3VyaXNoIjowLjUsInRpZ2h0bmVzcyI6MC41LCJ3ZWlnaHQiOjAuNX0sImNvbG9yIjp7InR5cGUiOiJzb2xpZCIsInZhbHVlIjoiIzE3MTcxYyJ9LCJzZWFsIjp7InNoYXBlIjoic3F1YXJlIiwibW9kZSI6InpodSIsImRpc3RyZXNzIjp0cnVlfSwiYmciOiJwYXBlciJ9`
2. 观察：
   - 页面顶部出现 Toast：`字体「does-not-exist」在本机不存在，已回退到默认字体`。
   - 字体下拉框显示 `Great Vibes`。
   - 预览区使用默认字体正常生成，无“未知字体”错误。

## 3. 参数变化期间禁止导出旧场景

1. 输入文本 `Hello`，等待生成完成，确认导出按钮可用。
2. 快速连续修改参数（例如把 `flourish` 从 0.5 拖到 0.9，再立刻改颜色）。
3. 在参数变化后的 300ms 内立即点击导出按钮：
   - 应弹出 Toast：`场景尚未生成完成，请稍候`，或按钮本身处于禁用状态。
   - 不应导出旧参数生成的 SVG/PNG/WebM。
4. 停止操作，等待 1-2 秒，确认新参数生成完成后导出按钮重新可用。
5. 导出 WebM，确认：
   - 视频颜色与当前参数一致。
   - 若浏览器不支持或录制失败，弹出明确的“导出失败”提示，而非“已导出”。

## 4. 上传字体分享链接不碰撞

1. 上传一个本地字体（如 `Allura-Regular.ttf`），使其成为 `up-1`。
2. 点击“分享”按钮，复制链接。
3. 在接收方浏览器中，确保接收方也上传过某个字体且本地序号为 `up-1`（可手动构造同名 key）。
4. 打开分享链接：
   - 应出现 Toast：`链接无法携带上传的字体文件，对方打开时将回退到内置字体`。
   - 接收方实际使用的字体应为 `Great Vibes`（默认字体），而不是接收方本地的 `up-1`。

## 5. 移动端页头与可访问性

1. 打开 DevTools 设备模拟，选择 iPhone SE / 320px 宽度。
2. 确认：
   - 页面无横向滚动条。
   - “书写动画”和“分享”按钮仅显示图标，但不溢出。
3. 打开 DevTools Accessibility 树：
   - 两个按钮均显示非空名称（如 `书写动画`、`分享`）。
4. 切换到 390px 宽度，确认品牌标题最多两行，无压成三行的情况。

## 6. 发布产物授权链

1. 执行 `npm run build`。
2. 检查 `dist/fonts/` 目录：
   - 存在 `OFL.txt`。
   - 存在 `FONT-LICENSES.md`。
3. 打开 `dist/fonts/OFL.txt`，确认第 5 行指向“本目录 FONT-LICENSES.md”。

## 7. 大字体 / 超长 hash 拒绝服务

1. 尝试上传一个大于 30MB 的文件（可构造一个伪 `.ttf`）：
   - 应弹出 Toast：`字体文件过大，限制 30MB`。
2. 在地址栏输入超长 hash（> 4096 字符）：
   - 页面应忽略该 hash，回退到默认状态，不卡顿。

## 8. Windows 便携启动器

1. 执行 `npm run package`，确认生成 `release/艺术签名生成器/艺术签名生成器.exe` 与 `release/*.zip`。
2. 复制 `release/艺术签名生成器/` 到一个**不含中文路径**的目录（如 `C:\Temp\test\`）。
3. 双击 `艺术签名生成器.exe`：
   - 系统托盘出现图标。
   - 默认浏览器自动打开 `http://127.0.0.1:<随机端口>`。
   - 页面功能正常：输入文本、切换引擎、导出 PNG/WebM。
4. 不关闭第一个实例，再次双击 exe：
   - 不应出现第二个托盘图标。
   - 浏览器应再打开一个标签页，地址可能是不同端口（首个实例端口不变）。
5. 右键托盘图标选择“退出”：
   - 托盘图标消失。
   - 刷新已打开的浏览器页面应无法连接（服务已停止）。
6. 检查任务管理器，确认没有残留 `艺术签名生成器.exe` 进程。
