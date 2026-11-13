#!/usr/bin/env node

// src/cli.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";

// src/lib/subtitle-engine.ts
var DIALECT_LABELS = {
  "openai-verbose-json": "OpenAI Whisper verbose_json",
  "openai-diarized-json": "OpenAI diarized_json",
  "whisperx-diarized": "WhisperX Diarized JSON",
  "whisper-cpp": "whisper.cpp JSON",
  "deepgram-nova": "Deepgram Nova JSON",
  "assemblyai-utterances": "AssemblyAI Utterances JSON",
  "capcut-draft": "CapCut draft JSON"
};
var CJK_CHAR_RE = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef\uac00-\ud7af]/;
var CJK_CLOSING_PUNCT_RE = /^[，。！？；：、）》」』】〉》]/;
var NO_LEADING_SPACE_PUNCT_RE = /^[,.;:!?%)\]}>，。！？；：、）》」』】]/;
function roundMicro(value) {
  return Math.round(value * 1e6) / 1e6;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function toFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function normalizeSpeaker(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : void 0;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return `Speaker ${value}`;
  }
  return void 0;
}
function parseTimestampString(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?$/);
  if (!match) return null;
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = match[4] ? Number(match[4].padEnd(3, "0")) : 0;
  return hours * 3600 + minutes * 60 + seconds + millis / 1e3;
}
function isCjkChar(char) {
  return char.length > 0 && CJK_CHAR_RE.test(char);
}
function appendToken(current, token) {
  if (!current) return token;
  if (!token) return current;
  if (NO_LEADING_SPACE_PUNCT_RE.test(token)) {
    return `${current}${token}`;
  }
  const prevChar = current[current.length - 1] ?? "";
  const nextChar = token[0] ?? "";
  if (isCjkChar(prevChar) && isCjkChar(nextChar)) {
    return `${current}${token}`;
  }
  return `${current} ${token}`;
}
function joinTokens(tokens) {
  if (tokens.length === 0) return "";
  const parts = [tokens[0]];
  let prevToken = tokens[0];
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;
    if (!prevToken) {
      parts.push(token);
      prevToken = token;
      continue;
    }
    const prevChar = prevToken[prevToken.length - 1] ?? "";
    const nextChar = token[0] ?? "";
    const noSpace = NO_LEADING_SPACE_PUNCT_RE.test(token) || isCjkChar(prevChar) && isCjkChar(nextChar);
    parts.push(noSpace ? token : ` ${token}`);
    prevToken = token;
  }
  return parts.join("");
}
function extractWordToken(record) {
  const candidates = [record.punctuated_word, record.word, record.text];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return "";
}
function normalizeWords(rawWords, scaleToSec, fallbackSpeaker, bounds) {
  const drafts = [];
  for (const item of rawWords) {
    if (!isRecord(item)) continue;
    const word = extractWordToken(item);
    if (!word) continue;
    const rawStart = toFiniteNumber(item.start);
    const rawEnd = toFiniteNumber(item.end);
    if (rawStart === null && rawEnd === null && !bounds) continue;
    const startSec = rawStart !== null ? Math.max(0, rawStart * scaleToSec) : null;
    const endSec = rawEnd !== null ? Math.max(0, rawEnd * scaleToSec) : null;
    const speaker = normalizeSpeaker(item.speaker) ?? fallbackSpeaker;
    drafts.push({ word, startSec, endSec, speaker });
  }
  if (drafts.length === 0) return [];
  const nextKnownStart = new Array(drafts.length).fill(null);
  let upcomingStart = null;
  for (let i = drafts.length - 1; i >= 0; i--) {
    nextKnownStart[i] = upcomingStart;
    if (drafts[i].startSec !== null) {
      upcomingStart = drafts[i].startSec;
    }
  }
  const resolved = [];
  for (let i = 0; i < drafts.length; i++) {
    const current = drafts[i];
    let startSec = current.startSec;
    let endSec = current.endSec;
    if (startSec === null) {
      const prev = resolved[resolved.length - 1];
      startSec = prev ? prev.endSec : bounds?.startSec ?? 0;
    }
    if (endSec === null) {
      endSec = nextKnownStart[i] ?? bounds?.endSec ?? startSec + 0.2;
    }
    const safeStart = roundMicro(Math.max(0, startSec));
    const safeEnd = roundMicro(Math.max(safeStart, endSec));
    const entry = {
      word: current.word,
      startSec: safeStart,
      endSec: safeEnd
    };
    if (current.speaker) entry.speaker = current.speaker;
    resolved.push(entry);
  }
  return resolved;
}
function groupWordsIntoSpeakerSegments(words) {
  if (words.length === 0) return [];
  const segments = [];
  let bucket = [];
  const flush = () => {
    if (bucket.length === 0) return;
    const first = bucket[0];
    const last = bucket[bucket.length - 1];
    const segment = {
      startSec: first.startSec,
      endSec: Math.max(first.startSec, last.endSec),
      text: joinTokens(bucket.map((w) => w.word)),
      words: bucket
    };
    if (first.speaker) segment.speaker = first.speaker;
    segments.push(segment);
    bucket = [];
  };
  for (const word of words) {
    const prev = bucket[bucket.length - 1];
    if (prev && prev.speaker !== word.speaker) {
      flush();
    }
    bucket.push(word);
  }
  flush();
  return segments;
}
function distanceToSegment(seg, point) {
  if (point < seg.startSec) return seg.startSec - point;
  if (point > seg.endSec) return point - seg.endSec;
  return 0;
}
function assignWordsToSegments(segments, topWords) {
  if (topWords.length === 0) return segments;
  if (segments.length === 0) return groupWordsIntoSpeakerSegments(topWords);
  const buckets = segments.map(() => []);
  let chronological = true;
  for (let i = 1; i < segments.length; i++) {
    if (segments[i].startSec < segments[i - 1].startSec) {
      chronological = false;
      break;
    }
  }
  let cursor = 0;
  for (const word of topWords) {
    const midpoint = (word.startSec + word.endSec) / 2;
    let matchedIndex = 0;
    if (chronological) {
      while (cursor > 0 && midpoint < segments[cursor].startSec - 0.05 && distanceToSegment(segments[cursor - 1], midpoint) < distanceToSegment(segments[cursor], midpoint)) {
        cursor--;
      }
      while (cursor + 1 < segments.length && midpoint > segments[cursor].endSec && (midpoint >= segments[cursor + 1].startSec - 0.05 || distanceToSegment(segments[cursor + 1], midpoint) <= distanceToSegment(segments[cursor], midpoint))) {
        cursor++;
      }
      matchedIndex = cursor;
    } else {
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let i = 0; i < segments.length; i++) {
        const dist = distanceToSegment(segments[i], midpoint);
        if (dist < bestDistance) {
          bestDistance = dist;
          matchedIndex = i;
        }
      }
    }
    buckets[matchedIndex].push(word);
  }
  return segments.map((seg, idx) => {
    const assigned = buckets[idx];
    if (assigned.length === 0) return seg;
    const withSpeaker = assigned.map(
      (w) => w.speaker || !seg.speaker ? w : { ...w, speaker: seg.speaker }
    );
    const updated = {
      ...seg,
      words: withSpeaker
    };
    if (!updated.speaker && withSpeaker[0]?.speaker) {
      updated.speaker = withSpeaker[0].speaker;
    }
    return updated;
  });
}
function hasStringSpeakerInWhisperPayload(root) {
  if (!Array.isArray(root.segments)) return false;
  for (const item of root.segments) {
    if (!isRecord(item)) continue;
    if (typeof item.speaker === "string" && item.speaker.trim().length > 0) {
      return true;
    }
    if (Array.isArray(item.words)) {
      for (const w of item.words) {
        if (isRecord(w) && typeof w.speaker === "string" && w.speaker.trim().length > 0) {
          return true;
        }
      }
    }
  }
  const extraWordLists = [root.words, root.word_segments];
  for (const list of extraWordLists) {
    if (!Array.isArray(list)) continue;
    for (const w of list) {
      if (isRecord(w) && typeof w.speaker === "string" && w.speaker.trim().length > 0) {
        return true;
      }
    }
  }
  return false;
}
function isAssemblyAiWordsPayload(root, rawWords) {
  if (rawWords.length === 0) return false;
  if (typeof root.audio_duration === "number" || typeof root.acoustic_model === "string" || typeof root.language_model === "string") {
    return true;
  }
  let timedCount = 0;
  let allIntegers = true;
  let usesTextField = false;
  let maxSpan = 0;
  let maxEnd = 0;
  for (const item of rawWords) {
    if (!isRecord(item)) continue;
    const start = toFiniteNumber(item.start);
    const end = toFiniteNumber(item.end);
    if (start === null || end === null) continue;
    timedCount++;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
      allIntegers = false;
      break;
    }
    if (typeof item.text === "string" && item.word === void 0) {
      usesTextField = true;
    }
    maxSpan = Math.max(maxSpan, end - start);
    maxEnd = Math.max(maxEnd, end);
  }
  if (timedCount === 0 || !allIntegers) return false;
  return usesTextField || maxSpan >= 40 || maxEnd >= 120;
}
function extractWhisperStyleSegments(root) {
  const durationHintSec = toFiniteNumber(root.duration) ?? void 0;
  const rawSegments = Array.isArray(root.segments) ? root.segments : [];
  const segments = [];
  let anyNestedWords = false;
  for (const item of rawSegments) {
    if (!isRecord(item)) continue;
    const rawStart = toFiniteNumber(item.start);
    const rawEnd = toFiniteNumber(item.end);
    if (rawStart === null || rawEnd === null) continue;
    const startSec = roundMicro(Math.max(0, rawStart));
    const endSec = roundMicro(Math.max(startSec, rawEnd));
    const speaker = normalizeSpeaker(item.speaker);
    const nestedWords = Array.isArray(item.words) ? normalizeWords(item.words, 1, speaker, { startSec, endSec }) : [];
    if (nestedWords.length > 0) anyNestedWords = true;
    const rawText = typeof item.text === "string" ? item.text.trim() : "";
    const text = rawText || joinTokens(nestedWords.map((w) => w.word));
    if (!text && nestedWords.length === 0) continue;
    const seg = { startSec, endSec, text };
    if (speaker ?? nestedWords[0]?.speaker) {
      seg.speaker = speaker ?? nestedWords[0]?.speaker;
    }
    if (nestedWords.length > 0) {
      seg.words = nestedWords;
    }
    segments.push(seg);
  }
  const topWordSource = Array.isArray(root.words) ? root.words : Array.isArray(root.word_segments) ? root.word_segments : null;
  if (!anyNestedWords && topWordSource) {
    const topWords = normalizeWords(topWordSource, 1);
    if (topWords.length > 0) {
      return {
        segments: assignWordsToSegments(segments, topWords),
        durationHintSec
      };
    }
  }
  return { segments, durationHintSec };
}
function extractWhisperCppSegments(root) {
  const rawItems = Array.isArray(root.transcription) ? root.transcription : [];
  const segments = [];
  for (const item of rawItems) {
    if (!isRecord(item)) continue;
    let startSec = null;
    let endSec = null;
    if (isRecord(item.offsets)) {
      const fromMs = toFiniteNumber(item.offsets.from);
      const toMs = toFiniteNumber(item.offsets.to);
      if (fromMs !== null && toMs !== null) {
        startSec = fromMs / 1e3;
        endSec = toMs / 1e3;
      }
    }
    if ((startSec === null || endSec === null) && isRecord(item.timestamps)) {
      const fromTs = parseTimestampString(item.timestamps.from);
      const toTs = parseTimestampString(item.timestamps.to);
      if (fromTs !== null && toTs !== null) {
        startSec = fromTs;
        endSec = toTs;
      }
    }
    if (startSec === null || endSec === null) continue;
    const text = typeof item.text === "string" ? item.text.replace(/\s+/g, " ").trim() : "";
    if (!text) continue;
    const safeStart = roundMicro(Math.max(0, startSec));
    const safeEnd = roundMicro(Math.max(safeStart, endSec));
    const seg = { startSec: safeStart, endSec: safeEnd, text };
    const speaker = normalizeSpeaker(item.speaker);
    if (speaker) seg.speaker = speaker;
    segments.push(seg);
  }
  return { segments };
}
function extractDeepgramSegments(root) {
  const results = isRecord(root.results) ? root.results : {};
  const metadata = isRecord(root.metadata) ? root.metadata : {};
  const durationHintSec = toFiniteNumber(metadata.duration) ?? void 0;
  const channels = Array.isArray(results.channels) ? results.channels : [];
  const firstChannel = isRecord(channels[0]) ? channels[0] : {};
  const alternatives = Array.isArray(firstChannel.alternatives) ? firstChannel.alternatives : [];
  const firstAlt = isRecord(alternatives[0]) ? alternatives[0] : {};
  const channelWords = Array.isArray(firstAlt.words) ? normalizeWords(firstAlt.words, 1) : [];
  if (Array.isArray(results.utterances) && results.utterances.length > 0) {
    const segments = [];
    for (const utt of results.utterances) {
      if (!isRecord(utt)) continue;
      const rawStart = toFiniteNumber(utt.start);
      const rawEnd = toFiniteNumber(utt.end);
      if (rawStart === null || rawEnd === null) continue;
      const startSec = roundMicro(Math.max(0, rawStart));
      const endSec = roundMicro(Math.max(startSec, rawEnd));
      const speaker = normalizeSpeaker(utt.speaker);
      const uttWords = Array.isArray(utt.words) ? normalizeWords(utt.words, 1, speaker, { startSec, endSec }) : [];
      const rawTranscript = typeof utt.transcript === "string" ? utt.transcript.trim() : typeof utt.text === "string" ? utt.text.trim() : "";
      const text = rawTranscript || joinTokens(uttWords.map((w) => w.word));
      if (!text && uttWords.length === 0) continue;
      const seg = { startSec, endSec, text };
      if (speaker ?? uttWords[0]?.speaker) {
        seg.speaker = speaker ?? uttWords[0]?.speaker;
      }
      if (uttWords.length > 0) seg.words = uttWords;
      segments.push(seg);
    }
    if (segments.length > 0) {
      const needsWords = segments.every((s) => !s.words || s.words.length === 0);
      return {
        segments: needsWords && channelWords.length > 0 ? assignWordsToSegments(segments, channelWords) : segments,
        durationHintSec
      };
    }
  }
  if (isRecord(firstAlt.paragraphs) && Array.isArray(firstAlt.paragraphs.paragraphs)) {
    const paraSegments = [];
    for (const para of firstAlt.paragraphs.paragraphs) {
      if (!isRecord(para)) continue;
      const speaker = normalizeSpeaker(para.speaker);
      if (Array.isArray(para.sentences) && para.sentences.length > 0) {
        for (const sent of para.sentences) {
          if (!isRecord(sent)) continue;
          const sStart = toFiniteNumber(sent.start);
          const sEnd = toFiniteNumber(sent.end);
          const sText = typeof sent.text === "string" ? sent.text.trim() : "";
          if (sStart === null || sEnd === null || !sText) continue;
          const seg = {
            startSec: roundMicro(Math.max(0, sStart)),
            endSec: roundMicro(Math.max(0, sStart, sEnd)),
            text: sText
          };
          if (speaker) seg.speaker = speaker;
          paraSegments.push(seg);
        }
      }
    }
    if (paraSegments.length > 0) {
      return {
        segments: channelWords.length > 0 ? assignWordsToSegments(paraSegments, channelWords) : paraSegments,
        durationHintSec
      };
    }
  }
  if (channelWords.length > 0) {
    return {
      segments: groupWordsIntoSpeakerSegments(channelWords),
      durationHintSec
    };
  }
  const transcript = typeof firstAlt.transcript === "string" ? firstAlt.transcript.trim() : "";
  if (transcript) {
    return {
      segments: [
        {
          startSec: 0,
          endSec: Math.max(0.5, durationHintSec ?? 5),
          text: transcript
        }
      ],
      durationHintSec
    };
  }
  return { segments: [], durationHintSec };
}
function extractAssemblyAiSegments(root) {
  const topWords = Array.isArray(root.words) ? normalizeWords(root.words, 1e-3) : [];
  if (Array.isArray(root.utterances) && root.utterances.length > 0) {
    const segments = [];
    for (const utt of root.utterances) {
      if (!isRecord(utt)) continue;
      const rawStart = toFiniteNumber(utt.start);
      const rawEnd = toFiniteNumber(utt.end);
      if (rawStart === null || rawEnd === null) continue;
      const startSec = roundMicro(Math.max(0, rawStart / 1e3));
      const endSec = roundMicro(Math.max(startSec, rawEnd / 1e3));
      const speaker = normalizeSpeaker(utt.speaker);
      const uttWords = Array.isArray(utt.words) ? normalizeWords(utt.words, 1e-3, speaker, { startSec, endSec }) : [];
      const rawText = typeof utt.text === "string" ? utt.text.trim() : "";
      const text = rawText || joinTokens(uttWords.map((w) => w.word));
      if (!text && uttWords.length === 0) continue;
      const seg = { startSec, endSec, text };
      if (speaker ?? uttWords[0]?.speaker) {
        seg.speaker = speaker ?? uttWords[0]?.speaker;
      }
      if (uttWords.length > 0) seg.words = uttWords;
      segments.push(seg);
    }
    const needsTopWords = segments.every((s) => !s.words || s.words.length === 0);
    return {
      segments: needsTopWords && topWords.length > 0 ? assignWordsToSegments(segments, topWords) : segments
    };
  }
  return {
    segments: groupWordsIntoSpeakerSegments(topWords)
  };
}
function readCapCutCaptionText(content) {
  if (isRecord(content) && typeof content.text === "string") {
    return content.text.replace(/\s+/g, " ").trim();
  }
  if (typeof content !== "string") return "";
  const trimmed = content.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (isRecord(parsed) && typeof parsed.text === "string") {
        return parsed.text.replace(/\s+/g, " ").trim();
      }
    } catch {
    }
  }
  return trimmed.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function extractCapCutDraftSegments(root) {
  const materials = isRecord(root.materials) ? root.materials : {};
  const texts = Array.isArray(materials.texts) ? materials.texts : [];
  const textById = /* @__PURE__ */ new Map();
  for (const item of texts) {
    if (!isRecord(item) || typeof item.id !== "string" || item.id.length === 0) continue;
    const text = readCapCutCaptionText(item.content);
    if (!text) continue;
    textById.set(item.id, text);
  }
  const tracks = Array.isArray(root.tracks) ? root.tracks : [];
  const segments = [];
  for (const track of tracks) {
    if (!isRecord(track) || !Array.isArray(track.segments)) continue;
    for (const segment of track.segments) {
      if (!isRecord(segment) || typeof segment.material_id !== "string") continue;
      const text = textById.get(segment.material_id);
      if (!text) continue;
      const range = isRecord(segment.target_timerange) ? segment.target_timerange : null;
      const startUs = range ? toFiniteNumber(range.start) : null;
      const durationUs = range ? toFiniteNumber(range.duration) : null;
      if (startUs === null || durationUs === null || durationUs < 0) continue;
      const startSec = roundMicro(Math.max(0, startUs / 1e6));
      const endSec = roundMicro(Math.max(startSec, (startUs + durationUs) / 1e6));
      segments.push({ startSec, endSec, text });
    }
  }
  segments.sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
  return { segments };
}
function isOpenAiDiarizedJson(root) {
  if (!Array.isArray(root.segments) || root.segments.length === 0) return false;
  let speakerSegments = 0;
  let diarizedMarkers = 0;
  let nestedWordLists = 0;
  for (const item of root.segments) {
    if (!isRecord(item)) continue;
    if (Array.isArray(item.words) && item.words.length > 0) nestedWordLists += 1;
    const start = toFiniteNumber(item.start);
    const end = toFiniteNumber(item.end);
    const text = typeof item.text === "string" ? item.text.trim() : "";
    const speaker = typeof item.speaker === "string" ? item.speaker.trim() : "";
    if (start !== null && end !== null && text && speaker) speakerSegments += 1;
    if (typeof item.id === "string" && /^seg_\d+$/.test(item.id)) diarizedMarkers += 1;
    if (item.type === "transcript.text.segment") diarizedMarkers += 1;
  }
  return nestedWordLists === 0 && speakerSegments > 0 && diarizedMarkers > 0;
}
function looksLikeEncryptedProjectFile(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return false;
  if (trimmed.length >= 80) return true;
  for (const char of trimmed) {
    const code = char.charCodeAt(0);
    const printable = code === 9 || code === 10 || code === 13 || code >= 32 && code <= 126;
    if (!printable) return true;
  }
  return false;
}
var ENCRYPTED_DRAFT_ERROR = "This file is not readable JSON. CapCut and Jianying 6.0+ project files, and template-based drafts, are encrypted and cannot be converted. Copy a plain-text draft_content.json (Windows) or draft_info.json (macOS) from a non-template project.";
var EMPTY_CAPCUT_ERROR = "Detected a CapCut or Jianying draft, but no readable caption text was placed on the timeline. CapCut and Jianying 6.0+ project files and template-based drafts are encrypted and cannot be read. Use a plain-text draft_content.json or draft_info.json.";
var DIALECT_ADAPTERS = [
  {
    id: "whisper-cpp",
    label: DIALECT_LABELS["whisper-cpp"],
    matches: (root) => Array.isArray(root.transcription),
    extract: extractWhisperCppSegments
  },
  {
    id: "deepgram-nova",
    label: DIALECT_LABELS["deepgram-nova"],
    matches: (root) => isRecord(root.results) && (Array.isArray(root.results.channels) || Array.isArray(root.results.utterances)),
    extract: extractDeepgramSegments
  },
  {
    id: "assemblyai-utterances",
    label: DIALECT_LABELS["assemblyai-utterances"],
    matches: (root) => Array.isArray(root.utterances) || !Array.isArray(root.segments) && Array.isArray(root.words) && isAssemblyAiWordsPayload(root, root.words),
    extract: extractAssemblyAiSegments
  },
  {
    id: "capcut-draft",
    label: DIALECT_LABELS["capcut-draft"],
    matches: (root) => isRecord(root.materials) && Array.isArray(root.materials.texts) && Array.isArray(root.tracks),
    extract: extractCapCutDraftSegments
  },
  {
    id: "openai-diarized-json",
    label: DIALECT_LABELS["openai-diarized-json"],
    matches: isOpenAiDiarizedJson,
    extract: extractWhisperStyleSegments
  },
  {
    id: "whisperx-diarized",
    label: DIALECT_LABELS["whisperx-diarized"],
    matches: (root) => hasStringSpeakerInWhisperPayload(root),
    extract: extractWhisperStyleSegments
  },
  {
    id: "openai-verbose-json",
    label: DIALECT_LABELS["openai-verbose-json"],
    matches: (root) => Array.isArray(root.segments) || Array.isArray(root.words) || Array.isArray(root.word_segments),
    extract: extractWhisperStyleSegments
  }
];
function formatTimestamp(seconds, format) {
  const clamped = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const totalMs = Math.round(clamped * 1e3);
  const ms = totalMs % 1e3;
  const totalSeconds = Math.floor(totalMs / 1e3);
  const secs = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mins = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const separator = format === "srt" ? "," : ".";
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}${separator}${String(ms).padStart(3, "0")}`;
}
function parseAsrJson(rawJsonText) {
  if (typeof rawJsonText !== "string" || rawJsonText.trim().length === 0) {
    return {
      ok: false,
      error: "Empty input. Paste or upload a JSON transcript payload to convert."
    };
  }
  const normalizedJsonText = rawJsonText.replace(/^\uFEFF/, "");
  if (looksLikeEncryptedProjectFile(normalizedJsonText)) {
    return {
      ok: false,
      error: ENCRYPTED_DRAFT_ERROR
    };
  }
  let parsedJson;
  try {
    parsedJson = JSON.parse(normalizedJsonText);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unexpected token";
    return {
      ok: false,
      error: `Invalid JSON syntax (${detail}). Check for trailing commas or truncated brackets.`
    };
  }
  if (!isRecord(parsedJson)) {
    return {
      ok: false,
      error: "Unrecognized JSON root shape. Expected an ASR JSON object with segments, words, transcription, results, or utterances."
    };
  }
  const adapter = DIALECT_ADAPTERS.find((candidate) => candidate.matches(parsedJson));
  if (!adapter) {
    return {
      ok: false,
      error: "Unrecognized ASR JSON dialect. Supported formats: OpenAI Whisper verbose_json, OpenAI diarized_json, WhisperX diarized, whisper.cpp, Deepgram Nova, AssemblyAI utterances/words, and plain CapCut draft_content.json."
    };
  }
  const { segments, durationHintSec } = adapter.extract(parsedJson);
  if (segments.length === 0) {
    return {
      ok: false,
      error: adapter.id === "capcut-draft" ? EMPTY_CAPCUT_ERROR : `Detected ${adapter.label}, but found no timed transcript segments or words.`
    };
  }
  const speakerSet = /* @__PURE__ */ new Set();
  let maxEndSec = 0;
  let wordTimingAvailable = false;
  for (const seg of segments) {
    maxEndSec = Math.max(maxEndSec, seg.endSec);
    if (seg.speaker) speakerSet.add(seg.speaker);
    if (seg.words && seg.words.length > 0) {
      wordTimingAvailable = true;
      for (const w of seg.words) {
        maxEndSec = Math.max(maxEndSec, w.endSec);
        if (w.speaker) speakerSet.add(w.speaker);
      }
    }
  }
  const durationSec = roundMicro(
    durationHintSec !== void 0 && durationHintSec >= maxEndSec ? durationHintSec : maxEndSec
  );
  return {
    ok: true,
    dialect: adapter.id,
    dialectLabel: adapter.label,
    durationSec,
    wordTimingAvailable,
    speakerLabels: Array.from(speakerSet),
    segments
  };
}
function splitOverlongWord(word, maxChars) {
  if (word.word.length <= maxChars || !CJK_CHAR_RE.test(word.word)) {
    return [word];
  }
  const units = tokenizeSegmentText(word.word, maxChars);
  const pieces = [];
  let current = "";
  for (const unit of units) {
    const candidate = appendToken(current, unit);
    if (!current || candidate.length <= maxChars) {
      current = candidate;
    } else {
      pieces.push(current);
      current = unit;
    }
  }
  if (current) pieces.push(current);
  if (pieces.length <= 1) return [word];
  const totalChars = pieces.reduce((sum, p) => sum + p.length, 0);
  const span = Math.max(0, word.endSec - word.startSec);
  let consumed = 0;
  return pieces.map((piece, idx) => {
    const startSec = roundMicro(word.startSec + consumed / totalChars * span);
    consumed += piece.length;
    const endSec = idx === pieces.length - 1 ? word.endSec : roundMicro(word.startSec + consumed / totalChars * span);
    const sliced = { word: piece, startSec, endSec };
    if (word.speaker) sliced.speaker = word.speaker;
    return sliced;
  });
}
function tokenizeSegmentText(text, maxCharsPerLine) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const units = [];
  let asciiBuffer = "";
  const flushAscii = () => {
    if (!asciiBuffer) return;
    units.push(asciiBuffer);
    asciiBuffer = "";
  };
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === " ") {
      flushAscii();
      continue;
    }
    if (isCjkChar(ch)) {
      flushAscii();
      let unit = ch;
      while (i + 1 < normalized.length && CJK_CLOSING_PUNCT_RE.test(normalized[i + 1]) && unit.length < maxCharsPerLine) {
        unit += normalized[i + 1];
        i++;
      }
      units.push(unit);
    } else {
      asciiBuffer += ch;
    }
  }
  flushAscii();
  return units;
}
function reflowCues(parsed, options) {
  const maxCharsPerLine = Math.max(4, Math.floor(options.maxCharsPerLine || 42));
  const maxLinesPerCue = options.maxLinesPerCue === 1 ? 1 : 2;
  const maxCueDurationSec = options.maxCueDurationSec > 0 ? options.maxCueDurationSec : 5;
  const pauseSplitGapSec = options.pauseSplitGapSec > 0 ? options.pauseSplitGapSec : 0.6;
  const offsetSec = (Number.isFinite(options.offsetMs) ? options.offsetMs : 0) / 1e3;
  const drafts = [];
  let lastPrefixedSpeaker;
  const emitDraft = (startSec, endSec, lines, speaker, applyPrefix) => {
    const nonEmpty = lines.map((l) => l.trim()).filter((l) => l.length > 0);
    if (nonEmpty.length === 0) return;
    if (applyPrefix && speaker) {
      nonEmpty[0] = `[${speaker}] ${nonEmpty[0]}`;
      lastPrefixedSpeaker = speaker;
    } else if (!speaker) {
      lastPrefixedSpeaker = void 0;
    }
    const draft = { startSec, endSec, lines: nonEmpty };
    if (speaker) draft.speaker = speaker;
    drafts.push(draft);
  };
  for (const segment of parsed.segments) {
    const hasWords = parsed.wordTimingAvailable && Array.isArray(segment.words) && segment.words.length > 0;
    if (hasWords) {
      const expandedWords = [];
      for (const rawWord of segment.words) {
        const withSpeaker = rawWord.speaker || !segment.speaker ? rawWord : { ...rawWord, speaker: segment.speaker };
        expandedWords.push(...splitOverlongWord(withSpeaker, maxCharsPerLine));
      }
      let activeSpeaker;
      let activeNeedsPrefix = false;
      let activeLines = [];
      let cueStartSec = 0;
      let cueEndSec = 0;
      let prevWordEndSec = 0;
      const flushWordCue = () => {
        if (activeLines.length === 0) return;
        emitDraft(
          cueStartSec,
          cueEndSec,
          activeLines,
          activeSpeaker,
          activeNeedsPrefix
        );
        activeLines = [];
      };
      const startWordCue = (word) => {
        activeSpeaker = word.speaker ?? segment.speaker;
        activeNeedsPrefix = options.includeSpeakerPrefix && Boolean(activeSpeaker) && activeSpeaker !== lastPrefixedSpeaker;
        activeLines = [word.word];
        cueStartSec = word.startSec;
        cueEndSec = word.endSec;
        prevWordEndSec = word.endSec;
      };
      for (const word of expandedWords) {
        const wordSpeaker = word.speaker ?? segment.speaker;
        if (activeLines.length === 0) {
          startWordCue(word);
          continue;
        }
        const speakerChanged = wordSpeaker !== activeSpeaker;
        const pauseExceeded = word.startSec - prevWordEndSec >= pauseSplitGapSec - 1e-6;
        const durationExceeded = word.endSec - cueStartSec > maxCueDurationSec + 1e-6;
        if (speakerChanged || pauseExceeded || durationExceeded) {
          flushWordCue();
          startWordCue(word);
          continue;
        }
        const lineIdx = activeLines.length - 1;
        const prefixReserve = lineIdx === 0 && activeNeedsPrefix && activeSpeaker ? `[${activeSpeaker}] `.length : 0;
        const candidate = appendToken(activeLines[lineIdx], word.word);
        if (prefixReserve + candidate.length <= maxCharsPerLine) {
          activeLines[lineIdx] = candidate;
          cueEndSec = Math.max(cueEndSec, word.endSec);
          prevWordEndSec = word.endSec;
        } else if (activeLines.length < maxLinesPerCue) {
          activeLines.push(word.word);
          cueEndSec = Math.max(cueEndSec, word.endSec);
          prevWordEndSec = word.endSec;
        } else {
          flushWordCue();
          startWordCue(word);
        }
      }
      flushWordCue();
    } else {
      const units = tokenizeSegmentText(segment.text, maxCharsPerLine);
      if (units.length === 0) continue;
      const segSpeaker = segment.speaker;
      const firstChunkNeedsPrefix = options.includeSpeakerPrefix && Boolean(segSpeaker) && segSpeaker !== lastPrefixedSpeaker;
      const chunks = [];
      let currentLines = [];
      let chunkApplyPrefix = firstChunkNeedsPrefix;
      const flushTextChunk = () => {
        if (currentLines.length === 0) return;
        const charCount = Math.max(
          1,
          currentLines.reduce((sum, line) => sum + line.length, 0)
        );
        chunks.push({
          lines: currentLines,
          charCount,
          applyPrefix: chunkApplyPrefix
        });
        currentLines = [];
        chunkApplyPrefix = false;
      };
      for (const unit of units) {
        if (currentLines.length === 0) {
          currentLines = [unit];
          continue;
        }
        const lineIdx = currentLines.length - 1;
        const prefixReserve = lineIdx === 0 && chunkApplyPrefix && segSpeaker ? `[${segSpeaker}] `.length : 0;
        const candidate = appendToken(currentLines[lineIdx], unit);
        if (prefixReserve + candidate.length <= maxCharsPerLine) {
          currentLines[lineIdx] = candidate;
        } else if (currentLines.length < maxLinesPerCue) {
          currentLines.push(unit);
        } else {
          flushTextChunk();
          currentLines = [unit];
        }
      }
      flushTextChunk();
      const totalChars = chunks.reduce((sum, chunk) => sum + chunk.charCount, 0);
      const segSpan = Math.max(0, segment.endSec - segment.startSec);
      let consumedChars = 0;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkStart = segment.startSec + consumedChars / totalChars * segSpan;
        consumedChars += chunk.charCount;
        const chunkEnd = i === chunks.length - 1 ? segment.endSec : segment.startSec + consumedChars / totalChars * segSpan;
        emitDraft(
          chunkStart,
          chunkEnd,
          chunk.lines,
          segSpeaker,
          chunk.applyPrefix
        );
      }
    }
  }
  return drafts.map((draft, idx) => {
    const startSec = roundMicro(Math.max(0, draft.startSec + offsetSec));
    const endSec = roundMicro(Math.max(startSec + 0.05, draft.endSec + offsetSec));
    const cue = {
      index: idx + 1,
      startSec,
      endSec,
      lines: draft.lines
    };
    if (draft.speaker) cue.speaker = draft.speaker;
    return cue;
  });
}
function escapeCsvField(value) {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
function serializeCues(cues, format) {
  if (format === "srt") {
    return cues.map((cue, idx) => {
      const cueNumber = cue.index > 0 ? cue.index : idx + 1;
      const range = `${formatTimestamp(cue.startSec, "srt")} --> ${formatTimestamp(cue.endSec, "srt")}`;
      return `${cueNumber}
