# AGENTS.md

## Session startup order

Read these four files in order at the start of every session before you change code or copy:

1. `PLAN_90DAY.md`
2. `NOW.md`
3. `AGENTS.md`
4. `LAUNCH_CHECKLIST.md` (when working on deployment, DNS, email routing, search consoles, or GA4)

## Project scope and architecture

- **Site URL.** `https://jsontosrt.com`.
- **Support contact.** `hello@jsontosrt.com`.
- **Workspace stage.** Formal production tool site in `30_products/whisper-json-to-srt/`.
- **Tech stack.** Astro 5 (`output: 'static'`, `trailingSlash: 'always'`, `build.format: 'directory'`), Tailwind CSS v4, TypeScript (`astro/tsconfigs/strict`), Vitest, Playwright, esbuild for CLI bundling, and Cloudflare Workers Static Assets (`wrangler.jsonc`).
- **Standalone CLI.** Bundled Node ESM CLI in `bin/json-to-srt.mjs` (built via `npm run build:cli`) wrapping `src/lib/subtitle-engine.ts` for headless automated pipelines. It prints the timeline QC report to stderr and supports `--fail-on-qc` (exit `3`, no output written) for strict pipelines.
- **Fourteen content routes.**
	- **Eleven converter tool routes** (require `WebApplication` + `FAQPage` JSON-LD):
		- `/` (`dist/index.html`)
		- `/whisper-verbose-json-to-srt/` (`dist/whisper-verbose-json-to-srt/index.html`)
		- `/whisper-json-to-vtt/` (`dist/whisper-json-to-vtt/index.html`)
		- `/whisperx-diarized-json-to-srt/` (`dist/whisperx-diarized-json-to-srt/index.html`)
		- `/whisper-cpp-json-to-srt/` (`dist/whisper-cpp-json-to-srt/index.html`)
		- `/short-video-caption-splitter/` (`dist/short-video-caption-splitter/index.html`)
		- `/faster-whisper-srt/` (`dist/faster-whisper-srt/index.html`)
		- `/premiere-pro-srt-import/` (`dist/premiere-pro-srt-import/index.html`)
		- `/capcut-json-to-srt/` (`dist/capcut-json-to-srt/index.html`)
		- `/gpt-4o-transcribe-diarize-srt/` (`dist/gpt-4o-transcribe-diarize-srt/index.html`)
		- `/deepgram-json-to-srt/` (`dist/deepgram-json-to-srt/index.html`)
	- **Three E-E-A-T trust routes** (require valid `Organization`, `BreadcrumbList`, or `WebApplication` JSON-LD):
		- `/about/` (`dist/about/index.html`)
		- `/privacy/` (`dist/privacy/index.html`)
		- `/terms/` (`dist/terms/index.html`)
- **Auxiliary static outputs (12 files).** `dist/404.html`, `dist/sitemap-index.xml`, `dist/robots.txt`, `dist/llms.txt`, `dist/_headers`, `dist/og-image.svg`, `dist/og-image.png`, `dist/github-social-preview.png`, `dist/site.webmanifest`, `dist/indexnow-key.txt`, `dist/a8f4c2e91b7d40639e5a12c8d4f07b31.txt`, and `dist/release.json` (written after `astro build`; `project`, `siteUrl`, `routeCount`, and `routes` must match `sitemap-0.xml`).

## Non-negotiable red lines

