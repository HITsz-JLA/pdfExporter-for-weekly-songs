# MD Exporter

本地运行的 Markdown → PDF 排版工具，专为包含中文、日文注音、HTML 居中标签的歌词和学习笔记设计。原始文档不被修改，文档内容在请求内存中处理，不写入服务端文档库。运行时不依赖 CDN 或云服务。

## 启动

需要 Node.js 20+，以及本机安装的 Chrome 或 Edge。Windows 会自动查找常见安装位置。已经安装依赖时，双击 `start.cmd` 即可启动，再手动访问 **http://127.0.0.1:3210**。启动脚本优先使用系统 Node，也可使用当前电脑已有的 Codex 配套 Node。保持启动窗口运行，按 Ctrl+C 停止服务。

首次安装依赖：

```powershell
cd D:\HITSZ-JLA\MDExporter
npm install
npm start
```

也支持 `pnpm install` / `pnpm start`。首次下载依赖需要联网；之后运行和导出均可离线。如果本机没有 Chrome / Edge，可运行 `npm run install:browser` 下载专用 Chromium，或用 `BROWSER_PATH` 指定浏览器可执行文件。使用无头浏览器仅作服务端 PDF 排版。

## 使用

1. 拖入或选择 UTF-8 的 `.md` / `.markdown` / `.txt` 文件，也可直接粘贴、编辑内容。
2. 如有图片引用，导入配套图片或资源文件夹。`/image/Masukatto.jpg` 优先匹配资源目录中的 `image/Masukatto.jpg`；也可直接导入同名的 `Masukatto.jpg`，在没有路径匹配时按唯一文件名匹配。多个路径同时匹配时会提示冲突，不随意选取。
3. 可另外点击“选择头图”导入图片。它会替换文首独立图片；原文没有文首图片时添加到顶部。“移除头图”可恢复原文图片。头图不会改写 Markdown 源码，导入新文档时会清空。
4. 分别选择“中文字体”和“日文字体（含注音）”。默认覆盖原文的内联字体；取消勾选可保留元素自身指定的内联字体。
5. 点击“检查缺字”。中文、日文分别使用对应字体检测，结果分开显示；系统回退字体也可能补齐缺字，但不保证完整覆盖。
6. 调整字号、行距、注音大小、纸张、边距和页码，点击“导出 PDF”。

`examples/masukatto.md` 是用户提供的原始格式示例。它引用的封面图片和音频未随 Markdown 提供，导出时会显示缺图提示；导入图片后再导出即可补全封面。

## 中文 / 日文自动识别

识别针对“日文原文加粗、下一段为中文译文、ruby 标注读音、文末有中文词汇讲解”的文档结构：

- 有假名或 ruby 的日文段落使用日文字体，ruby 及其 rt 读音也使用日文字体。
- 在 `type: lyrics` 文档或 `center` 容器中，整段加粗的原文即使只有汉字，也按日文处理；其后的普通中文译文使用中文字体。
- 中文词汇讲解保留中文主体，其中的 ruby、加粗日文词语、带假名的「日文引用」和假名片段单独使用日文字体。
- 代码保持等宽字体，不纳入这两种字体的缺字检测。

这是基于格式和字符的规则识别，不会调用云端模型。纯汉字、中日文无分隔混写或不符合示例格式的文本可能存在歧义。可用 `<p lang="ja">東京</p>`、`<span lang="ja">日文词语</span>` 或 `lang="zh-CN"` 手动指定；嵌套的显式语言标记优先生效。纯汉字词语的语言不会仅凭字形准确推断。

头图支持 PNG / JPEG / WebP / GIF，最多 12 MB，与配套图片共用总大小限制；以原比例完整显示，最大高度 60 mm，避免过高的图片挤占正文。

## 格式支持