${range}
${cue.lines.join("\n")}`;
    }).join("\n\n");
  }
  if (format === "vtt") {
    if (cues.length === 0) return "WEBVTT\n\n";
    const body = cues.map((cue) => {
      const range = `${formatTimestamp(cue.startSec, "vtt")} --> ${formatTimestamp(cue.endSec, "vtt")}`;
      return `${range}
${cue.lines.join("\n")}`;
    }).join("\n\n");
    return `WEBVTT

${body}`;
  }
  if (format === "txt") {
    return cues.map((cue) => {
      const stamp = formatTimestamp(cue.startSec, "vtt").slice(0, 8);
      const text = cue.lines.join(" ").trim();
      const speakerPrefix = cue.speaker && !text.startsWith(`[${cue.speaker}] `) ? `[${cue.speaker}] ` : "";
      return `[${stamp}] ${speakerPrefix}${text}`;
    }).join("\n");
  }
  const header = "index,start,end,speaker,text";
  const rows = cues.map((cue, idx) => {
    const cueNumber = cue.index > 0 ? cue.index : idx + 1;
    const start = formatTimestamp(cue.startSec, "vtt");
    const end = formatTimestamp(cue.endSec, "vtt");
    const speaker = escapeCsvField(cue.speaker ?? "");
    const text = escapeCsvField(cue.lines.join(" "));
    return `${cueNumber},${start},${end},${speaker},${text}`;
  });
  return [header, ...rows].join("\n");
}
function convertAsrJson(rawJsonText, options) {
  const parsed = parseAsrJson(rawJsonText);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  const cues = reflowCues(parsed, options);
  const output = serializeCues(cues, options.format);
  return {
    ok: true,
    parsed,
    cues,
    output
  };
}

// src/cli.ts
var CLI_VERSION = "0.1.0";
var HELP_TEXT = `json-to-srt - Convert Whisper and ASR JSON transcripts into subtitles