1. **Browser-local zero-upload execution.** Every JSON parse, word-timing split, speaker prefix, timestamp offset, and subtitle export runs locally in the user's browser RAM. Never send transcript payloads, file contents, speaker labels, or filenames over the network.
2. **Zero file-size paywall.** Never add a 2 MB file size limit or a fake cloud queue gate. `tests/e2e/converter.spec.ts` verifies >2.5 MB OpenAI `verbose_json` uploads and downloads end to end.
3. **Clean-room MIT licensing and trademark safety.** Keep all source code, test fixtures, sample JSON payloads, and page copy original under the MIT License. Maintain explicit non-affiliation notices on `/about/` and `/terms/`, and keep the canonical brand domain trademark-clean (`jsontosrt.com`).
4. **Privacy-safe GA4 funnel contract.** Record only anonymized `page_view` and `subtitle_export` (`export_action`, `output_format`) in `window.dataLayer`. Suppress external Google script requests on `127.0.0.1` and `localhost` so local development and Playwright E2E emit zero external network requests.
5. **Stable UI and mobile test contract.** Preserve the `data-testid` attributes required by `tests/e2e/converter.spec.ts` (`status-banner`, `json-input`, `file-upload`, `format-select`, `max-chars-input`, `max-lines-select`, `subtitle-output`, `copy-output-btn`, `download-output-btn`, `load-sample-btn`, `timeline-qc-summary`, `timeline-qc-summary-text`, `timeline-qc-issues`, `qc-report-download-btn`, `export-status`) and maintain zero horizontal overflow (`scrollWidth <= 375`) at `375x812` mobile viewport.
6. **Copy hygiene.** Never leave double-brace template tokens, unfinished work markers, sample Latin filler text, em-dashes, or en-dashes in source copy, built HTML, or `llms.txt`. `scripts/seo-preflight.mjs` fails the build check on any match.
7. **Human gate respect.** Tasks marked `[人工]` in `PLAN_90DAY.md` and `LAUNCH_CHECKLIST.md` belong to dake. Never fabricate live metrics or bypass `[人工]` gates. Note that Cloudflare zone bootstrap and DNS/worker setup can be accelerated using `_ops/research/indie-site-workflow-20261112/tools/cf-zone-bootstrap.mjs`.

## Verification commands

Run all checks from `/Users/dake/Projects/aiapp/30_products/whisper-json-to-srt`:

```bash
npm test
npm run build
npm run seo:check
npm run test:e2e
npm run verify:all
```

A change is complete only when `npm run verify:all` exits 0 and `NOW.md` reflects the current state. Update `PLAN_90DAY.md` only when the task changes plan-level scope.

## Timeline QC contract

- `convertAsrJson` returns `qc` with stable issue codes `invalid-time`, `unrepresentable-time`, `negative-time`, `reversed-range`, `zero-duration`, `overlap`, `empty-segment`, `empty-cue`, and `offset-clamped`. Every issue carries severity, scope (`segment` or `cue`), a 1-based position, the raw value when present, and a short message.
- Non-finite values and values that overflow a millisecond timestamp are never serialized as `00:00:00,000`. Affected segments are omitted, counted in `omittedSegments`, and reported. If every cue is omitted the conversion fails with the QC detail. `formatTimestamp` throws `RangeError` on non-finite or unrepresentable input.
- Reversed source ranges are reported and preserved without moving the cue. Cue overlap is reported with both cue positions and without shifting timing. Empty segments are omitted and counted.
- Negative input times are clamped to `0.000` and reported. Negative user offsets that push a cue before zero are clamped to a `0.050 s` fallback and reported as `offset-clamped` notes. Negative offsets are not treated as reversed input.
- The browser shows the QC summary and issue list next to the status banner, shows an export risk message on copy/download when issues exist, and offers a separate `.qc.txt` report download. The SRT itself never contains QC comments.
- QC messages and reports must not include transcript text, filenames, or other payload content. Exports keep the existing GA4 event whitelist; the QC report download records `subtitle_export` with `export_action: "qc_report"` and `output_format: "txt"`.
- The CLI prints the QC report to stderr and supports `--fail-on-qc` (exit `3`, no output written). A clean conversion keeps stderr empty.
- Fixtures live in `tests/fixtures/qc/`. `tests/timeline-qc.test.ts` covers `1e999`, `1e308` overflow, reversed ranges, overlaps, empty segments, offsets, clean payloads, and every built-in sample dialect with zero false positives.

## Analytics

This project is `whisperjsontosrt` in `../../40_shared/analytics-sites.yaml` (mapped to `https://jsontosrt.com` and `30_products/whisper-json-to-srt`).
Read `../../40_shared/ANALYTICS.md` before pulling numbers.
Use `npm run ga4:report`, `npm run gsc:report`, `npm run bing:report`.
Do not pass another site's property ID.
