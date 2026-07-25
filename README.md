# Artistic-Signature-Generator

Artistic-Signature-Generator 是一个纯前端的艺术签名设计工具，支持中文、西文和阿拉伯文混排。项目通过 HarfBuzz 完成字体整形，再使用多种规则引擎生成商务连笔、花体、极简几何、涂鸦和印章风格，并可导出 SVG、PNG 及 WebM 等格式。所有排版、字体处理和导出都在浏览器本地完成，不需要将签名文本或用户字体上传到服务器。

## 主要功能

- 中文、西文、阿拉伯文混排与字体回退
- 五种规则化签名风格及可调参数
- 本地字体选择与自定义字体导入
- SVG、高清 PNG、动画 SVG 和 WebM 导出
- 通过 URL hash 分享当前设计参数

## 本地运行

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

技术栈：React 19、TypeScript、Vite、Tailwind CSS、HarfBuzz WASM。
