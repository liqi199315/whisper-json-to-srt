# NOW.md

## 当前阶段（2026-11-15）

- **项目路径**：`/Users/dake/Projects/aiapp/30_products/whisper-json-to-srt/`
- **本地 HEAD**：C01 WIP `5dd36ca` 之上新增 C02 WIP 提交（`git log -1 --oneline`）；C01 之前的源码基线是 `4571298`。这些是本地提交，不是 Cloudflare Worker 部署版本，本轮未 push、未部署。
- **正式生产域名**：`https://jsontosrt.com`（2026-11-12 已部署 Cloudflare Worker 并绑定主域名；当时线上首页与 6 种搜索爬虫请求返回 HTTP 200）。`2026-11-15` 已重新核验线上站点地图：14 个 URL 与本地完全一致，五个长尾页都在线上。线上没有 `release.json`，所以这次核验不能证明线上 Worker 对应 Git 提交 `4571298`。
- **代码仓库**：`https://github.com/liqi199315/whisper-json-to-srt` 当前为公开仓库。`2026-11-15` 用 `gh repo view` 读到 `visibility: PUBLIC`、`isPrivate: false`；仓库事件里 `2026-11-12T06:34:28Z` 有 `PublicEvent`。
- **联系邮箱**：`hello@jsontosrt.com` 与 `privacy@jsontosrt.com` 已启用 Cloudflare Email Routing，转发至 `liqi199315@gmail.com`（2026-11-12 核验：`enabled: true, status: ready`；本轮未重查）
- **90 天试验窗口**：`2026-11-12` 至 `2027-02-10`（详见 `PLAN_90DAY.md`）
- **主关键词**：`whisper json to srt converter`
- **内容路由**：源码与线上站点地图都是 14 条（11 个工具页 + `/about/`、`/privacy/`、`/terms/`）。`2026-11-15` `npm run release:check` 退出码 0，状态 `pending_live_manifest`：本地与线上站点地图均为 14 条且完全一致；线上没有 `https://jsontosrt.com/release.json`，因此不能证明线上提交。五个长尾页已在线上，不是「是否已部署未知」。旧的「9 路由」只描述 `2026-11-12` 的历史首发。
- **当前流量与转化基线**：不再是全盲。`2026-11-15` 只读报表（`--no-write`，退出码 0）：
  - GA4 属性 `564001579`，窗口 `28daysAgo` 至 `yesterday`，报告生成于 `2026-11-14T16:44:23.166Z`：69 用户、69 会话、12 个互动会话、81 次浏览、`subtitle_export` 2 次。来源为直接 54、Bing 自然 12、Product Hunt 3。这是站内会话，不是搜索点击。
  - Google Search Console `sc-domain:jsontosrt.com`，窗口 `2026-10-16` 至 `2026-11-12`：点击 0、曝光 0、查询与页面均为空。
  - Bing Webmaster `https://jsontosrt.com/`，脚本默认 28 天：点击 0、曝光 0。
  - 未知：这三份报表之后的增量、Google 站点地图当前处理状态、收录页数，以及 5 个长尾页是否已经再次提交 IndexNow。提交不代表收录。五个长尾页本身已在 `2026-11-15` 的线上站点地图中核实，不再是未知。

## 已就绪资产清单

