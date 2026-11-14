#!/usr/bin/env node

// src/cli.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";

// src/lib/timeline-qc.ts
var EPSILON = 1e-9;
var OVERLAP_TOLERANCE_SEC = 1e-6;
function isRepresentableSeconds(seconds) {
  if (!Number.isFinite(seconds)) return false;
  const milliseconds = Math.round(seconds * 1e3);
  return Number.isFinite(milliseconds) && Math.abs(milliseconds) <= Number.MAX_SAFE_INTEGER;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function describeValue(value) {
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (value === void 0) return "missing";
  return typeof value;
}
function describeKind(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? "a number" : "a non-finite number";
  }
  if (typeof value === "string") return "a string";
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}
function failureNote(required, unit) {
  if (required) return " The segment was omitted from the subtitle output.";
  if (unit === "word") return " Word timing was interpolated from nearby words.";
  return " The value was ignored in favour of a fallback timing source.";
}
function inspectTime(raw, options) {
  const { scale, index, field, required, unit, context } = options;
  const prefix = context ? `${context} ${field}` : `${unit.charAt(0).toUpperCase()}${unit.slice(1)} ${index} ${field}`;
  if (raw === void 0 || raw === null) {
    if (!required) return { seconds: null, omitted: false };
    return {
      seconds: null,
      omitted: true,
      issue: {
        code: "invalid-time",
        severity: "error",
        scope: "segment",
        index,
        field,
        value: describeValue(raw),
        message: `${prefix} is ${describeValue(raw)}.${failureNote(required, unit)}`
      }
    };
  }
  if (typeof raw !== "number") {
    return {
      seconds: null,
      omitted: required,
      issue: {
        code: "invalid-time",
        severity: required ? "error" : "warning",
        scope: "segment",
        index,
        field,
        value: describeValue(raw),
        message: `${prefix} is ${describeKind(raw)} (${describeValue(raw)}), not a JSON number.${failureNote(required, unit)}`
      }
    };
  }
  if (!Number.isFinite(raw)) {
    return {
      seconds: null,
      omitted: required,
      issue: {
        code: "invalid-time",
        severity: required ? "error" : "warning",
        scope: "segment",
        index,
        field,
        value: String(raw),
        message: `${prefix} is ${String(raw)}, which is not a finite number.${failureNote(required, unit)}`
      }
    };
  }
  const seconds = raw * scale;
  if (!isRepresentableSeconds(seconds)) {
    return {
      seconds: null,
      omitted: required,
      issue: {
        code: "unrepresentable-time",
        severity: required ? "error" : "warning",
        scope: "segment",
        index,
        field,
        value: String(raw),
        message: `${prefix} is ${String(raw)}, which overflows a millisecond subtitle timestamp.${failureNote(required, unit)}`
      }
    };
  }
  if (seconds < 0) {
    if (!required) {
      return {
        seconds: null,
        omitted: false,
        issue: {
          code: "negative-time",
          severity: "warning",
          scope: "segment",
          index,
          field,
          value: String(raw),
          message: `${prefix} is ${String(raw)} seconds before zero.${failureNote(required, unit)}`
        }
      };
    }
    return {
      seconds: 0,
      omitted: false,
      issue: {
        code: "negative-time",
        severity: "warning",
        scope: "segment",
        index,
        field,
        value: String(raw),
        message: `${prefix} is ${String(raw)}. It was clamped to 0.000 s in the subtitle output.`
      }
    };
  }
  return { seconds, omitted: false };
}
function compareRange(start, end, index, context) {
  if (start === null || end === null) return void 0;
  if (end < start - EPSILON) {
    return {
      code: "reversed-range",
      severity: "warning",
      scope: "segment",
      index,
      field: "range",
      value: `${start} -> ${end}`,
      message: `${context} ends at ${end} s before it starts at ${start} s. Timing was left unchanged for review.`
    };
  }
  if (Math.abs(end - start) < EPSILON) {
    return {
      code: "zero-duration",
      severity: "info",
      scope: "segment",
      index,
      field: "range",
      value: `${start} -> ${end}`,
      message: `${context} has zero duration at ${start} s. Timing was left unchanged for review.`
    };
  }
  return void 0;
}
function pushIssue(issues, issue) {
  if (issue) issues.push(issue);
}
function readUnitText(item) {
  const candidates = [item.text, item.transcript];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return "";
}
function countWords(item) {
  if (!Array.isArray(item.words)) return 0;
  let count = 0;
  for (const word of item.words) {
    if (!isRecord(word)) continue;
    if (typeof word.word === "string" && word.word.trim().length > 0) {
      count += 1;
    } else if (typeof word.text === "string" && word.text.trim().length > 0) {
      count += 1;
    }
  }
  return count;
}
function scanWhisperSegments(root) {
  const issues = [];
  const omitted = /* @__PURE__ */ new Set();
  let checked = 0;
  let anyNestedWords = false;
  const segments = Array.isArray(root.segments) ? root.segments : [];
  segments.forEach((item, idx) => {
    if (!isRecord(item)) return;
    const index = idx + 1;
    checked += 1;
    const start = inspectTime(item.start, {
      scale: 1,
      index,
      field: "start",
      required: true,
      unit: "segment"
    });
    const end = inspectTime(item.end, {
      scale: 1,
      index,
      field: "end",
      required: true,
      unit: "segment"
    });
    pushIssue(issues, start.issue);
    pushIssue(issues, end.issue);
    if (start.omitted || end.omitted) omitted.add(index);
    pushIssue(
      issues,
      compareRange(start.seconds, end.seconds, index, `Segment ${index}`)
    );
    if (Array.isArray(item.words)) {
      if (countWords(item) > 0) anyNestedWords = true;
      item.words.forEach((word, wordIdx) => {
        if (!isRecord(word)) return;
        const wordStart = inspectTime(word.start, {
          scale: 1,
          index,
          field: `words[${wordIdx + 1}].start`,
          required: false,
          unit: "word",
          context: `Segment ${index}`
        });
        const wordEnd = inspectTime(word.end, {
          scale: 1,
          index,
          field: `words[${wordIdx + 1}].end`,
          required: false,
          unit: "word",
          context: `Segment ${index}`
        });
        pushIssue(issues, wordStart.issue);
        pushIssue(issues, wordEnd.issue);
        pushIssue(
          issues,
          compareRange(
            wordStart.seconds,
            wordEnd.seconds,
            index,
            `Segment ${index} word ${wordIdx + 1}`
          )
        );
      });
    }
    if (!readUnitText(item) && countWords(item) === 0) {
      omitted.add(index);
      issues.push({
        code: "empty-segment",
        severity: "warning",
        scope: "segment",
        index,
        field: "text",
        message: `Segment ${index} has no caption text and no words. The segment was omitted from the subtitle output.`
      });
    }
  });
  const topWords = Array.isArray(root.words) ? root.words : Array.isArray(root.word_segments) ? root.word_segments : null;
  if (!anyNestedWords && topWords) {
    topWords.forEach((word, wordIdx) => {
      if (!isRecord(word)) return;
      const wordStart = inspectTime(word.start, {
        scale: 1,
        index: wordIdx + 1,
        field: "start",
        required: false,
        unit: "word",
        context: `Top-level word ${wordIdx + 1}`
      });
      const wordEnd = inspectTime(word.end, {
        scale: 1,
        index: wordIdx + 1,
        field: "end",
        required: false,
        unit: "word",
        context: `Top-level word ${wordIdx + 1}`
      });
      pushIssue(issues, wordStart.issue);
      pushIssue(issues, wordEnd.issue);
      pushIssue(
        issues,
        compareRange(
          wordStart.seconds,
          wordEnd.seconds,
          wordIdx + 1,
          `Top-level word ${wordIdx + 1}`
        )
      );
    });
  }
  return { issues, checkedSegments: checked, omittedSegments: omitted.size };
}
var TIMESTAMP_RE = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?$/;
function parseTimestampSeconds(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(TIMESTAMP_RE);
  if (!match) return null;
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = match[4] ? Number(match[4].padEnd(3, "0")) : 0;
  const total = hours * 3600 + minutes * 60 + seconds + millis / 1e3;
  return Number.isFinite(total) ? total : null;
}
function scanWhisperCpp(root) {
  const issues = [];
  const omitted = /* @__PURE__ */ new Set();
  let checked = 0;
  const items = Array.isArray(root.transcription) ? root.transcription : [];
  items.forEach((item, idx) => {
    if (!isRecord(item)) return;
    const index = idx + 1;
    checked += 1;
    let start = null;
    let end = null;
    let offsetIssue;
    if (isRecord(item.offsets)) {
      const from = inspectTime(item.offsets.from, {
        scale: 1e-3,
        index,
        field: "offsets.from",
        required: false,
        unit: "segment"
      });
      const to = inspectTime(item.offsets.to, {
        scale: 1e-3,
        index,
        field: "offsets.to",
        required: false,
        unit: "segment"
      });
      if (from.seconds !== null && to.seconds !== null) {
        start = from.seconds;
        end = to.seconds;
      } else {
        offsetIssue = from.issue ?? to.issue;
      }
    }
    if (start === null || end === null) {
      const fromTs = parseTimestampSeconds(isRecord(item.timestamps) ? item.timestamps.from : void 0);
      const toTs = parseTimestampSeconds(isRecord(item.timestamps) ? item.timestamps.to : void 0);
      if (fromTs !== null && toTs !== null) {
        start = fromTs;
        end = toTs;
        if (offsetIssue) {
          issues.push({
            ...offsetIssue,
            severity: "warning",
            message: `${offsetIssue.message} Timestamp strings were used instead.`
          });
        }
      } else {
        omitted.add(index);
        if (offsetIssue) {
          issues.push({
            ...offsetIssue,
            severity: "error",
            message: `${offsetIssue.message} No timestamp fallback was readable, so the segment was omitted from the subtitle output.`
          });
        } else {
          issues.push({
            code: "invalid-time",
            severity: "error",
            scope: "segment",
            index,
            field: "offsets",
            message: `Segment ${index} has neither readable millisecond offsets nor timestamp strings. The segment was omitted from the subtitle output.`
          });
        }
      }
    }
    pushIssue(issues, compareRange(start, end, index, `Segment ${index}`));
    if (!readUnitText(item)) {
      omitted.add(index);
      issues.push({
        code: "empty-segment",
        severity: "warning",
        scope: "segment",
        index,
        field: "text",
        message: `Segment ${index} has no caption text. The segment was omitted from the subtitle output.`
      });
    }
  });
  return { issues, checkedSegments: checked, omittedSegments: omitted.size };
}
function scanDeepgram(root) {
  const results = isRecord(root.results) ? root.results : {};
  const utterances = Array.isArray(results.utterances) ? results.utterances : [];
  if (utterances.length > 0) {
    const issues = [];
    const omitted = /* @__PURE__ */ new Set();
    utterances.forEach((item, idx) => {
      if (!isRecord(item)) return;
      const index = idx + 1;
      const start = inspectTime(item.start, {
        scale: 1,
        index,
        field: "start",
        required: true,
        unit: "utterance"
      });
      const end = inspectTime(item.end, {
        scale: 1,
        index,
        field: "end",
        required: true,
        unit: "utterance"
      });
      pushIssue(issues, start.issue);
      pushIssue(issues, end.issue);
      if (start.omitted || end.omitted) omitted.add(index);
      pushIssue(issues, compareRange(start.seconds, end.seconds, index, `Utterance ${index}`));
      if (!readUnitText(item) && countWords(item) === 0) {
        omitted.add(index);
        issues.push({
          code: "empty-segment",
          severity: "warning",
          scope: "segment",
          index,
          field: "text",
          message: `Utterance ${index} has no transcript text. The utterance was omitted from the subtitle output.`
        });
      }
    });
    return { issues, checkedSegments: utterances.length, omittedSegments: omitted.size };
  }
  const channels = Array.isArray(results.channels) ? results.channels : [];
  const firstChannel = isRecord(channels[0]) ? channels[0] : {};
  const alternatives = Array.isArray(firstChannel.alternatives) ? firstChannel.alternatives : [];
  const firstAlt = isRecord(alternatives[0]) ? alternatives[0] : {};
  const words = Array.isArray(firstAlt.words) ? firstAlt.words : [];
  if (words.length > 0) {
    return scanWordList(words, 1, "channel word");
  }
  return { issues: [], checkedSegments: 1, omittedSegments: 0 };
}
function scanWordList(words, scale, label) {
  const issues = [];
  words.forEach((item, idx) => {
    if (!isRecord(item)) return;
    const index = idx + 1;
    const start = inspectTime(item.start, {
      scale,
      index,
      field: "start",
      required: false,
      unit: "word",
      context: `${label} ${index}`
    });
    const end = inspectTime(item.end, {
      scale,
      index,
      field: "end",
      required: false,
      unit: "word",
      context: `${label} ${index}`
    });
    pushIssue(issues, start.issue);
    pushIssue(issues, end.issue);
    pushIssue(issues, compareRange(start.seconds, end.seconds, index, `${label} ${index}`));
  });
  return { issues, checkedSegments: words.length, omittedSegments: 0 };
}
function scanAssemblyAi(root) {
  const utterances = Array.isArray(root.utterances) ? root.utterances : [];
  if (utterances.length > 0) {
    const issues = [];
    const omitted = /* @__PURE__ */ new Set();
    utterances.forEach((item, idx) => {
      if (!isRecord(item)) return;
      const index = idx + 1;
      const start = inspectTime(item.start, {
        scale: 1e-3,
        index,
        field: "start",
        required: true,
        unit: "utterance"
      });
      const end = inspectTime(item.end, {
        scale: 1e-3,
        index,
        field: "end",
        required: true,
        unit: "utterance"
      });
      pushIssue(issues, start.issue);
      pushIssue(issues, end.issue);
      if (start.omitted || end.omitted) omitted.add(index);
      pushIssue(issues, compareRange(start.seconds, end.seconds, index, `Utterance ${index}`));
      if (!readUnitText(item) && countWords(item) === 0) {
        omitted.add(index);
        issues.push({
          code: "empty-segment",
          severity: "warning",
          scope: "segment",
          index,
          field: "text",
          message: `Utterance ${index} has no transcript text. The utterance was omitted from the subtitle output.`
        });
      }
    });
    return { issues, checkedSegments: utterances.length, omittedSegments: omitted.size };
  }
  const words = Array.isArray(root.words) ? root.words : [];
  if (words.length > 0) {
    const scale = typeof root.audio_duration === "number" || typeof root.acoustic_model === "string" || typeof root.language_model === "string" ? 1e-3 : 1;
    return scanWordList(words, scale, "Word");
  }
  return { issues: [], checkedSegments: 0, omittedSegments: 0 };
}
function hasCapCutText(content) {
  if (isRecord(content) && typeof content.text === "string") {
    return content.text.trim().length > 0;
  }
  if (typeof content === "string") return content.trim().length > 0;
  return false;
}
function scanCapCut(root) {
  const issues = [];
  const omitted = /* @__PURE__ */ new Set();
  const materials = isRecord(root.materials) ? root.materials : {};
  const texts = Array.isArray(materials.texts) ? materials.texts : [];
  const textById = /* @__PURE__ */ new Map();
  for (const item of texts) {
    if (!isRecord(item) || typeof item.id !== "string") continue;
    if (hasCapCutText(item.content)) textById.set(item.id, item.id);
  }
  let index = 0;
  const tracks = Array.isArray(root.tracks) ? root.tracks : [];
  for (const track of tracks) {
    if (!isRecord(track) || !Array.isArray(track.segments)) continue;
    for (const segment of track.segments) {
      if (!isRecord(segment) || typeof segment.material_id !== "string") continue;
      if (!textById.has(segment.material_id)) continue;
      index += 1;
      const range = isRecord(segment.target_timerange) ? segment.target_timerange : null;
      if (!range) {
        omitted.add(index);
        issues.push({
          code: "invalid-time",
          severity: "error",
          scope: "segment",
          index,
          field: "target_timerange",
          message: `Segment ${index} has no target_timerange. The segment was omitted from the subtitle output.`
        });
        continue;
      }
      const start = inspectTime(range.start, {
        scale: 1e-6,
        index,
        field: "target_timerange.start",
        required: true,
        unit: "segment"
      });
      const duration = inspectTime(range.duration, {
        scale: 1e-6,
        index,
        field: "target_timerange.duration",
        required: true,
        unit: "segment"
      });
      pushIssue(issues, start.issue);
      pushIssue(issues, duration.issue);
      if (start.omitted || duration.omitted) omitted.add(index);
      if (start.seconds !== null && duration.seconds !== null) {
        pushIssue(
          issues,
          compareRange(start.seconds, start.seconds + duration.seconds, index, `Segment ${index}`)
        );
      }
    }
  }
  return { issues, checkedSegments: index, omittedSegments: omitted.size };
}
function scanTimelineInput(root) {
  if (Array.isArray(root.transcription)) {
    return scanWhisperCpp(root);
  }
  if (isRecord(root.results)) {
    return scanDeepgram(root);
  }
  if (Array.isArray(root.utterances)) {
    return scanAssemblyAi(root);
  }
  if (isRecord(root.materials) && Array.isArray(root.materials.texts) && Array.isArray(root.tracks)) {
    return scanCapCut(root);
  }
  if (Array.isArray(root.segments)) {
    return scanWhisperSegments(root);
  }
  if (Array.isArray(root.words)) {
    const scale = typeof root.audio_duration === "number" || typeof root.acoustic_model === "string" || typeof root.language_model === "string" ? 1e-3 : 1;
    return scanWordList(root.words, scale, "Word");
  }
  if (Array.isArray(root.word_segments)) {
    return scanWordList(root.word_segments, 1, "Word");
  }
  return { issues: [], checkedSegments: 0, omittedSegments: 0 };
}
function scanRawJsonText(raw) {
  try {
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
    if (!isRecord(parsed)) return { issues: [], checkedSegments: 0, omittedSegments: 0 };
    return scanTimelineInput(parsed);
  } catch {
    return { issues: [], checkedSegments: 0, omittedSegments: 0 };
  }
}
function analyzeCues(cues) {
  const issues = [];
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (!isRepresentableSeconds(cue.startSec) || !isRepresentableSeconds(cue.endSec)) {
      issues.push({
        code: "invalid-time",
        severity: "error",
        scope: "cue",
        index: cue.index,
        field: "range",
        value: `${cue.startSec} -> ${cue.endSec}`,
        message: `Cue ${cue.index} has a non-finite or unrepresentable time range. It was omitted from the subtitle output.`
      });
    }
    if (cue.lines.every((line) => line.trim().length === 0)) {
      issues.push({
        code: "empty-cue",
        severity: "warning",
        scope: "cue",
        index: cue.index,
        field: "text",
        message: `Cue ${cue.index} has no visible text.`
      });
    }
    if (cue.endSec < cue.startSec - EPSILON) {
      issues.push({
        code: "reversed-range",
        severity: "warning",
        scope: "cue",
        index: cue.index,
        field: "range",
        value: `${cue.startSec} -> ${cue.endSec}`,
        message: `Cue ${cue.index} ends at ${cue.endSec} s before it starts at ${cue.startSec} s. Timing was left unchanged for review.`
      });
    } else if (Math.abs(cue.endSec - cue.startSec) < EPSILON) {
      issues.push({
        code: "zero-duration",
        severity: "info",
        scope: "cue",
        index: cue.index,
        field: "range",
        value: `${cue.startSec} -> ${cue.endSec}`,
        message: `Cue ${cue.index} has zero duration at ${cue.startSec} s. Timing was left unchanged for review.`
      });
    }
    if (i > 0) {
      const prev = cues[i - 1];
      const overlapSec = prev.endSec - cue.startSec;
      if (overlapSec > OVERLAP_TOLERANCE_SEC) {
        issues.push({
          code: "overlap",
          severity: "warning",
          scope: "cue",
          index: cue.index,
          field: "start",
          value: overlapSec.toFixed(3),
          relatedIndex: prev.index,
          message: `Cue ${cue.index} starts ${overlapSec.toFixed(3)} s before cue ${prev.index} ends. Timing was left unchanged for review.`
        });
      }
    }
  }
  return issues;
}
var SEVERITY_RANK = { error: 0, warning: 1, info: 2 };
function buildQcReport(input) {
  const issues = [...input.issues].sort((a, b) => {
    const severity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (severity !== 0) return severity;
    if (a.scope !== b.scope) return a.scope === "segment" ? -1 : 1;
    if (a.index !== b.index) return a.index - b.index;
    return a.code.localeCompare(b.code);
  });
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  for (const issue of issues) {
    if (issue.severity === "error") errorCount += 1;
    else if (issue.severity === "warning") warningCount += 1;
    else infoCount += 1;
  }
  const status = errorCount > 0 ? "error" : warningCount > 0 ? "warning" : "clean";
  const summary = status === "clean" ? infoCount > 0 ? `Timeline QC: clean with ${infoCount} note(s) (${input.emittedCues} cues checked).` : `Timeline QC: clean (${input.emittedCues} cues checked).` : `Timeline QC: ${errorCount} error(s), ${warningCount} warning(s), ${infoCount} note(s); ${input.omittedSegments} segment(s) and ${input.omittedCues} cue(s) omitted.`;
  return {
    status,
    checkedSegments: input.checkedSegments,
    emittedCues: input.emittedCues,
    omittedSegments: input.omittedSegments,
    omittedCues: input.omittedCues,
    errorCount,
    warningCount,
    infoCount,
    issues,
    summary
  };
}
function formatQcReport(report) {
  const lines = [
    "Timeline QC report",
    `Status: ${report.status}`,
    `Emitted cues: ${report.emittedCues}`,
    `Segments checked: ${report.checkedSegments}`,
    `Omitted segments: ${report.omittedSegments}`,
    `Omitted cues: ${report.omittedCues}`,
    `Errors: ${report.errorCount}`,
    `Warnings: ${report.warningCount}`,
    `Notes: ${report.infoCount}`,
    ""
  ];
  if (report.issues.length === 0) {
    lines.push("No timeline QC issues detected.");
    return `${lines.join("\n")}
`;
  }
  lines.push(`Issues (${report.issues.length}):`);
  for (const issue of report.issues) {
    const location = issue.scope === "cue" ? `cue ${issue.index}${issue.relatedIndex !== void 0 ? ` (related cue ${issue.relatedIndex})` : ""}` : `segment ${issue.index}`;
    const field = issue.field ? ` ${issue.field}` : "";
    const value = issue.value !== void 0 ? ` value=${issue.value}` : "";
    lines.push(`- [${issue.code}] ${issue.severity} ${location}${field}${value}: ${issue.message}`);
  }
  return `${lines.join("\n")}
`;
}

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
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function toFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function toTimelineNumber(value) {
  const number = toFiniteNumber(value);
  if (number === null) return null;
  return isRepresentableSeconds(number) ? number : null;
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
  const total = hours * 3600 + minutes * 60 + seconds + millis / 1e3;
  return Number.isFinite(total) ? total : null;
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
    if (!isRecord2(item)) continue;
    const word = extractWordToken(item);
    if (!word) continue;
    const rawStart = toTimelineNumber(item.start);
    const rawEnd = toTimelineNumber(item.end);
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
    if (!isRecord2(item)) continue;
    if (typeof item.speaker === "string" && item.speaker.trim().length > 0) {
      return true;
    }
    if (Array.isArray(item.words)) {
      for (const w of item.words) {
        if (isRecord2(w) && typeof w.speaker === "string" && w.speaker.trim().length > 0) {
          return true;
        }
      }
    }
  }
  const extraWordLists = [root.words, root.word_segments];
  for (const list of extraWordLists) {
    if (!Array.isArray(list)) continue;
    for (const w of list) {
      if (isRecord2(w) && typeof w.speaker === "string" && w.speaker.trim().length > 0) {
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
    if (!isRecord2(item)) continue;
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
  const durationHintSec = toTimelineNumber(root.duration) ?? void 0;
  const rawSegments = Array.isArray(root.segments) ? root.segments : [];
  const segments = [];
  let anyNestedWords = false;
  for (const item of rawSegments) {
    if (!isRecord2(item)) continue;
    const rawStart = toTimelineNumber(item.start);
    const rawEnd = toTimelineNumber(item.end);
    if (rawStart === null || rawEnd === null) continue;
    const startSec = roundMicro(Math.max(0, rawStart));
    const endSec = roundMicro(rawEnd);
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
    if (!isRecord2(item)) continue;
    let startSec = null;
    let endSec = null;
    if (isRecord2(item.offsets)) {
      const fromMs = toTimelineNumber(item.offsets.from);
      const toMs = toTimelineNumber(item.offsets.to);
      if (fromMs !== null && toMs !== null) {
        startSec = fromMs / 1e3;
        endSec = toMs / 1e3;
      }
    }
    if ((startSec === null || endSec === null) && isRecord2(item.timestamps)) {
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
    const safeEnd = roundMicro(endSec);
    const seg = { startSec: safeStart, endSec: safeEnd, text };
    const speaker = normalizeSpeaker(item.speaker);
    if (speaker) seg.speaker = speaker;
    segments.push(seg);
  }
  return { segments };
}
function extractDeepgramSegments(root) {
  const results = isRecord2(root.results) ? root.results : {};
  const metadata = isRecord2(root.metadata) ? root.metadata : {};
  const durationHintSec = toTimelineNumber(metadata.duration) ?? void 0;
  const channels = Array.isArray(results.channels) ? results.channels : [];
  const firstChannel = isRecord2(channels[0]) ? channels[0] : {};
  const alternatives = Array.isArray(firstChannel.alternatives) ? firstChannel.alternatives : [];
  const firstAlt = isRecord2(alternatives[0]) ? alternatives[0] : {};
  const channelWords = Array.isArray(firstAlt.words) ? normalizeWords(firstAlt.words, 1) : [];
  if (Array.isArray(results.utterances) && results.utterances.length > 0) {
    const segments = [];
    for (const utt of results.utterances) {
      if (!isRecord2(utt)) continue;
      const rawStart = toTimelineNumber(utt.start);
      const rawEnd = toTimelineNumber(utt.end);
      if (rawStart === null || rawEnd === null) continue;
      const startSec = roundMicro(Math.max(0, rawStart));
      const endSec = roundMicro(rawEnd);
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
  if (isRecord2(firstAlt.paragraphs) && Array.isArray(firstAlt.paragraphs.paragraphs)) {
    const paraSegments = [];
    for (const para of firstAlt.paragraphs.paragraphs) {
      if (!isRecord2(para)) continue;
      const speaker = normalizeSpeaker(para.speaker);
      if (Array.isArray(para.sentences) && para.sentences.length > 0) {
        for (const sent of para.sentences) {
          if (!isRecord2(sent)) continue;
          const sStart = toTimelineNumber(sent.start);
          const sEnd = toTimelineNumber(sent.end);
          const sText = typeof sent.text === "string" ? sent.text.trim() : "";
          if (sStart === null || sEnd === null || !sText) continue;
          const seg = {
            startSec: roundMicro(Math.max(0, sStart)),
            endSec: roundMicro(sEnd),
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
      if (!isRecord2(utt)) continue;
      const rawStart = toTimelineNumber(utt.start);
      const rawEnd = toTimelineNumber(utt.end);
      if (rawStart === null || rawEnd === null) continue;
      const startSec = roundMicro(Math.max(0, rawStart / 1e3));
      const endSec = roundMicro(rawEnd / 1e3);
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
  if (isRecord2(content) && typeof content.text === "string") {
    return content.text.replace(/\s+/g, " ").trim();
  }
  if (typeof content !== "string") return "";
  const trimmed = content.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (isRecord2(parsed) && typeof parsed.text === "string") {
        return parsed.text.replace(/\s+/g, " ").trim();
      }
    } catch {
    }
  }
  return trimmed.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function extractCapCutDraftSegments(root) {
  const materials = isRecord2(root.materials) ? root.materials : {};
  const texts = Array.isArray(materials.texts) ? materials.texts : [];
  const textById = /* @__PURE__ */ new Map();
  for (const item of texts) {
    if (!isRecord2(item) || typeof item.id !== "string" || item.id.length === 0) continue;
    const text = readCapCutCaptionText(item.content);
    if (!text) continue;
    textById.set(item.id, text);
  }
  const tracks = Array.isArray(root.tracks) ? root.tracks : [];
  const segments = [];
  for (const track of tracks) {
    if (!isRecord2(track) || !Array.isArray(track.segments)) continue;
    for (const segment of track.segments) {
      if (!isRecord2(segment) || typeof segment.material_id !== "string") continue;
      const text = textById.get(segment.material_id);
      if (!text) continue;
      const range = isRecord2(segment.target_timerange) ? segment.target_timerange : null;
      const startUs = range ? toTimelineNumber(range.start) : null;
      const durationUs = range ? toTimelineNumber(range.duration) : null;
      if (startUs === null || durationUs === null || durationUs < 0) continue;
      const startSec = roundMicro(Math.max(0, startUs / 1e6));
      const endSec = roundMicro((startUs + durationUs) / 1e6);
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
    if (!isRecord2(item)) continue;
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
  if (trimmed.length === 0) return false;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return false;
  if (/[\r\n]/.test(trimmed)) return false;
  if (/\d{1,2}:\d{2}(?::\d{2})?[,.]\d{1,3}/.test(trimmed)) return false;
  let controlChars = 0;
  for (const char of trimmed) {
    const code = char.charCodeAt(0);
    if (code === 9 || code === 32) return false;
    if (code < 32) controlChars += 1;
  }
  if (controlChars > 0) return true;
  return trimmed.length >= 80 && /^[A-Za-z0-9+/_=-]+$/.test(trimmed);
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
    matches: (root) => isRecord2(root.results) && (Array.isArray(root.results.channels) || Array.isArray(root.results.utterances)),
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
    matches: (root) => isRecord2(root.materials) && Array.isArray(root.materials.texts) && Array.isArray(root.tracks),
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
  if (!isRepresentableSeconds(seconds)) {
    throw new RangeError(`Cannot format a non-finite or unrepresentable timestamp: ${String(seconds)}`);
  }
  const clamped = Math.max(0, seconds);
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
  let parsedJson;
  try {
    parsedJson = JSON.parse(normalizedJsonText);
  } catch (err) {
    if (looksLikeEncryptedProjectFile(normalizedJsonText)) {
      return {
        ok: false,
        error: ENCRYPTED_DRAFT_ERROR
      };
    }
    const detail = err instanceof Error ? err.message : "unexpected token";
    return {
      ok: false,
      error: `Invalid JSON syntax (${detail}). Check for trailing commas or truncated brackets.`
    };
  }
  if (!isRecord2(parsedJson)) {
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
function reflowCues(parsed, options, qc) {
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
  const cues = [];
  for (const draft of drafts) {
    const shiftedStart = draft.startSec + offsetSec;
    const shiftedEnd = draft.endSec + offsetSec;
    const cueIndex = cues.length + 1;
    if (!isRepresentableSeconds(shiftedStart) || !isRepresentableSeconds(shiftedEnd) || !isRepresentableSeconds(roundMicro(shiftedStart)) || !isRepresentableSeconds(roundMicro(shiftedEnd))) {
      qc?.({
        code: "invalid-time",
        severity: "error",
        scope: "cue",
        index: cueIndex,
        field: "range",
        value: `${String(shiftedStart)} -> ${String(shiftedEnd)}`,
        message: `Cue ${cueIndex} has a non-finite or unrepresentable time range and was omitted from the subtitle output.`
      });
      continue;
    }
    let startSec = roundMicro(Math.max(0, shiftedStart));
    let endSec = roundMicro(shiftedEnd);
    if (offsetSec < 0 && (shiftedStart < 0 || shiftedEnd < 0)) {
      const clampedEnd = Math.max(endSec, startSec + 0.05);
      qc?.({
        code: "offset-clamped",
        severity: "info",
        scope: "cue",
        index: cueIndex,
        field: "range",
        value: `${roundMicro(shiftedStart)} -> ${roundMicro(shiftedEnd)}`,
        message: `Offset ${offsetSec * 1e3} ms moved cue ${cueIndex} before 0.000 s. It was clamped to ${startSec.toFixed(3)} s - ${clampedEnd.toFixed(3)} s.`
      });
      endSec = roundMicro(clampedEnd);
    }
    const cue = {
      index: cueIndex,
      startSec,
      endSec,
      lines: draft.lines
    };
    if (draft.speaker) cue.speaker = draft.speaker;
    cues.push(cue);
  }
  return cues;
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
  const scan = scanRawJsonText(rawJsonText);
  const parsed = parseAsrJson(rawJsonText);
  if (!parsed.ok) {
    const qc2 = scan.issues.length > 0 ? buildQcReport({
      issues: scan.issues,
      checkedSegments: scan.checkedSegments,
      emittedCues: 0,
      omittedSegments: scan.omittedSegments,
      omittedCues: 0
    }) : void 0;
    if (!qc2) {
      return { ok: false, error: parsed.error };
    }
    const detail = qc2.issues.slice(0, 3).map((issue) => `[${issue.code}] ${issue.message}`).join(" ");
    return {
      ok: false,
      error: `${parsed.error} Timeline QC rejected the candidate segments: ${detail}`,
      qc: qc2
    };
  }
  const qcIssues = [...scan.issues];
  let omittedCues = 0;
  const cues = reflowCues(parsed, options, (issue) => {
    qcIssues.push(issue);
    if (issue.code === "invalid-time" && issue.scope === "cue") {
      omittedCues += 1;
    }
  });
  qcIssues.push(...analyzeCues(cues));
  const qc = buildQcReport({
    issues: qcIssues,
    checkedSegments: scan.checkedSegments,
    emittedCues: cues.length,
    omittedSegments: scan.omittedSegments,
    omittedCues
  });
  if (cues.length === 0) {
    return {
      ok: false,
      error: `Detected ${parsed.dialectLabel}, but timeline QC omitted every cue. ${qc.summary}`,
      qc
    };
  }
  const output = serializeCues(cues, options.format);
  return {
    ok: true,
    parsed,
    cues,
    output,
    qc
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
      --fail-on-qc          Exit with code 3 without writing output when timeline QC reports errors
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
    speaker: false,
    failOnQc: false
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
    if (arg === "--fail-on-qc") {
      parsed.failOnQc = true;
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
    if (result.qc) {
      process.stderr.write(`${formatQcReport(result.qc)}
`);
    }
    process.stderr.write(`Error: ${result.error}
`);
    return 1;
  }
  if (result.qc.status !== "clean") {
    process.stderr.write(`${formatQcReport(result.qc)}
`);
  }
  if (options.failOnQc && result.qc.errorCount > 0) {
    process.stderr.write(
      "Error: Timeline QC reported errors; output was not written because --fail-on-qc is set.\n"
    );
    return 3;
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
