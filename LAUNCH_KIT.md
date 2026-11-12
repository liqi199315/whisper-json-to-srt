# Launch Kit: jsontosrt.com

This document contains copy-paste launch assets and outreach templates for `https://jsontosrt.com`.
All external links use clean canonical URLs without tracking parameters or utm tags.

---

## 1. X (Twitter) Launch Assets

### 25-Second Native Demo Video Shot List

- **0:00 - 0:05 (The Problem & Zero-Upload Drop):**
  Open `https://jsontosrt.com`. Drag and drop a 4 MB Whisper `verbose_json` file into the drop zone. Show instant parsing banner appearing immediately without any loading spinner.
- **0:05 - 0:12 (Short Video Line Splitting):**
  Switch preset to Short Video Splitter (`/short-video-caption-splitter/`). Show character slider set to 16 chars per line and 1 line per cue. Point out how 80-character decoder blocks are reflowed into readable TikTok/Reels captions using word timestamps.
- **0:12 - 0:18 (Format & Speaker Controls):**
  Toggle formats: SRT -> WebVTT -> CSV. Toggle the `Include Speaker Labels` checkbox to show `[SPEAKER_00]` prefixes appearing instantly in the live cue preview.
- **0:18 - 0:25 (Proof of Local Privacy):**
  Click `Download .srt` and show the file saving instantly via Blob URL. Open DevTools Network tab showing 0 requests transmitted during the entire session.

### Main Post Text (No Link in Root Post)

Most online subtitle converters make you upload your private audio transcript to their server, only to hit a 2 MB file limit or a monthly paywall.

If you run Whisper, WhisperX, or whisper.cpp, you often get 5 MB+ of word-level JSON that standard tools reject.

Built an open-source, 100% browser-local converter:
- Zero server upload: all parsing happens in your browser RAM
- Handles 10 MB+ multi-hour transcripts with zero lag
- Auto-detects 5 ASR JSON formats (OpenAI, WhisperX, whisper.cpp, Deepgram, AssemblyAI)
- Word-level cue reflow (8 to 84 chars/line, 1 or 2 lines)
- Speaker diarization prefixes and sync offset
- Standalone CLI available for automated pipelines

Native 25s demo below:

### Reply #1 Text (Direct Clean Link)

Web app (free, no sign-up, zero upload):
https://jsontosrt.com

GitHub repo + Node CLI:
https://github.com/liqi199315/whisper-json-to-srt

---

## 2. X Boolean Pain-Search Queries & Value-First Replies

### Query 1: ASR JSON to SRT Conversion Pain
```text
("whisper" OR "whisperx") ("json to srt" OR "json to vtt" OR "convert json") -is:retweet
```

**Reply Template:**
If you already have the Whisper JSON transcript with word timestamps, you do not need to rerun the transcription or upload files to a cloud tool. You can drop the JSON into https://jsontosrt.com to generate SRT or VTT cues locally in your browser. It runs via File.text() in client RAM with no 2 MB file size limit and no server uploads.

### Query 2: Long Subtitle Line Overflow on Mobile
```text
("whisper" OR "transcription") ("too long" OR "character limit" OR "split lines" OR "srt line length") -is:retweet
```

**Reply Template:**
Whisper defaults to segment-level text blocks that can run 80+ characters, which overflow 9:16 vertical video frames. If you have `verbose_json` or WhisperX word timestamps, https://jsontosrt.com/short-video-caption-splitter/ lets you reflow those cues to 16 or 32 characters per line (1 or 2 lines per cue) based on exact word start and end times without manual retiming.

### Query 3: File Size Paywalls on Free Converters
```text
("convert json to srt" OR "json to subtitle") ("paywall" OR "file size limit" OR "upload failed") -is:retweet
```

**Reply Template:**
Most online converters cap free uploads at 1 MB or 2 MB because they process files on remote servers. For multi-hour transcripts, https://jsontosrt.com does 100% of the parsing in browser JavaScript. It handles multi-megabyte JSON files without paywalls or account registration.

---

## 3. Hacker News Show HN Engineering Notes

*Important Notice for dake:*
Per Hacker News guidelines, write the final submission title and top-level comment in your own authentic voice. Do not copy paste automated marketing prose. Use clean URLs with zero tracking parameters.

### Suggested Submission Titles
- Show HN: JSON to SRT - Browser-local subtitle generator for Whisper and ASR JSON
- Show HN: JSON to SRT - Zero-upload subtitle converter and line reflow for Whisper JSON