- Markdown：标题、段落、粗体、斜体、列表、引用、代码、表格、链接、图片、删除线。
- HTML：`center`、`ruby`、`rt`、`rp`、`rb`、`rtc`、`br`、`div`、`span`、`sub`、`sup`、表格、`details` 等安全排版标签。
- 保留 HTML 中安全的居中、文字颜色、字号和字体样式；默认使用所选字体覆盖原文字体。
- YAML front matter 不作为正文打印；`title` 用于 PDF 标题及文件名。文档内容均视为数据，不执行文档内的指令或脚本。
- 浏览器原生的 ruby 排版，以及 PDF 文本选择、字体子集嵌入、自动分页、页码。
- 预览是缩放后的连续文档，最终分页以 PDF 为准。过长段落和表格会跨页；标题、加粗歌词段落尽量与下一段保持同页，减少原文和译文分离。

HTML 是安全子集，脚本、事件、iframe、任意 CSS、外部样式表不执行。Markdown 按 markdown-it 的规则解析，示例中的 `center` 后需保留空行，以便其内 Markdown 正常解析。不支持数学公式、Mermaid 或站点主题样式自动还原。

PDF 无法播放音视频，相关元素显示文字提示。外部图片不会自动下载，需手动导入 PNG / JPEG / WebP / GIF；SVG 不在支持范围内。Markdown 应为 UTF-8，其他编码请先转换。单张图片最多 12 MB，图片合计建议不超过 22 MB；请求总上限 35 MB，正文最多 200 万字符。

## 字体来自哪台电脑

服务会扫描 **运行 Node 服务的电脑** 的系统字体及当前用户字体，支持 TTF / OTF / TTC / OTC / WOFF / WOFF2 中字体解析库可识别的字面。字体集合中的字面会分别列出，界面按字体家族归类，自动选择常规字重，并为 PDF 提供同家族粗体和斜体。不是所有旧字体或可变字体都能被排版引擎完整支持；有问题时更换字体。

Windows 默认扫描 `C:\Windows\Fonts` 和 `%LOCALAPPDATA%\Microsoft\Windows\Fonts`。安装新字体后点击“重新扫描”。也可用 `FONT_DIR` 添加字体目录，多个目录用操作系统路径分隔符分隔（Windows 用分号）。

另一台电脑通过局域网访问服务时，字体列表仍来自服务主机；预览会通过服务加载这些字体。打印浏览器使用同一套字体配置。请按字体授权使用、分发或嵌入字体。

## 配置与局域网部署

默认只监听 `127.0.0.1:3210`。如需在可信局域网提供服务：

```powershell
$env:HOST = '0.0.0.0'
$env:PORT = '3210'
npm start
```

其他设备访问 `http://服务主机IP:3210`，并按需放行防火墙。此工具没有账户系统，服务会提供系统字体文件给访问者，因此仅用于本机或可信局域网。不要直接暴露到公网；如需公网服务，请自行在前面部署 HTTPS、认证及访问限制。

其他可选变量：`BROWSER_PATH`（Chrome / Edge / Chromium 可执行文件）、`FONT_DIR`（额外字体目录）。Linux 可安装 Chromium 与中日文字体包，或运行 `npm run install:browser`；浏览器的系统依赖需由管理员预先安装。

## 验证

```powershell
npm test
```

测试覆盖 YAML、居中区域内的 Markdown、ruby、头图添加及替换、中日文识别与手动覆盖、分语言字体及缺字检测、资源匹配、危险 HTML 过滤、非法参数及真实 PDF 生成。完整测试需要至少一种系统字体和可运行的 Chrome / Edge / Chromium。

主要文件：`src/server.js` 服务入口，`src/document.js` 文档解析及排版，`src/fonts.js` 字体扫描，`src/pdf.js` PDF 排版引擎，`public/` Web 界面。

技术依据：[markdown-it](https://github.com/markdown-it/markdown-it)、[sanitize-html](https://github.com/apostrophecms/sanitize-html)、[Playwright PDF 接口](https://playwright.dev/docs/api/class-page#page-pdf)、[fontkit](https://github.com/foliojs/fontkit)。
