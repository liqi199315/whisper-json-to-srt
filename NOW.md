# NOW.md

## 当前阶段（2026-11-12）

- **项目路径**：`/Users/dake/Projects/aiapp/30_products/whisper-json-to-srt/`
- **正式生产域名**：`https://jsontosrt.com`（已完成正式产品仓结构迁入与上线前全部代码、E-E-A-T 信任页、移动端适配、GA4 隐私漏斗、独立 CLI、社交卡片与预检升级，等待站长按 `LAUNCH_CHECKLIST.md` 执行域名绑定与线上发布）
- **联系邮箱规划**：`hello@jsontosrt.com`（Cloudflare Email Routing 转发）
- **90 天试验窗口**：`2026-11-12` 至 `2027-02-10`（详见 `PLAN_90DAY.md`）
- **主关键词**：`whisper json to srt converter`
- **当前流量与转化基线**：`盲`（新站待绑定 `jsontosrt.com` 并完成 GSC / Bing / IndexNow / GA4 线上登记）

## 已就绪资产清单

- **多方言类型契约（`src/lib/types.ts`）**：覆盖 `openai-verbose-json`、`whisperx-diarized`、`whisper-cpp`、`deepgram-nova`、`assemblyai-utterances` 五种输入方言与 `srt`、`vtt`、`txt`、`csv` 四种导出格式。
- **9 个静态内容路由（6 个工具路由 + 3 个 E-E-A-T 信任页）**：
  1. `/`（Whisper JSON to SRT 主转换器）
  2. `/whisper-verbose-json-to-srt/`（OpenAI `verbose_json` 词级时间轴转 SRT）
  3. `/whisper-json-to-vtt/`（Whisper JSON 转 WebVTT）
  4. `/whisperx-diarized-json-to-srt/`（WhisperX 多说话人 diarization 转 SRT）
  5. `/whisper-cpp-json-to-srt/`（`whisper.cpp` `-oj` / `-ojf` JSON 转 SRT）
  6. `/short-video-caption-splitter/`（短视频单行 <=16 字符字幕重切分预设）
  7. `/about/`（100% 浏览器内存架构说明、SRT/WebVTT 时间戳测试规范、五大 ASR 方言矩阵、非官方独立声明与 `hello@jsontosrt.com` 联络方式）
  8. `/privacy/`（零上传内存处理承诺、GA4 匿名化 `page_view` / `subtitle_export` 事件范围、Cookie 退订方法与 GDPR/CCPA 摘要）
  9. `/terms/`（MIT 开源工具使用许可、播出前字幕时间轴人工复核责任、`rel="sponsored"` 赞助与联盟披露规范）
- **独立 Node ESM CLI（`bin/json-to-srt.mjs`）**：通过 `npm run build:cli`（esbuild）编译，直接复用 `src/lib/subtitle-engine.ts`，支持 `--input`、`--output`、`--format srt|vtt|txt|csv`、`--max-chars`、`--max-lines`、`--offset-ms`、`--speaker` / `--no-speaker` 与 stdin 管道，配套 `tests/cli.test.ts` 11 项端到端 CLI 测试。
- **栅格化社交卡片与双 IndexNow 凭据**：通过 Playwright 栅格化生成 `public/og-image.png`（1200x630）与 `public/github-social-preview.png`（1280x640），`BaseLayout.astro` 引用 PNG 卡片与 `og:image:type`；生成 `public/a8f4c2e91b7d40639e5a12c8d4f07b31.txt` 响应搜索引擎默认探查。
- **构建后全量 SEO 门禁（`scripts/seo-preflight.mjs`）**：默认源站 `https://jsontosrt.com`，校验全部 20 个必需产物（9 个路由 HTML + `404.html`、`sitemap-index.xml`、`robots.txt`、`llms.txt`、`_headers`、`og-image.svg`、`og-image.png`、`github-social-preview.png`、`site.webmanifest`、`indexnow-key.txt`、`a8f4c2e91b7d40639e5a12c8d4f07b31.txt`）、唯一 `<title>` / `<meta name="description">` / 精确 `<link rel="canonical">` / `<meta property="og:image">`（断言以 `/og-image.png` 结尾）/ 唯一 `<h1>`、6 工具页 `WebApplication` + `FAQPage` JSON-LD 与 3 信任页 `Organization` / `BreadcrumbList` / `WebApplication` JSON-LD、PNG 尺寸与 magic bytes 校验、双 IndexNow 一致性、`_headers` 预览域名 `X-Robots-Tag: noindex` 规则、全站内链可达性，以及零占位符与零长破折号。
- **Playwright 端到端测试（`tests/e2e/converter.spec.ts`，共 6 条）**：覆盖首页 SRT -> VTT 切换、短视频 16 字单行切分断言、>2.5MB OpenAI `verbose_json` 上传与 `.srt` 下载、非法 JSON 报错与恢复、GA4 `window.dataLayer`（`config` 与 `subtitle_export` 含 `output_format`）且 `127.0.0.1` 以外外部请求数为 `0`、以及 `375x812` 移动端零横向溢出与页脚 `/privacy/`、`/about/` 跳转 HTTP 200 + 可见 `<h1>`。
- **生产上线操作手册（`LAUNCH_CHECKLIST.md`）与发布物料包（`LAUNCH_KIT.md`）**：整理好站长复制即用的域名购买、Cloudflare Workers 部署（可用 `_ops/research/indie-site-workflow-20261112/tools/cf-zone-bootstrap.mjs` 自动化）、Email Routing、GSC/Bing/IndexNow 提交、GA4 数据流与 `40_shared/analytics-sites.yaml` 注册片段；`LAUNCH_KIT.md` 包含 X 25s 演示脚本、痛点搜索关键词与回复、HN Show 提示点、Reddit 角度与目录站文案。

