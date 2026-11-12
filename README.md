# JSON to SRT Converter (`jsontosrt.com`)

[![Try it in browser](https://img.shields.io/badge/Try%20it%20in%20browser-zero%20upload-emerald?style=flat-square)](https://jsontosrt.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![CLI](https://img.shields.io/badge/CLI-json--to--srt-sky.svg?style=flat-square)](#cli-quickstart)

`whisper-json-to-srt` (canonical domain `https://jsontosrt.com`) converts OpenAI Whisper (`verbose_json`), WhisperX diarized transcripts, `whisper.cpp` JSON (`-oj` and `-ojf`), Deepgram Nova JSON, and AssemblyAI utterances JSON into `.srt`, `.vtt`, `.txt`, and `.csv` subtitle files directly in the browser or via standalone CLI.

## GitHub Repository Metadata

- **About Description:** 100% browser-local Whisper and ASR JSON to SRT, VTT, TXT, and CSV converter. Zero uploads, no file size limits, broadcast-safe word wrapping, and standalone Node CLI.
- **Website:** `https://jsontosrt.com`
- **Topics:** `whisper`, `whisper-subtitles`, `srt-converter`, `vtt-converter`, `subtitle-generator`, `whisperx`, `whisper-cpp`, `deepgram`, `assemblyai`, `speech-to-text`, `transcription`, `zero-upload`, `astro`

## Privacy, trademark, and licensing guarantees

- **100% browser-local execution.** Files and pasted JSON stay inside browser RAM via `File.text()` and `Blob` URLs. Nothing leaves the user's device or hits an external API.
- **Zero file-size paywall.** Multi-megabyte hour-long podcast `verbose_json` files convert and download locally without an artificial 2 MB limit.
- **Privacy-safe GA4 funnel.** Only anonymized `page_view` and `subtitle_export` (`export_action`, `output_format`) telemetry is pushed to `window.dataLayer`. External Google scripts are suppressed on `127.0.0.1` and `localhost`.
- **Clean-room MIT License and trademark-safe domain.** All parser modules, cue formatters, UI components, sample transcripts, and page copy are original MIT-licensed work published on `jsontosrt.com` with explicit third-party non-affiliation notices.

## CLI Quickstart

The repository provides a standalone Node ESM command-line interface in `bin/json-to-srt.mjs`:

```bash
# Build the CLI bundle
npm run build:cli

# Display help and options
./bin/json-to-srt.mjs --help

# Convert a local JSON transcript to SubRip (.srt)
./bin/json-to-srt.mjs --input transcript.json --output transcript.srt

# Convert to WebVTT with short-video single-line wrapping (<=16 chars)
./bin/json-to-srt.mjs -i transcript.json -f vtt --max-chars 16 --max-lines 1 -o reels.vtt

# Convert with millisecond sync offset shift (+500ms)
./bin/json-to-srt.mjs -i transcript.json --offset-ms 500 -o synced.srt

# Include speaker labels from WhisperX or diarized JSON
./bin/json-to-srt.mjs -i whisperx.json --speaker -o diarized.srt

# Pipe transcript from stdin directly to stdout
cat transcript.json | ./bin/json-to-srt.mjs -f srt > output.srt
```

### CLI Options

| Option | Shorthand | Description | Default |
|---|---|---|---|
| `--input <file>` | `-i` | Input JSON transcript file (or stdin if omitted or `-`) | stdin |
| `--output <file>` | `-o` | Output subtitle file path (or stdout if omitted) | stdout |
| `--format <fmt>` | `-f` | Output format: `srt`, `vtt`, `txt`, `csv` | `srt` |
| `--max-chars <n>` | | Max characters per subtitle line | `42` |
| `--max-lines <1\|2>` | | Max lines per cue (1 or 2) | `2` |
| `--offset-ms <n>` | | Timestamp offset shift in milliseconds | `0` |
| `--speaker` / `--no-speaker` | | Include or omit `[SPEAKER_XX]` labels | `--no-speaker` |
| `--help` | `-h` | Display usage instructions and web app link | |
| `--version` | `-v` | Display version number | |

## Built routes (9 content pages)

| Route | Built file | Kind | Primary intent |
|---|---|---|---|
| `/` | `dist/index.html` | Tool | Whisper JSON to SRT main converter |
| `/whisper-verbose-json-to-srt/` | `dist/whisper-verbose-json-to-srt/index.html` | Tool | OpenAI Audio API `verbose_json` word-timing conversion |
| `/whisper-json-to-vtt/` | `dist/whisper-json-to-vtt/index.html` | Tool | Whisper JSON to WebVTT subtitle export |
| `/whisperx-diarized-json-to-srt/` | `dist/whisperx-diarized-json-to-srt/index.html` | Tool | WhisperX speaker-diarized JSON to SRT |
| `/whisper-cpp-json-to-srt/` | `dist/whisper-cpp-json-to-srt/index.html` | Tool | `whisper.cpp` JSON output to SRT |
| `/short-video-caption-splitter/` | `dist/short-video-caption-splitter/index.html` | Tool | Single-line 16-character short video caption splitting |
| `/about/` | `dist/about/index.html` | Trust | Browser-local architecture, SRT/WebVTT spec testing, ASR schemas, non-affiliation, `hello@jsontosrt.com` |
| `/privacy/` | `dist/privacy/index.html` | Trust | Zero-upload RAM guarantee, anonymized GA4 events, cookie opt-out, GDPR/CCPA summary |
| `/terms/` | `dist/terms/index.html` | Trust | MIT open tool terms, broadcast sync QC responsibility, `rel="sponsored"` disclosure policy |

Auxiliary required build outputs: `dist/404.html`, `dist/sitemap-index.xml`, `dist/robots.txt`, `dist/llms.txt`, `dist/_headers`, `dist/og-image.svg`, `dist/og-image.png`, `dist/github-social-preview.png`, `dist/site.webmanifest`, `dist/indexnow-key.txt`, and `dist/a8f4c2e91b7d40639e5a12c8d4f07b31.txt`.

## Run local development and verification

Run these commands from `/Users/dake/Projects/aiapp/30_products/whisper-json-to-srt`:

```bash
npm run dev
npm test
npm run build
npm run seo:check
npm run preview
npm run test:e2e
npm run verify:all
npm run cf:preview
```

- `npm run dev` starts the local Astro server at `http://127.0.0.1:4325`.
- `npm test` runs the Vitest unit test suites (`tests/subtitle-engine.test.ts` and `tests/cli.test.ts`).
- `npm run build` builds the Node CLI bundle and compiles the static site into `dist/`.
- `npm run seo:check` runs `scripts/seo-preflight.mjs` against `dist/` to verify all required output files, raster social cards, dual IndexNow files, unique `<title>` and `<meta name="description">` across 9 routes, exact `<link rel="canonical">` (`https://jsontosrt.com/...`), `<meta property="og:image">`, single `<h1>`, `WebApplication` + `FAQPage` JSON-LD on the 6 tool routes, valid `Organization` / `BreadcrumbList` / `WebApplication` JSON-LD on the 3 trust routes, unbroken internal links, and zero placeholders or long dashes.
- `npm run test:e2e` starts `npm run preview` on `http://127.0.0.1:4325/` and runs all 6 Chromium specs in `tests/e2e/converter.spec.ts` (4 converter journeys, GA4 `window.dataLayer` + zero external network requests, and `375x812` mobile viewport + footer trust navigation).
- `npm run verify:all` runs unit tests, static build, SEO preflight, and Playwright E2E in sequence.

## Production launch runbook

Follow [`LAUNCH_CHECKLIST.md`](./LAUNCH_CHECKLIST.md) for copy-paste commands covering `jsontosrt.com` domain registration, Cloudflare Workers deployment, `hello@jsontosrt.com` Cloudflare Email Routing, GSC/Bing/IndexNow submission, GA4 stream creation, and `../../40_shared/analytics-sites.yaml` registration.

## License

MIT