- **多方言类型契约（`src/lib/types.ts`）**：覆盖 `openai-verbose-json`、`openai-diarized-json`、`whisperx-diarized`、`whisper-cpp`、`deepgram-nova`、`assemblyai-utterances`、`capcut-draft` 七种输入方言与 `srt`、`vtt`、`txt`、`csv` 四种导出格式。faster-whisper 与 Premiere 修复页复用 Whisper `segments` / `words`，不另建解析器。Deepgram utterances 复用已有 Deepgram 解析器。
- **14 个静态内容路由（11 个工具路由 + 3 个 E-E-A-T 信任页）**：
  1. `/`（Whisper JSON to SRT 主转换器）
  2. `/whisper-verbose-json-to-srt/`（OpenAI `verbose_json` 词级时间轴转 SRT）
  3. `/whisper-json-to-vtt/`（Whisper JSON 转 WebVTT）
  4. `/whisperx-diarized-json-to-srt/`（WhisperX 多说话人 diarization 转 SRT）
  5. `/whisper-cpp-json-to-srt/`（`whisper.cpp` `-oj` / `-ojf` JSON 转 SRT）
  6. `/short-video-caption-splitter/`（短视频单行 <=16 字符字幕重切分预设）
  7. `/faster-whisper-srt/`（faster-whisper `segments` / `words` JSON 转 SRT，页内附写入 JSON 的 Python 片段）
  8. `/premiere-pro-srt-import/`（从原始 JSON 重导出 Premiere 可导入的 UTF-8 无 BOM、逗号毫秒、cue 之间单空行 SRT）
  9. `/capcut-json-to-srt/`（明文 `draft_content.json` / `draft_info.json` 转 SRT；CapCut / 剪映 6.0+ 与模板工程加密文件明确拒绝）
  10. `/gpt-4o-transcribe-diarize-srt/`（OpenAI `diarized_json` 的 `speaker` / `start` / `end` 转 SRT）
  11. `/deepgram-json-to-srt/`（Deepgram `results.utterances` 说话人样本转 SRT，不重建解析器）
  12. `/about/`（100% 浏览器内存架构说明、SRT/WebVTT 时间戳测试规范、ASR 方言矩阵、非官方独立声明与 `hello@jsontosrt.com` 联络方式）
  13. `/privacy/`（零上传内存处理承诺、GA4 匿名化 `page_view` / `subtitle_export` 事件范围、Cookie 退订方法与 GDPR/CCPA 摘要）
  14. `/terms/`（MIT 开源工具使用许可、播出前字幕时间轴人工复核责任、`rel="sponsored"` 赞助与联盟披露规范）
- **时间轴 QC（`src/lib/timeline-qc.ts`）**：`convertAsrJson` 返回 `qc` 报告，稳定 issue code 为 `invalid-time`、`unrepresentable-time`、`negative-time`、`reversed-range`、`zero-duration`、`overlap`、`empty-segment`、`empty-cue`、`offset-clamped`，每条带 severity、segment/cue 的 1-based 位置、原值和时间轴说明。非有限值（JSON `1e999`）和毫秒时间戳溢出的有限值（`1e308`）不再输出 `00:00:00,000`：受影响 segment 被省略并计数，全部被省略时转换失败并返回 QC 明细；`formatTimestamp` 对非有限值抛 `RangeError`。倒序保留原时间不改写，重叠只报告不移动 cue，空段省略并计数。负输入时间钳到 0 并报告；负用户偏移导致越过 0 的 cue 钳到 0 至 0.05 秒并记 `offset-clamped`，不误报为倒序。页面的 `timeline-qc-summary` / `timeline-qc-issues` 常驻显示汇总和明细，复制或下载后 `export-status` 标出导出风险，另有 `.qc.txt` 报告下载，SRT 内不写注释；QC 文案和报告不含转写正文。
- **独立 Node ESM CLI（`bin/json-to-srt.mjs`）**：通过 `npm run build:cli`（esbuild）编译，直接复用 `src/lib/subtitle-engine.ts`，支持 `--input`、`--output`、`--format srt|vtt|txt|csv`、`--max-chars`、`--max-lines`、`--offset-ms`、`--speaker` / `--no-speaker`、`--fail-on-qc` 与 stdin 管道。有 QC 问题时把纯文本报告写到 stderr；`--fail-on-qc` 在 QC 有 error 时退出码 3 且不写输出。`tests/cli.test.ts` 共 13 项端到端 CLI 测试。
- **栅格化社交卡片与双 IndexNow 凭据**：通过 Playwright 栅格化生成 `public/og-image.png`（1200x630）与 `public/github-social-preview.png`（1280x640），`BaseLayout.astro` 引用 PNG 卡片与 `og:image:type`；生成 `public/a8f4c2e91b7d40639e5a12c8d4f07b31.txt` 响应搜索引擎默认探查。
- **构建后全量 SEO 门禁（`scripts/seo-preflight.mjs`）**：默认源站 `https://jsontosrt.com`，校验全部 26 个必需产物（14 个路由 HTML + `404.html`、`sitemap-index.xml`、`robots.txt`、`llms.txt`、`_headers`、`og-image.svg`、`og-image.png`、`github-social-preview.png`、`site.webmanifest`、`indexnow-key.txt`、`a8f4c2e91b7d40639e5a12c8d4f07b31.txt`、`release.json`）、唯一 `<title>` / `<meta name="description">` / 精确 `<link rel="canonical">` / `<meta property="og:image">`（断言以 `/og-image.png` 结尾）/ 唯一 `<h1>`、11 个工具页 `WebApplication` + `FAQPage` JSON-LD 与 3 个信任页 `Organization` / `BreadcrumbList` / `WebApplication` JSON-LD、PNG 尺寸与 magic bytes 校验、双 IndexNow 一致性、`_headers` 安全头、全站内链可达性，以及零占位符与零长破折号。
- **Playwright 端到端测试（`tests/e2e/converter.spec.ts`，共 8 条）**：覆盖首页 SRT -> VTT 切换、短视频 16 字单行切分断言、>2.5MB OpenAI `verbose_json` 上传与 `.srt` 下载、非法 JSON 报错与恢复、GA4 `window.dataLayer`（`config` 与 `subtitle_export` 含 `output_format`）且 `127.0.0.1` 以外外部请求数为 `0`、`375x812` 移动端零横向溢出与页脚 `/privacy/`、`/about/` 跳转 HTTP 200 + 可见 `<h1>`、5 个长尾页的预载样本/逗号毫秒 SRT/`subtitle_export`/`375px` 零横向溢出，以及粘贴和上传 QC fixture 后的汇总、明细、复制/下载风险提示、`.srt` 实际下载对照和 `.qc.txt` 报告下载。
- **生产上线操作手册（`LAUNCH_CHECKLIST.md`）与发布物料包（`LAUNCH_KIT.md`）**：整理好站长复制即用的域名购买、Cloudflare Workers 部署（可用 `_ops/research/indie-site-workflow-20261112/tools/cf-zone-bootstrap.mjs` 自动化）、Email Routing、GSC/Bing/IndexNow 提交、GA4 数据流与 `40_shared/analytics-sites.yaml` 注册片段；`LAUNCH_KIT.md` 包含 X 25s 演示脚本、痛点搜索关键词与回复、HN Show 提示点、Reddit 角度与目录站文案。