### Factual Technical Talking Points for Comments
- **Why it was built:** OpenAI Whisper `verbose_json` output contains full word-level timestamps, but turn-key tools either require Python scripting or upload private interview audio transcripts to third-party web apps that impose 2 MB file size gates.
- **Client-Side Architecture:** Built with Astro 5 static output. All parsing, cue reflow, timestamp formatting, and exports run entirely in browser RAM using `File.text()` and `URL.createObjectURL(blob)`. Zero bytes of transcript data leave the user tab.
- **Dialect Auto-Detection:** Automatically detects five schemas without requiring manual radio selection:
  1. OpenAI Whisper API `verbose_json` (`segments[]` + `words[]`)
  2. WhisperX diarized JSON (`segments[]` with `speaker` attributes)
  3. `whisper.cpp` JSON (`transcription[]` with `offsets`)
  4. Deepgram Nova JSON (`results.channels[0].alternatives[0].words[]`)
  5. AssemblyAI Utterances JSON (`utterances[]` or millisecond `words[]`)
- **Word-Level Cue Reflow:** Rather than cutting text arbitrarily by character count, the engine walks word timestamp arrays to compute broadcast-safe cues adhering to character limits (8 to 84 chars) and line counts (1 or 2 lines) while preserving word boundary timings.
- **Standalone CLI:** The core engine is packaged as a zero-dependency Node ESM CLI (`bin/json-to-srt.mjs`) supporting stdin, stdout, file inputs, custom line wrapping, and speaker tags for headless batch workflows.
- **Open Source:** Clean-room MIT license.

---

## 4. Reddit Community Angle Notes (Clean URLs)

### r/LocalLLaMA
- **Angle:** Running Whisper or WhisperX locally on your own GPU ensures total audio privacy, but converting the resulting JSON into readable SRT files often sends users back to cloud converters.
- **Key Points:** 100% client-side tool, handles large word-timestamp JSON files from local models, includes Node CLI for bash scripts.
- **Clean URL:** `https://jsontosrt.com`

### r/podcasting
- **Angle:** Long podcast episodes (1 to 2 hours) produce 5 MB to 10 MB JSON files with speaker labels. Most free online tools crash or block files larger than 2 MB.
- **Key Points:** Preserves speaker diarization tags like `[SPEAKER_01]`, allows shifting sync offset in milliseconds, exports to SRT, VTT, or plain text transcripts for show notes.
- **Clean URL:** `https://jsontosrt.com`

---

## 5. Directory Submission Copy

### AlternativeTo
- **Name:** JSON to SRT
- **URL:** https://jsontosrt.com
- **Short Description:** 100% browser-local subtitle converter for Whisper, WhisperX, and ASR JSON files with zero file uploads and custom line wrapping.
- **Long Description:** JSON to SRT converts OpenAI Whisper verbose_json, WhisperX, whisper.cpp, Deepgram Nova, and AssemblyAI transcripts into SRT, WebVTT, TXT, and CSV files directly inside your browser. Because all computation runs in client-side JavaScript, private client audio and legal transcripts are never uploaded to remote servers. Features include word-level cue reflow for short-form video (16 chars/line), speaker diarization prefixes, millisecond timestamp offsets, and no file size paywalls.
- **Tags:** Subtitle Converter, Whisper, SRT, WebVTT, Transcription, Privacy, Local-First, Developer Tools
- **Alternatives to replace:** Subtitle Edit online, Happy Scribe converter, Maestra subtitle converter.

### Uneed.best
- **Product Name:** JSON to SRT
- **Tagline:** Local Whisper and ASR JSON to SRT subtitle converter with zero file uploads.
- **Description:** Convert multi-megabyte Whisper and ASR JSON transcripts into broadcast-ready SRT, VTT, TXT, or CSV files directly in your browser. Supports OpenAI Whisper verbose_json, WhisperX speaker tags, whisper.cpp, Deepgram, and AssemblyAI with word-boundary line wrapping and zero file size caps.
- **Category:** Developer Tools / Audio & Video

### DevHunt
- **Tool Name:** JSON to SRT
- **Tagline:** Zero-upload browser and CLI subtitle converter for Whisper JSON transcripts.
- **Description:** A local-first subtitle tool that parses OpenAI Whisper verbose_json, WhisperX, whisper.cpp, Deepgram, and AssemblyAI outputs into SubRip, WebVTT, plain text, and CSV. Features word-level cue wrapping for vertical video, millisecond sync adjustments, speaker labels, and a bundled Node CLI. All operations run in browser RAM with zero network uploads.
- **Tech Stack:** Astro 5, TypeScript, Tailwind CSS, Playwright, Vitest, Cloudflare Workers Static Assets.