## 等待站长完成的清单（`[人工]`）

1. **P0-2（预估 25 分钟）**：按 `LAUNCH_CHECKLIST.md` 第 2 至 4 节注册 `jsontosrt.com`，执行 `npm run cf:deploy` 绑定自定义域名（可搭配 `cf-zone-bootstrap.mjs`），并开启 Cloudflare Email Routing 转发 `hello@jsontosrt.com`。
2. **P0-3（预估 25 分钟）**：按 `LAUNCH_CHECKLIST.md` 第 5 至 6 节配置 Google Search Console、Bing Webmaster Tools、IndexNow 提交与 GA4 Web 数据流，将公开属性 ID 写入 `../../40_shared/analytics-sites.yaml` 的 `whisperjsontosrt` 条目并带 `PUBLIC_GA4_MEASUREMENT_ID` 重新部署。

## 下一步第一动作

- 站长 dake 打开 `LAUNCH_CHECKLIST.md`，依次执行 `P0-2`（`jsontosrt.com` 注册、Cloudflare 部署与 `hello@jsontosrt.com` 路由）和 `P0-3`（GSC / Bing / IndexNow / GA4 登记与公开 ID 回填）。

## 行动记录

- `2026-11-12` `[AI]`：完成 MVP `P0-1` 与 `P0-6`，跑通初始 6 路由静态构建、Vitest 18/18 单测与 Playwright 4 条基础转换路径。
- `2026-11-12` `[AI]`：完成正式生产化升级并迁入 `30_products/whisper-json-to-srt/`，统一商标安全主域名 `https://jsontosrt.com`；新增 `/about/`、`/privacy/`、`/terms/` 三个 E-E-A-T 信任页；升级 `scripts/seo-preflight.mjs` 覆盖 9 路由 + 8 静态资产与 `og:image` 校验；在 `tests/e2e/converter.spec.ts` 新增 GA4 `window.dataLayer` 零外连断言与 `375x812` 移动端零溢出 + 信任页导航测试；编写 `LAUNCH_CHECKLIST.md` 全流程上线命令手册。
- `2026-11-12` `[AI]`：完成站点加固 6 大项：通过 Playwright 栅格化生成 1200x630 og-image.png 与 1280x640 github-social-preview.png，BaseLayout.astro 切换 og:image 与 twitter:image；.gitignore 补充 .env 与 .dev.vars 秘钥防护；public/_headers 补充预览域名 noindex、X-Content-Type-Options、X-Frame-Options、HSTS 与 CSP/权限策略；生成双 IndexNow 文件 a8f4c2e91b7d40639e5a12c8d4f07b31.txt；构建 esbuild CLI bin/json-to-srt.mjs 并新增 tests/cli.test.ts（单测增至 29 项）；编写 LAUNCH_KIT.md 与升级 README.md；升级 scripts/seo-preflight.mjs 覆盖 20 项产物校验；verify:all 全流程（Vitest 29/29、astro build、seo:check、Playwright 6/6）全部退出码 0。