## 上线状态与待办

- `2026-11-12`：生产地址 `https://jsontosrt.com` 已绑定 Cloudflare Worker，版本 `1e1de410-8c17-4e72-8ead-b922a1cc0f61`。`www` 返回 301 至主域名。
- GA4 属性 ID `564001579`，数据流 ID `16325797678`，衡量 ID `G-085WZLBQ8F`。已配置 14 个月保留、关闭站内搜索和表单交互增强衡量，并确认 `subtitle_export` 关键事件。
- Google Search Console 域名属性 `sc-domain:jsontosrt.com` 已验证，服务账号和 `liqi199315@gmail.com` 均为所有者。站点地图 `https://jsontosrt.com/sitemap-index.xml` 提交返回 204，读取返回 200，Google 处理状态为待处理。
- IndexNow 于 `2026-11-12` 接受 9 个网址，HTTP 202；接受提交不代表已收录。
- `2026-11-12`：Cloudflare Zone `58c1590cb36fa9e33c7e66176d01f600`（`jsontosrt.com`）状态 `active`。Email Routing 为 `enabled: true, status: ready`。`hello@jsontosrt.com` 与 `privacy@jsontosrt.com` 转发至 `liqi199315@gmail.com`。MX、SPF、DKIM 与 `_dmarc` TXT 已锁定。
- `2026-11-12`：已在 `../../40_shared/analytics-sites.yaml` 登记 `whisperjsontosrt`（`ga4_property_id: "564001579"`，衡量 ID `G-085WZLBQ8F`，`sc-domain:jsontosrt.com`，`https://jsontosrt.com/`）。
- `2026-11-12`：Bing Webmaster Tools 已验证（`IsVerified: true`，经由 Cloudflare 未代理的 `verify.bing.com` CNAME）。站点地图 `https://jsontosrt.com/sitemap-index.xml` 已通过 `SubmitFeed` 提交。
- `2026-11-12`：`ga4-report.mjs`、`gsc-report.mjs`、`bing-report.mjs` 与 `analytics-registry.test.mjs` 均退出码 `0`。邮箱转发、Bing、共享统计注册与报表连通性检查已完成。
- `[人工]` 剩余：按 `LAUNCH_KIT.md` 发布社区帖（Show HN、Reddit、X）。Product Hunt 已在 `2026-11-15` 的 GA4 来源里出现 3 个会话，但是否完成正式发布、以及 Show HN、Reddit、X 是否已发，本轮没有核验。GitHub 仓库可见性已不是待办：`https://github.com/liqi199315/whisper-json-to-srt` 当前为公开仓库。
- 线上五个长尾页已在 `2026-11-15` 核实（站点地图 14 个 URL 与本地一致）。已知的 Worker 版本记录仍是 `2026-11-12` 的 `1e1de410-8c17-4e72-8ead-b922a1cc0f61` 与 `9df17e9b-8c95-43bc-89bc-9585393b189c`。线上没有 `release.json`，不能把本地 Git SHA `4571298` 写成线上提交。本轮没有执行部署。