USAGE:
  json-to-srt [options]
  json-to-srt --input transcript.json --format srt --output transcript.srt
  cat transcript.json | json-to-srt --format vtt > transcript.vtt

OPTIONS:
  -i, --input <file>        Input JSON file path (reads from stdin if omitted or "-")
  -o, --output <file>       Output subtitle file path (writes to stdout if omitted)
  -f, --format <format>     Output format: srt, vtt, txt, csv (default: srt)
      --max-chars <n>       Max characters per line (default: 42)
      --max-lines <1|2>     Max lines per cue (default: 2)
      --offset-ms <n>       Timestamp offset shift in milliseconds (default: 0)
      --speaker             Include [SPEAKER_XX] prefixes in cues
      --no-speaker          Omit speaker prefixes (default)
  -h, --help                Show this help message
  -v, --version             Show version number

BROWSER APP:
  Prefer a visual interface or zero-upload browser conversion?
  Visit https://jsontosrt.com for instant client-side conversion with live preview.
`;
function parseCliArgs(args) {
  const parsed = {
    help: false,
    version: false,
    format: "srt",
    maxChars: 42,
    maxLines: 2,
    offsetMs: 0,
    speaker: false
  };
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") {
      parsed.help = true;
      i += 1;
      continue;
    }
    if (arg === "-v" || arg === "--version") {
      parsed.version = true;
      i += 1;
      continue;
    }
    if (arg === "--speaker") {
      parsed.speaker = true;
      i += 1;
      continue;
    }
    if (arg === "--no-speaker") {
      parsed.speaker = false;
      i += 1;
      continue;
    }
    if (arg === "-i" || arg === "--input") {
      if (i + 1 >= args.length) {
        throw new Error('Option "--input" requires a file path argument.');
      }
      parsed.input = args[i + 1];
      i += 2;
      continue;
    }
    if (arg.startsWith("--input=")) {
      parsed.input = arg.slice("--input=".length);
      i += 1;
      continue;
    }
    if (arg === "-o" || arg === "--output") {
      if (i + 1 >= args.length) {
        throw new Error('Option "--output" requires a file path argument.');
      }
      parsed.output = args[i + 1];
      i += 2;
      continue;
    }
    if (arg.startsWith("--output=")) {
      parsed.output = arg.slice("--output=".length);
      i += 1;
      continue;
    }
    if (arg === "-f" || arg === "--format") {
      if (i + 1 >= args.length) {
        throw new Error('Option "--format" requires a format argument (srt, vtt, txt, csv).');
      }
      const val = args[i + 1].toLowerCase();
      if (val !== "srt" && val !== "vtt" && val !== "txt" && val !== "csv") {
        throw new Error(`Invalid format "${val}". Allowed formats: srt, vtt, txt, csv.`);
      }
      parsed.format = val;
      i += 2;
      continue;
    }
    if (arg.startsWith("--format=")) {
      const val = arg.slice("--format=".length).toLowerCase();
      if (val !== "srt" && val !== "vtt" && val !== "txt" && val !== "csv") {
        throw new Error(`Invalid format "${val}". Allowed formats: srt, vtt, txt, csv.`);
      }
      parsed.format = val;
      i += 1;
      continue;
    }
    if (arg === "--max-chars") {
      if (i + 1 >= args.length) {
        throw new Error('Option "--max-chars" requires an integer argument.');
      }
      const val = parseInt(args[i + 1], 10);
      if (Number.isNaN(val) || val < 1) {
        throw new Error(`Invalid --max-chars value "${args[i + 1]}". Must be a positive integer.`);
      }
      parsed.maxChars = val;
      i += 2;
      continue;
    }
    if (arg.startsWith("--max-chars=")) {
      const rawVal = arg.slice("--max-chars=".length);
      const val = parseInt(rawVal, 10);
      if (Number.isNaN(val) || val < 1) {
        throw new Error(`Invalid --max-chars value "${rawVal}". Must be a positive integer.`);
      }
      parsed.maxChars = val;
      i += 1;
      continue;
    }
    if (arg === "--max-lines") {
      if (i + 1 >= args.length) {
        throw new Error('Option "--max-lines" requires an integer argument (1 or 2).');
      }
      const val = parseInt(args[i + 1], 10);
      if (val !== 1 && val !== 2) {
        throw new Error(`Invalid --max-lines value "${args[i + 1]}". Must be 1 or 2.`);
      }
      parsed.maxLines = val;
      i += 2;
      continue;
    }
    if (arg.startsWith("--max-lines=")) {
      const rawVal = arg.slice("--max-lines=".length);
      const val = parseInt(rawVal, 10);
      if (val !== 1 && val !== 2) {
        throw new Error(`Invalid --max-lines value "${rawVal}". Must be 1 or 2.`);
      }
      parsed.maxLines = val;
      i += 1;
      continue;
    }
    if (arg === "--offset-ms") {
      if (i + 1 >= args.length) {
        throw new Error('Option "--offset-ms" requires an integer argument.');
      }
      const val = parseInt(args[i + 1], 10);
      if (Number.isNaN(val)) {
        throw new Error(`Invalid --offset-ms value "${args[i + 1]}". Must be an integer.`);
      }
      parsed.offsetMs = val;
      i += 2;
      continue;
    }
    if (arg.startsWith("--offset-ms=")) {
      const rawVal = arg.slice("--offset-ms=".length);
      const val = parseInt(rawVal, 10);
      if (Number.isNaN(val)) {
        throw new Error(`Invalid --offset-ms value "${rawVal}". Must be an integer.`);
      }
      parsed.offsetMs = val;
      i += 1;
      continue;
    }
    if (!arg.startsWith("-") && !parsed.input) {
      parsed.input = arg;
      i += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return parsed;
}
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseCliArgs(argv);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}

`);
    process.stderr.write(HELP_TEXT);
    return 1;
  }
  if (options.help) {
    process.stdout.write(HELP_TEXT);
    return 0;
  }
  if (options.version) {
    process.stdout.write(`json-to-srt v${CLI_VERSION}
`);
    return 0;
  }
  let jsonText = "";
  if (options.input && options.input !== "-") {
    if (!existsSync(options.input)) {
      process.stderr.write(`Error: Input file not found: ${options.input}
`);
      return 1;
    }
    try {
      jsonText = readFileSync(options.input, "utf8");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error reading file ${options.input}: ${message}
`);
      return 1;
    }
  } else {
    if (process.stdin.isTTY) {
      process.stderr.write("Error: No input file specified and stdin is empty.\n\n");
      process.stderr.write(HELP_TEXT);
      return 1;
    }
    jsonText = await readStdin();
  }
  if (!jsonText.trim()) {
    process.stderr.write("Error: Input transcript JSON is empty.\n");
    return 1;
  }
  const cueOptions = {
    format: options.format,
    maxCharsPerLine: options.maxChars,
    maxLinesPerCue: options.maxLines,
    maxCueDurationSec: 6,
    pauseSplitGapSec: 0.6,
    offsetMs: options.offsetMs,
    includeSpeakerPrefix: options.speaker
  };
  const result = convertAsrJson(jsonText, cueOptions);
  if (!result.ok) {
    process.stderr.write(`Error: ${result.error}
`);
    return 1;
  }
  const formattedOutput = result.output.endsWith("\n") ? result.output : `${result.output}
`;
  if (options.output) {
    try {
      writeFileSync(options.output, formattedOutput, "utf8");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error writing output file ${options.output}: ${message}
`);
      return 1;
    }
  } else {
    process.stdout.write(formattedOutput);
  }
  return 0;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => {
    if (code !== 0) {
      process.exit(code);
    }
  });
}
export {
  CLI_VERSION,
  HELP_TEXT,
  main,
  parseCliArgs,
  readStdin
};