## 下一步第一动作

- `[人工]` 核对 `LAUNCH_KIT.md` 里 Show HN、Reddit、X 是否已发；Product Hunt 只确认到来源会话，不记为发布完成。GitHub 仓库保持公开，不再做「私有改公开」。
- 五个长尾页已在线上站点地图中。是否为这 5 个 URL 补交 IndexNow，以及 Google 是否已处理当前 14 页站点地图，留给后续发布核对；本文件不记录未执行的提交。线上没有 `release.json`，所以即使补交 IndexNow，也不能把线上版本写成 `4571298`。

## 行动记录

- `2026-11-12` `[AI]`：完成 MVP `P0-1` 与 `P0-6`，跑通初始 6 路由静态构建、Vitest 18/18 单测与 Playwright 4 条基础转换路径。
- `2026-11-12` `[AI]`：完成正式生产化升级并迁入 `30_products/whisper-json-to-srt/`，统一商标安全主域名 `https://jsontosrt.com`；新增 `/about/`、`/privacy/`、`/terms/` 三个 E-E-A-T 信任页；升级 `scripts/seo-preflight.mjs` 覆盖 9 路由 + 8 静态资产与 `og:image` 校验；在 `tests/e2e/converter.spec.ts` 新增 GA4 `window.dataLayer` 零外连断言与 `375x812` 移动端零溢出 + 信任页导航测试；编写 `LAUNCH_CHECKLIST.md` 全流程上线命令手册。
- `2026-11-12` `[AI]`：完成站点加固 6 大项：通过 Playwright 栅格化生成 1200x630 og-image.png 与 1280x640 github-social-preview.png，BaseLayout.astro 切换 og:image 与 twitter:image；.gitignore 补充 .env 与 .dev.vars 秘钥防护；public/_headers 补充预览域名 noindex、X-Content-Type-Options、X-Frame-Options、HSTS 与 CSP/权限策略；生成双 IndexNow 文件 a8f4c2e91b7d40639e5a12c8d4f07b31.txt；构建 esbuild CLI bin/json-to-srt.mjs 并新增 tests/cli.test.ts（单测增至 29 项）；编写 LAUNCH_KIT.md 与升级 README.md；升级 scripts/seo-preflight.mjs 覆盖 20 项产物校验；verify:all 全流程（Vitest 29/29、astro build、seo:check、Playwright 6/6）全部退出码 0。

- `2026-11-12` `[AI]`：执行生产上线，`npm run verify:all` 通过（29 项单测、6 项 Chromium E2E），上线预检和 SEO 检查均 `ok: true`；完成 GA4 配置、GSC 域名验证与站点地图提交、IndexNow 提交，并核验 6 种爬虫 HTTP 200、主域名 GA4 ID 和 www 301。
- `2026-11-12` `[AI]`：核验 Email Routing、Bing Webmaster Tools 与共享统计注册。Zone `58c1590cb36fa9e33c7e66176d01f600` 为 `active`，Email Routing `enabled: true, status: ready`，`hello@jsontosrt.com` 与 `privacy@jsontosrt.com` 转发至 `liqi199315@gmail.com`，MX、SPF、DKIM 与 `_dmarc` TXT 已锁定。`whisperjsontosrt` 已登记（`ga4_property_id: "564001579"`，`G-085WZLBQ8F`，`sc-domain:jsontosrt.com`，`https://jsontosrt.com/`）。Bing `IsVerified: true`（Cloudflare 未代理 `verify.bing.com` CNAME），站点地图已 `SubmitFeed`。`ga4-report.mjs`、`gsc-report.mjs`、`bing-report.mjs` 与 `analytics-registry.test.mjs` 均退出码 `0`。
- `2026-11-13` `[AI]`：修复 CapCut 加密检测误伤。`parseAsrJson` 先 `JSON.parse`，解析失败后只把无换行、无时间码的长 base64 风格单行或含控制字符的二进制判为加密草稿。粘贴 SRT 与短中文回到 `Invalid JSON syntax`。`npm run verify:all` 退出码 0：Vitest 38/38，Playwright 7/7。未部署。
- `2026-11-13` `[AI]`：完成 `P1-4`。新增 5 个英文长尾工具页并写入站点地图、页眉页脚与相关工具内链：`/faster-whisper-srt/`、`/premiere-pro-srt-import/`、`/capcut-json-to-srt/`、`/gpt-4o-transcribe-diarize-srt/`、`/deepgram-json-to-srt/`。faster-whisper 与 Premiere 页复用 Whisper `segments`/`words` 解析；Deepgram 页复用已有 utterances 解析并换上双说话人样本。新增 CapCut 明文 draft 解析（微秒 `target_timerange`）与 OpenAI `diarized_json`（`seg_N` / `transcript.text.segment`）识别。加密或非 JSON 的 CapCut / 剪映 6.0+ 与模板工程返回明确拒绝，不声称可解密。SRT 序列化维持 UTF-8 无 BOM、逗号毫秒、LF、cue 之间单空行，并由单测锁定。`npm run verify:all` 退出码 0：Vitest 37/37，Astro 构建 15 页，`seo:check` 14 条路由 / 25 个必需文件 / 791 条内链，Playwright 7/7。未部署，也未在 Premiere、CapCut 客户端或 OpenAI 线上 API 上做实机导入。
- `2026-11-12` `[AI]`：上线后最佳实践巡检收口：`wrangler.jsonc` 关闭 `workers_dev` 与 `preview_urls` 并重部署（Version `9df17e9b-8c95-43bc-89bc-9585393b189c`，真网验证 `whisper-json-to-srt.liqi199315.workers.dev` 已返回 HTTP `404` 消除重复源）；`public/_headers` 升级完整 `Content-Security-Policy` 与 `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` 并移除静态资产解析器忽略的域名行；通过 GA4 Admin API 注册 `export_action`、`output_format`、`dialect`、`size_bucket` 四个事件级自定义维度；通过 `gh repo edit` 补齐 GitHub 仓库主页、简介与 9 个 Topics，并同步 `PLAN_90DAY.md` 状态。
- `2026-11-15` `[AI]`：把 `main` 从 `61defef` 快进到 `4571298`。只读核对后修正当前状态：源码为 14 条内容路由；GitHub 仓库为公开（`gh repo view` 的 `visibility: PUBLIC`，`2026-11-12T06:34:28Z` 有 `PublicEvent`）；GA4 近 28 天窗口有 69 用户 / 69 会话 / `subtitle_export` 2 次，GSC `2026-10-16` 至 `2026-11-12` 与 Bing 默认 28 天均为 0 点击、0 曝光。同日 `npm run release:check` 退出码 0，状态 `pending_live_manifest`：线上站点地图 14 个 URL 与本地完全一致，五个长尾页已在线上；线上没有 `release.json`，不能证明线上提交是 `4571298`。本轮没有部署。
- `2026-11-15` `[AI]`：完成 C02 时间轴 QC。先用当前代码复现：JSON 里有限值 `1e308` 在微秒取整时溢出，cue 变成 `NaN`，导出为 `00:00:00,000 --> 00:00:00,000`。新增 `src/lib/timeline-qc.ts`，把输入扫描、cue 分析与稳定 issue code 分开；非法或不可表示时间不再伪装成 0，受影响 segment 省略并计数，全空时拒绝转换；倒序保留原时间只报告，重叠只报告不移动，空段省略并计数；负输入时间钳到 0 并报告，负用户偏移单独记 `offset-clamped`。页面新增常驻 QC 汇总/明细、复制或下载风险提示与 `.qc.txt` 报告下载，保留原有 `data-testid`；CLI 把报告写到 stderr，并新增 `--fail-on-qc`（有 error 时退出码 3，不写输出）。新增 `tests/fixtures/qc/` 脱敏 fixture 与 `tests/timeline-qc.test.ts`。`npx tsc --noEmit` 退出码 0；`npm run verify:all` 退出码 0（Vitest 53/53，Astro 15 页，`seo:check` 14 路由 / 26 个必需文件 / 791 条内链，Playwright 8/8）；`npm run release:check` 退出码 0，状态 `pending_live_manifest`。C02 本地 WIP 提交见 `git log -1 --oneline`；未 push、未部署。
