import { serializeCues } from './subtitle-engine';
import {
	analyzeCues,
	buildQcReport,
	isRepresentableSeconds,
	type QcIssue,
	type TimelineQcReport,
} from './timeline-qc';
import type { SubtitleCue } from './types';

export type SubtitleInputFormat = 'srt' | 'vtt' | 'ttml' | 'smi' | 'sbv' | 'lrc' | 'ass';

export type ParsedSubtitleFile =
	| {
			ok: true;
			format: SubtitleInputFormat;
			formatLabel: string;
			cues: SubtitleCue[];
			warnings: string[];
	  }
	| {
			ok: false;
			error: string;
	  };

export interface ConvertSubtitleTextOptions {
	format: 'srt' | 'vtt';
	maxCharsPerLine: number;
	maxLinesPerCue: 1 | 2;
	offsetMs: number;
	forceInputFormat?: SubtitleInputFormat | 'auto';
	filename?: string;
}

export type ConvertSubtitleTextResult =
	| {
			ok: true;
			inputFormat: SubtitleInputFormat;
			inputFormatLabel: string;
			cues: SubtitleCue[];
			output: string;
			qc: TimelineQcReport;
			warnings: string[];
	  }
	| {
			ok: false;
			error: string;
			qc?: TimelineQcReport;
	  };

const FORMAT_LABELS: Record<SubtitleInputFormat, string> = {
	srt: 'SubRip SRT',
	vtt: 'WebVTT',
	ttml: 'TTML / DFXP',
	smi: 'SAMI',
	sbv: 'YouTube SBV',
	lrc: 'Synced LRC lyrics',
	ass: 'ASS / SSA',
};

const EMPTY_INPUT_ERROR =
	'Empty subtitle input. Paste or upload a subtitle file to convert.';
const BINARY_INPUT_ERROR =
	'This file does not look like a text subtitle. Binary or non-text content was rejected.';
const UNKNOWN_FORMAT_ERROR =
	'Could not detect the subtitle format. Supported inputs: SRT, VTT, TTML/DFXP, SAMI, SBV, LRC, and ASS/SSA.';
const DEFAULT_TAIL_SEC = 2;
const LAST_CUE_TAIL_SEC = 3;
const MIN_CLAMPED_DURATION_SEC = 0.05;
const DEFAULT_FRAME_RATE = 30;
const DEFAULT_TICK_RATE = 10_000_000;

const CJK_CHAR_RE =
	/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef\uac00-\ud7af]/;
const CJK_CLOSING_PUNCT_RE = /^[\u3001\u3002\uff01\uff0c\uff1a\uff1b\uff1f\uff09\u300b\u300d\u300f\u3011\u3015]/;

interface FormatParseResult {
	ok: true;
	cues: SubtitleCue[];
	warnings: string[];
	skipped: number;
}

type ParsedCueFile = FormatParseResult | { ok: false; error: string };

interface InternalParsed {
	ok: true;
	format: SubtitleInputFormat;
	formatLabel: string;
	cues: SubtitleCue[];
	warnings: string[];
	skipped: number;
}

type InternalParseResult = InternalParsed | { ok: false; error: string };

const EXTENSION_FORMATS: Record<string, SubtitleInputFormat> = {
	srt: 'srt',
	vtt: 'vtt',
	webvtt: 'vtt',
	ttml: 'ttml',
	dfxp: 'ttml',
	xml: 'ttml',
	smi: 'smi',
	sami: 'smi',
	sbv: 'sbv',
	lrc: 'lrc',
	ass: 'ass',
	ssa: 'ass',
};

function roundSec(value: number): number {
	return Math.round(value * 1_000_000) / 1_000_000;
}

function looksBinary(raw: string): boolean {
	if (raw.includes('\u0000')) return true;
	const sample = raw.slice(0, 4000);
	if (sample.length === 0) return false;
	let suspicious = 0;
	for (const ch of sample) {
		const code = ch.codePointAt(0) ?? 0;
		if (code === 0xfffd) suspicious += 1;
		else if (code < 9 || (code > 13 && code < 32)) suspicious += 1;
	}
	return suspicious / sample.length > 0.05;
}

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
};

function decodeEntities(text: string): string {
	return text.replace(
		/&(?:#(\d+)|#x([0-9a-fA-F]+)|([a-zA-Z][a-zA-Z0-9]*));/g,
		(match: string, dec?: string, hex?: string, name?: string) => {
			if (dec) {
				const code = Number.parseInt(dec, 10);
				if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
					try {
						return String.fromCodePoint(code);
					} catch {
						return match;
					}
				}
				return match;
			}
			if (hex) {
				const code = Number.parseInt(hex, 16);
				if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
					try {
						return String.fromCodePoint(code);
					} catch {
						return match;
					}
				}
				return match;
			}
			if (name) {
				const known = NAMED_ENTITIES[name.toLowerCase()];
				if (known !== undefined) return known;
			}
			return match;
		},
	);
}

function readXmlAttr(source: string, name: string): string | undefined {
	const pattern = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
	const match = source.match(pattern);
	if (!match) return undefined;
	return match[2] ?? match[3] ?? '';
}

function readLooseAttr(source: string, name: string): string | undefined {
	const pattern = new RegExp(
		`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
		'i',
	);
	const match = source.match(pattern);
	if (!match) return undefined;
	return match[1] ?? match[2] ?? match[3];
}

function readPositive(raw: string | undefined, fallback: number): number {
	if (!raw) return fallback;
	const value = Number.parseFloat(raw);
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeCaptionLines(text: string): string[] {
	return text
		.replace(/\u00a0/g, ' ')
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((line) => line.replace(/[\t ]+/g, ' ').trim())
		.filter((line) => line.length > 0);
}

function cleanMarkupText(raw: string): { lines: string[]; speaker?: string } {
	let speaker: string | undefined;
	const withoutVoice = raw.replace(
		/<v(?:\.[^\s>]+)?\s+([^>]*)>/gi,
		(_match: string, name: string) => {
			if (speaker === undefined) {
				const cleaned = decodeEntities(name.trim());
				if (cleaned.length > 0) speaker = cleaned;
			}
			return '';
		},
	);
	const withBreaks = withoutVoice.replace(/<\s*br\s*\/?>/gi, '\n');
	const plain = decodeEntities(withBreaks.replace(/<[^>]*>/g, ''));
	const lines = normalizeCaptionLines(plain);
	const result: { lines: string[]; speaker?: string } = { lines };
	if (speaker !== undefined) result.speaker = speaker;
	return result;
}

function parseClockTimestamp(value: string): number | null {
	const trimmed = value.trim().replace(',', '.');
	const parts = trimmed.split(':');
	if (parts.length < 2 || parts.length > 3) return null;
	const secondsPart = parts.pop() ?? '';
	const minutesPart = parts.pop() ?? '';
	const hoursPart = parts.length > 0 ? (parts.pop() ?? '0') : '0';
	if (!/^\d+$/.test(minutesPart) || !/^\d+$/.test(hoursPart)) return null;
	const secondsMatch = secondsPart.match(/^(\d{1,2})(?:\.(\d{1,3}))?$/);
	if (!secondsMatch) return null;
	const hours = Number.parseInt(hoursPart, 10);
	const minutes = Number.parseInt(minutesPart, 10);
	const seconds = Number.parseInt(secondsMatch[1] ?? '0', 10);
	const millis = secondsMatch[2] ? Number.parseInt(secondsMatch[2].padEnd(3, '0'), 10) : 0;
	const total = hours * 3600 + minutes * 60 + seconds + millis / 1000;
	return Number.isFinite(total) ? roundSec(total) : null;
}

function parseTtmlTime(
	raw: string | undefined,
	frameRate: number,
	tickRate: number,
): number | null {
	if (!raw) return null;
	const value = raw.trim();
	if (!value) return null;

	const frames = value.match(/^(\d+):(\d{1,2}):(\d{1,2}):(\d+(?:\.\d+)?)$/);
	if (frames) {
		const hours = Number.parseInt(frames[1] ?? '0', 10);
		const minutes = Number.parseInt(frames[2] ?? '0', 10);
		const seconds = Number.parseInt(frames[3] ?? '0', 10);
		const frameCount = Number.parseFloat(frames[4] ?? '0');
		return roundSec(hours * 3600 + minutes * 60 + seconds + frameCount / frameRate);
	}

	const clock = value.match(/^(\d+):(\d{1,2}):(\d{1,2})(?:[.,](\d+))?$/);
	if (clock) {
		const hours = Number.parseInt(clock[1] ?? '0', 10);
		const minutes = Number.parseInt(clock[2] ?? '0', 10);
		const seconds = Number.parseInt(clock[3] ?? '0', 10);
		const fraction = clock[4] ? Number.parseFloat(`0.${clock[4]}`) : 0;
		return roundSec(hours * 3600 + minutes * 60 + seconds + fraction);
	}

	const shortClock = value.match(/^(\d{1,3}):(\d{1,2})(?:[.,](\d+))?$/);
	if (shortClock) {
		const minutes = Number.parseInt(shortClock[1] ?? '0', 10);
		const seconds = Number.parseInt(shortClock[2] ?? '0', 10);
		const fraction = shortClock[3] ? Number.parseFloat(`0.${shortClock[3]}`) : 0;
		return roundSec(minutes * 60 + seconds + fraction);
	}

	const offset = value.match(/^(\d+(?:\.\d+)?)(ms|h|m|s|f|t)$/i);
	if (offset) {
		const amount = Number.parseFloat(offset[1] ?? '0');
		const unit = (offset[2] ?? 's').toLowerCase();
		if (!Number.isFinite(amount)) return null;
		if (unit === 'h') return roundSec(amount * 3600);
		if (unit === 'm') return roundSec(amount * 60);
		if (unit === 's') return roundSec(amount);
		if (unit === 'ms') return roundSec(amount / 1000);
		if (unit === 'f') return roundSec(amount / frameRate);
		return roundSec(amount / tickRate);
	}

	return null;
}

function parseAssTime(value: string): number | null {
	const match = value.trim().match(/^(\d+):(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?$/);
	if (!match) return null;
	const hours = Number.parseInt(match[1] ?? '0', 10);
	const minutes = Number.parseInt(match[2] ?? '0', 10);
	const seconds = Number.parseInt(match[3] ?? '0', 10);
	const fraction = match[4] ? Number.parseInt(match[4].padEnd(3, '0'), 10) : 0;
	return roundSec(hours * 3600 + minutes * 60 + seconds + fraction / 1000);
}

function buildCue(
	index: number,
	startSec: number,
	endSec: number,
	lines: string[],
	speaker?: string,
): SubtitleCue {
	const cue: SubtitleCue = {
		index,
		startSec: roundSec(startSec),
		endSec: roundSec(endSec),
		lines,
	};
	if (speaker !== undefined && speaker.trim().length > 0) cue.speaker = speaker.trim();
	return cue;
}

function parseSrt(raw: string): ParsedCueFile {
	const blocks = raw
		.replace(/^\uFEFF/, '')
		.replace(/\r\n?/g, '\n')
		.split(/\n{2,}/);
	const cues: SubtitleCue[] = [];
	const warnings: string[] = [];
	let skipped = 0;

	for (const block of blocks) {
		if (!block.trim()) continue;
		const lines = block.split('\n');
		const timingIndex = lines.findIndex((line) => line.includes('-->'));
		if (timingIndex === -1) {
			skipped += 1;
			warnings.push('Skipped a caption block without a timing line.');
			continue;
		}
		const range = (lines[timingIndex] ?? '').match(
			/(\d{1,3}:\d{1,2}(?::\d{1,2})?[.,]\d{1,3})\s*-->\s*(\d{1,3}:\d{1,2}(?::\d{1,2})?[.,]\d{1,3})/,
		);
		if (!range) {
			skipped += 1;
			warnings.push('Skipped a cue with an unreadable timing line.');
			continue;
		}
		const startSec = parseClockTimestamp(range[1] ?? '');
		const endSec = parseClockTimestamp(range[2] ?? '');
		if (startSec === null || endSec === null) {
			skipped += 1;
			warnings.push('Skipped a cue with an unreadable timestamp.');
			continue;
		}
		const cleaned = cleanMarkupText(lines.slice(timingIndex + 1).join('\n'));
		if (cleaned.lines.length === 0) {
			skipped += 1;
			warnings.push('Skipped a cue without visible text.');
			continue;
		}
		cues.push(buildCue(cues.length + 1, startSec, endSec, cleaned.lines, cleaned.speaker));
	}

	if (cues.length === 0) {
		return { ok: false, error: 'No readable SRT cues were found in this file.' };
	}
	return { ok: true, cues, warnings, skipped };
}

function stripVttHeader(raw: string): string {
	const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
	const splitIndex = text.search(/\n{2,}/);
	if (splitIndex === -1) return text;
	const header = text.slice(0, splitIndex).trim();
	if (/^WEBVTT(?:[ \t]|\n|$)/i.test(header)) {
		return text.slice(splitIndex).replace(/^\n+/, '');
	}
	return text;
}

function parseVtt(raw: string): ParsedCueFile {
	const blocks = stripVttHeader(raw).split(/\n{2,}/);
	const cues: SubtitleCue[] = [];
	const warnings: string[] = [];
	let skipped = 0;

	for (const block of blocks) {
		if (!block.trim()) continue;
		const lines = block.split('\n');
		const firstLine = (lines[0] ?? '').trim();
		if (/^(NOTE|STYLE|REGION)\b/i.test(firstLine)) continue;

		const timingIndex = lines.findIndex((line) => line.includes('-->'));
		if (timingIndex === -1) {
			skipped += 1;
			warnings.push('Skipped a WebVTT block without a timing line.');
			continue;
		}
		const range = (lines[timingIndex] ?? '').match(
			/(\d{1,3}:\d{1,2}(?::\d{1,2})?[.,]\d{1,3})\s*-->\s*(\d{1,3}:\d{1,2}(?::\d{1,2})?[.,]\d{1,3})/,
		);
		if (!range) {
			skipped += 1;
			warnings.push('Skipped a WebVTT cue with an unreadable timing line.');
			continue;
		}
		const startSec = parseClockTimestamp(range[1] ?? '');
		const endSec = parseClockTimestamp(range[2] ?? '');
		if (startSec === null || endSec === null) {
			skipped += 1;
			warnings.push('Skipped a WebVTT cue with an unreadable timestamp.');
			continue;
		}
		const cleaned = cleanMarkupText(lines.slice(timingIndex + 1).join('\n'));
		if (cleaned.lines.length === 0) {
			skipped += 1;
			warnings.push('Skipped a WebVTT cue without visible text.');
			continue;
		}
		cues.push(buildCue(cues.length + 1, startSec, endSec, cleaned.lines, cleaned.speaker));
	}

	if (cues.length === 0) {
		return { ok: false, error: 'No readable WebVTT cues were found in this file.' };
	}
	return { ok: true, cues, warnings, skipped };
}

function parseTtml(raw: string): ParsedCueFile {
	const frameRate = readPositive(readXmlAttr(raw, 'ttp:frameRate'), DEFAULT_FRAME_RATE);
	const tickRate = readPositive(readXmlAttr(raw, 'ttp:tickRate'), DEFAULT_TICK_RATE);
	const pattern = /<p\b([^>]*)>([\s\S]*?)<\/p\s*>/gi;
	const cues: SubtitleCue[] = [];
	const warnings: string[] = [];
	let skipped = 0;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(raw)) !== null) {
		const attrs = match[1] ?? '';
		const body = match[2] ?? '';
		const beginRaw = readXmlAttr(attrs, 'begin');
		const parsedBegin = parseTtmlTime(beginRaw, frameRate, tickRate);
		if (parsedBegin === null) {
			skipped += 1;
			warnings.push('Skipped a <p> element without a readable begin time.');
			continue;
		}

		const endRaw = readXmlAttr(attrs, 'end');
		const durRaw = readXmlAttr(attrs, 'dur');
		let endSec = parseTtmlTime(endRaw, frameRate, tickRate);
		if (endSec === null) {
			const duration = parseTtmlTime(durRaw, frameRate, tickRate);
			if (duration !== null && duration > 0) {
				endSec = roundSec(parsedBegin + duration);
			} else {
				endSec = roundSec(parsedBegin + DEFAULT_TAIL_SEC);
				warnings.push('A <p> element had no end or duration and received a short default tail.');
			}
		}

		const cleaned = cleanMarkupText(body);
		if (cleaned.lines.length === 0) {
			skipped += 1;
			warnings.push('Skipped a <p> element without visible text.');
			continue;
		}

		let startSec = parsedBegin;
		if (startSec < 0) {
			startSec = 0;
			warnings.push('A <p> element started before zero and was clamped to 0.000 s.');
		}
		cues.push(
			buildCue(
				cues.length + 1,
				startSec,
				Math.max(0, endSec),
				cleaned.lines,
				cleaned.speaker,
			),
		);
	}

	if (cues.length === 0) {
		return {
			ok: false,
			error: 'No readable TTML/DFXP <p> cue elements with begin times were found in this file.',
		};
	}
	return { ok: true, cues, warnings, skipped };
}

function cleanSamiBody(body: string): string[] {
	const withoutBlocks = body.replace(
		/<(style|script)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
		' ',
	);
	const withBreaks = withoutBlocks.replace(/<\s*br\s*\/?>/gi, '\n');
	const plain = decodeEntities(withBreaks.replace(/<[^>]*>/g, ' '));
	return normalizeCaptionLines(plain);
}

function parseSami(raw: string): ParsedCueFile {
	const pattern = /<sync\b([^>]*)>/gi;
	const headers: { startSec: number; tagStart: number; tagEnd: number }[] = [];
	const warnings: string[] = [];
	let skipped = 0;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(raw)) !== null) {
		const attrs = match[1] ?? '';
		const startRaw = readLooseAttr(attrs, 'start');
		const startMs = startRaw !== undefined ? Number.parseInt(startRaw.trim(), 10) : Number.NaN;
		if (!Number.isFinite(startMs) || startMs < 0) {
			skipped += 1;
			warnings.push('Skipped a <SYNC> marker without a readable start time.');
			continue;
		}
		headers.push({
			startSec: roundSec(startMs / 1000),
			tagStart: match.index,
			tagEnd: pattern.lastIndex,
		});
	}

	if (headers.length === 0) {
		return { ok: false, error: 'No readable <SYNC> markers were found in this SAMI file.' };
	}

	const cues: SubtitleCue[] = [];
	for (let i = 0; i < headers.length; i++) {
		const current = headers[i];
		if (!current) continue;
		const nextHeader = headers[i + 1];
		const body = raw.slice(current.tagEnd, nextHeader ? nextHeader.tagStart : raw.length);
		const lines = cleanSamiBody(body);
		if (lines.length === 0) continue;

		const nextStart = i + 1 < headers.length ? headers[i + 1]?.startSec : undefined;
		const endSec =
			nextStart !== undefined && nextStart > current.startSec
				? nextStart
				: roundSec(current.startSec + LAST_CUE_TAIL_SEC);
		cues.push(buildCue(cues.length + 1, current.startSec, endSec, lines));
	}

	if (cues.length === 0) {
		return { ok: false, error: 'No SAMI caption text was found between the <SYNC> markers.' };
	}
	return { ok: true, cues, warnings, skipped };
}

function parseSbv(raw: string): ParsedCueFile {
	const blocks = raw
		.replace(/^\uFEFF/, '')
		.replace(/\r\n?/g, '\n')
		.split(/\n{2,}/);
	const cues: SubtitleCue[] = [];
	const warnings: string[] = [];
	let skipped = 0;

	for (const block of blocks) {
		if (!block.trim()) continue;
		const lines = block.split('\n');
		const range = (lines[0] ?? '').trim().match(
			/^(\d{1,3}:\d{1,2}:\d{1,2}\.\d{1,3})\s*,\s*(\d{1,3}:\d{1,2}:\d{1,2}\.\d{1,3})$/,
		);
		if (!range) {
			skipped += 1;
			warnings.push('Skipped a block without an SBV time range header.');
			continue;
		}
		const startSec = parseClockTimestamp(range[1] ?? '');
		const endSec = parseClockTimestamp(range[2] ?? '');
		if (startSec === null || endSec === null) {
			skipped += 1;
			warnings.push('Skipped an SBV cue with an unreadable timestamp.');
			continue;
		}
		const cleaned = cleanMarkupText(lines.slice(1).join('\n'));
		if (cleaned.lines.length === 0) {
			skipped += 1;
			warnings.push('Skipped an SBV cue without visible text.');
			continue;
		}
		cues.push(buildCue(cues.length + 1, startSec, endSec, cleaned.lines, cleaned.speaker));
	}

	if (cues.length === 0) {
		return { ok: false, error: 'No readable SBV cues were found in this file.' };
	}
	return { ok: true, cues, warnings, skipped };
}

function parseLrc(raw: string): ParsedCueFile {
	const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
	const warnings: string[] = [];
	const entries: { startSec: number; text: string }[] = [];
	let offsetMs = 0;
	let skipped = 0;

	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const timestamps = [...trimmed.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
		if (timestamps.length === 0) {
			const meta = trimmed.match(/^\[([a-zA-Z]+):(.*)\]$/);
			if (meta) {
				if ((meta[1] ?? '').toLowerCase() === 'offset') {
					const value = Number.parseInt((meta[2] ?? '').trim(), 10);
					if (Number.isFinite(value)) offsetMs = value;
				}
				continue;
			}
			skipped += 1;
			warnings.push('Skipped a lyric line without a timestamp.');
			continue;
		}
		const content = trimmed
			.replace(/\[[^\]]*\]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
		if (!content) {
			skipped += 1;
			warnings.push('Skipped a lyric line without text.');
			continue;
		}
		for (const stamp of timestamps) {
			// A positive LRC offset advances cue times, so lyrics appear earlier.
			const minutes = Number.parseInt(stamp[1] ?? '0', 10);
			const seconds = Number.parseInt(stamp[2] ?? '0', 10);
			const fraction = stamp[3] ? Number.parseInt(stamp[3].padEnd(3, '0'), 10) : 0;
			const startSec = roundSec(minutes * 60 + seconds + fraction / 1000 - offsetMs / 1000);
			entries.push({ startSec, text: content });
		}
	}

	if (entries.length === 0) {
		return { ok: false, error: 'No timed lyric lines were found in this LRC file.' };
	}

	entries.sort((a, b) => a.startSec - b.startSec);
	const merged: { startSec: number; lines: string[] }[] = [];
	for (const entry of entries) {
		const last = merged[merged.length - 1];
		if (last && Math.abs(last.startSec - entry.startSec) < 1e-6) {
			if (!last.lines.includes(entry.text)) last.lines.push(entry.text);
			continue;
		}
		merged.push({ startSec: entry.startSec, lines: [entry.text] });
	}

	const cues: SubtitleCue[] = [];
	for (let i = 0; i < merged.length; i++) {
		const entry = merged[i];
		if (!entry) continue;
		let startSec = entry.startSec;
		if (startSec < 0) {
			startSec = 0;
			warnings.push('A lyric timestamp was shifted before zero and was clamped to 0.000 s.');
		}
		const next = merged[i + 1];
		const endSec =
			next && next.startSec > startSec
				? next.startSec
				: roundSec(startSec + LAST_CUE_TAIL_SEC);
		cues.push(buildCue(cues.length + 1, startSec, endSec, entry.lines));
	}

	if (cues.length === 0) {
		return { ok: false, error: 'No timed lyric lines were found in this LRC file.' };
	}
	return { ok: true, cues, warnings, skipped };
}

function splitAssFields(payload: string, count: number): string[] {
	const fields: string[] = [];
	let rest = payload;
	for (let i = 0; i < count - 1; i++) {
		const comma = rest.indexOf(',');
		if (comma === -1) {
			fields.push(rest);
			return fields;
		}
		fields.push(rest.slice(0, comma));
		rest = rest.slice(comma + 1);
	}
	fields.push(rest);
	return fields;
}

function cleanAssText(text: string): string[] {
	const withoutOverrides = text.replace(/\{[^}]*\}/g, '');
	const withBreaks = decodeEntities(
		withoutOverrides
			.replace(/\\[Nn]/g, '\n')
			.replace(/\\h/g, ' ')
			.replace(/<[^>]*>/g, ''),
	);
	return normalizeCaptionLines(withBreaks);
}

const DEFAULT_ASS_COLUMNS = [
	'layer',
	'start',
	'end',
	'style',
	'name',
	'marginl',
	'marginr',
	'marginv',
	'effect',
	'text',
];

function parseAss(raw: string): ParsedCueFile {
	const lines = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
	const warnings: string[] = [];
	const cues: SubtitleCue[] = [];
	let skipped = 0;
	let inEvents = false;
	let columns: string[] | null = null;

	for (const line of lines) {
		const trimmed = line.trim();
		if (/^\[.*\]$/.test(trimmed)) {
			inEvents = /^\[events\]$/i.test(trimmed);
			continue;
		}
		if (!inEvents) continue;

		const formatMatch = trimmed.match(/^format\s*:\s*(.*)$/i);
		if (formatMatch) {
			const value = formatMatch[1] ?? '';
			columns = value.split(',').map((column) => column.trim().toLowerCase());
			continue;
		}

		const dialogueMatch = trimmed.match(/^dialogue\s*:\s*(.*)$/i);
		if (!dialogueMatch) continue;

		const payload = dialogueMatch[1] ?? '';
		const activeColumns = columns ?? DEFAULT_ASS_COLUMNS;
		const startIndex = activeColumns.indexOf('start');
		const endIndex = activeColumns.indexOf('end');
		const textIndex = activeColumns.indexOf('text');
		const nameIndex = activeColumns.indexOf('name');
		const actorIndex = activeColumns.indexOf('actor');
		if (startIndex === -1 || endIndex === -1 || textIndex === -1) {
			skipped += 1;
			warnings.push('Skipped a Dialogue line because the Events format lacks start, end, or text.');
			continue;
		}

		const fields = splitAssFields(payload, activeColumns.length);
		if (fields.length < activeColumns.length) {
			skipped += 1;
			warnings.push('Skipped a Dialogue line with fewer fields than the Events format.');
			continue;
		}

		const startSec = parseAssTime(fields[startIndex] ?? '');
		const endSec = parseAssTime(fields[endIndex] ?? '');
		if (startSec === null || endSec === null) {
			skipped += 1;
			warnings.push('Skipped a Dialogue line with an unreadable start or end time.');
			continue;
		}

		const textLines = cleanAssText(fields[textIndex] ?? '');
		if (textLines.length === 0) {
			skipped += 1;
			warnings.push('Skipped a Dialogue line without visible text.');
			continue;
		}

		const speakerField =
			nameIndex !== -1 ? fields[nameIndex] : actorIndex !== -1 ? fields[actorIndex] : undefined;
		const speaker = speakerField?.trim();
		cues.push(
			buildCue(
				cues.length + 1,
				startSec,
				endSec,
				textLines,
				speaker && speaker.length > 0 ? speaker : undefined,
			),
		);
	}

	if (cues.length === 0) {
		return { ok: false, error: 'No readable Dialogue lines were found in this ASS/SSA file.' };
	}
	return { ok: true, cues, warnings, skipped };
}

const PARSERS: Record<SubtitleInputFormat, (raw: string) => ParsedCueFile> = {
	srt: parseSrt,
	vtt: parseVtt,
	ttml: parseTtml,
	smi: parseSami,
	sbv: parseSbv,
	lrc: parseLrc,
	ass: parseAss,
};

function detectFromContent(raw: string): SubtitleInputFormat | null {
	const text = raw.replace(/^\uFEFF/, '');
	if (/^WEBVTT(?:[ \t]|\n|$)/i.test(text)) return 'vtt';
	if (/<sami\b/i.test(text) || /<sync\b/i.test(text)) return 'smi';
	if (/<(?:[\w.-]+:)?tt[\s>]/i.test(text) && /<\/(?:[\w.-]+:)?tt\s*>/i.test(text)) return 'ttml';
	if (/^\s*\[script info\]/im.test(text) || /^\s*dialogue\s*:/im.test(text)) return 'ass';
	if (
		/^\s*\d{1,3}:\d{1,2}:\d{1,2}\.\d{1,3}\s*,\s*\d{1,3}:\d{1,2}:\d{1,2}\.\d{1,3}\s*$/m.test(
			text,
		)
	) {
		return 'sbv';
	}
	if (/^\s*\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/m.test(text)) return 'lrc';
	if (/^\s*\[(?:ti|ar|al|by|offset|re|ve|length):/im.test(text)) return 'lrc';
	if (
		/^\s*\d{1,3}:\d{1,2}:\d{1,2}[,.]\d{1,3}\s*-->\s*\d{1,3}:\d{1,2}:\d{1,2}[,.]\d{1,3}/m.test(
			text,
		)
	) {
		return 'srt';
	}
	if (/-->/m.test(text)) return 'vtt';
	return null;
}

function detectFromFilename(filename?: string): SubtitleInputFormat | null {
	if (!filename) return null;
	const extension = filename.trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
	if (!extension) return null;
	return EXTENSION_FORMATS[extension] ?? null;
}

export function detectSubtitleFormat(
	rawText: string,
	filename?: string,
): SubtitleInputFormat | null {
	if (typeof rawText !== 'string' || rawText.trim().length === 0) {
		return detectFromFilename(filename);
	}
	const fromContent = detectFromContent(rawText);
	if (fromContent) return fromContent;
	return detectFromFilename(filename);
}

function parseInternal(
	rawText: string,
	format: SubtitleInputFormat | 'auto',
	filename?: string,
): InternalParseResult {
	if (typeof rawText !== 'string' || rawText.trim().length === 0) {
		return { ok: false, error: EMPTY_INPUT_ERROR };
	}
	if (looksBinary(rawText)) {
		return { ok: false, error: BINARY_INPUT_ERROR };
	}

	let resolved: SubtitleInputFormat | null;
	if (format === 'auto') {
		resolved = detectSubtitleFormat(rawText, filename);
	} else if (Object.prototype.hasOwnProperty.call(PARSERS, format)) {
		resolved = format;
	} else {
		resolved = null;
	}
	if (!resolved) {
		return { ok: false, error: UNKNOWN_FORMAT_ERROR };
	}

	const parser = PARSERS[resolved];
	const parsed = parser(rawText);
	if (!parsed.ok) return parsed;

	const cues = parsed.cues.map((cue, idx) => ({ ...cue, index: idx + 1 }));
	return {
		ok: true,
		format: resolved,
		formatLabel: FORMAT_LABELS[resolved],
		cues,
		warnings: parsed.warnings,
		skipped: parsed.skipped,
	};
}

export function parseSubtitleText(
	rawText: string,
	options?: { format?: SubtitleInputFormat | 'auto'; filename?: string },
): ParsedSubtitleFile {
	const parsed = parseInternal(rawText, options?.format ?? 'auto', options?.filename);
	if (!parsed.ok) return { ok: false, error: parsed.error };
	return {
		ok: true,
		format: parsed.format,
		formatLabel: parsed.formatLabel,
		cues: parsed.cues,
		warnings: parsed.warnings,
	};
}

interface WrapToken {
	text: string;
	spaceBefore: boolean;
}

function tokenizeForWrap(text: string): WrapToken[] {
	const normalized = text.replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
	if (!normalized) return [];
	const tokens: WrapToken[] = [];
	let latin = '';
	let spaceBefore = false;

	const flushLatin = () => {
		if (!latin) return;
		tokens.push({ text: latin, spaceBefore });
		latin = '';
		spaceBefore = false;
	};

	for (const ch of normalized) {
		if (ch === ' ') {
			flushLatin();
			spaceBefore = true;
			continue;
		}
		if (CJK_CHAR_RE.test(ch)) {
			flushLatin();
			const last = tokens[tokens.length - 1];
			if (CJK_CLOSING_PUNCT_RE.test(ch) && last && !spaceBefore) {
				last.text += ch;
			} else {
				tokens.push({ text: ch, spaceBefore });
			}
			spaceBefore = false;
			continue;
		}
		latin += ch;
	}
	flushLatin();
	return tokens;
}

function wrapCaptionText(text: string, maxChars: number, maxLines: 1 | 2): string[] {
	const tokens = tokenizeForWrap(text);
	if (tokens.length === 0) return [];
	const lines: string[] = [];
	let current = '';
	for (const token of tokens) {
		if (!current) {
			current = token.text;
			continue;
		}
		const candidate = `${current}${token.spaceBefore ? ' ' : ''}${token.text}`;
		if (candidate.length <= maxChars) {
			current = candidate;
			continue;
		}
		if (lines.length + 1 < maxLines) {
			lines.push(current);
			current = token.text;
		} else {
			current = candidate;
		}
	}
	if (current) lines.push(current);
	return lines;
}

export function reflowSubtitleCues(
	cues: SubtitleCue[],
	options: { maxCharsPerLine: number; maxLinesPerCue: 1 | 2; offsetMs: number },
): { cues: SubtitleCue[]; issues: QcIssue[] } {
	const rawMaxChars = Number.isFinite(options.maxCharsPerLine) ? options.maxCharsPerLine : 42;
	const maxChars = Math.max(4, Math.floor(rawMaxChars) || 42);
	const maxLines: 1 | 2 = options.maxLinesPerCue === 1 ? 1 : 2;
	const offsetMs = Number.isFinite(options.offsetMs) ? options.offsetMs : 0;
	const offsetSec = offsetMs / 1000;
	const issues: QcIssue[] = [];
	const output: SubtitleCue[] = [];

	for (const cue of cues) {
		const text = cue.lines.join(' ').replace(/\s+/g, ' ').trim();
		if (!text) continue;
		const shiftedStart = roundSec(cue.startSec + offsetSec);
		const shiftedEnd = roundSec(cue.endSec + offsetSec);
		const index = output.length + 1;

		if (!isRepresentableSeconds(shiftedStart) || !isRepresentableSeconds(shiftedEnd)) {
			issues.push({
				code: 'invalid-time',
				severity: 'error',
				scope: 'cue',
				index,
				field: 'range',
				value: `${String(shiftedStart)} -> ${String(shiftedEnd)}`,
				message: `Cue ${index} has a non-finite or unrepresentable time range and was omitted from the subtitle output.`,
			});
			continue;
		}

		let startSec = Math.max(0, shiftedStart);
		let endSec = shiftedEnd;
		if (offsetSec < 0 && (shiftedStart < 0 || shiftedEnd < 0)) {
			endSec = Math.max(endSec, startSec + MIN_CLAMPED_DURATION_SEC);
			issues.push({
				code: 'offset-clamped',
				severity: 'info',
				scope: 'cue',
				index,
				field: 'range',
				value: `${shiftedStart} -> ${shiftedEnd}`,
				message: `Offset ${offsetMs} ms moved cue ${index} before 0.000 s. It was clamped to ${startSec.toFixed(3)} s - ${endSec.toFixed(3)} s.`,
			});
		}

		const lines = wrapCaptionText(text, maxChars, maxLines);
		if (lines.length === 0) continue;
		const next: SubtitleCue = {
			index,
			startSec: roundSec(startSec),
			endSec: roundSec(endSec),
			lines,
		};
		if (cue.speaker) next.speaker = cue.speaker;
		output.push(next);
	}

	return { cues: output, issues };
}

export function convertSubtitleText(
	rawText: string,
	options: ConvertSubtitleTextOptions,
): ConvertSubtitleTextResult {
	const parsed = parseInternal(
		rawText,
		options.forceInputFormat ?? 'auto',
		options.filename,
	);
	if (!parsed.ok) return { ok: false, error: parsed.error };

	const reflowed = reflowSubtitleCues(parsed.cues, {
		maxCharsPerLine: options.maxCharsPerLine,
		maxLinesPerCue: options.maxLinesPerCue,
		offsetMs: options.offsetMs,
	});
	const issues: QcIssue[] = [...reflowed.issues, ...analyzeCues(reflowed.cues)];
	const qc = buildQcReport({
		issues,
		checkedSegments: parsed.cues.length + parsed.skipped,
		emittedCues: reflowed.cues.length,
		omittedSegments: parsed.skipped,
		omittedCues: parsed.cues.length - reflowed.cues.length,
	});

	if (reflowed.cues.length === 0) {
		return {
			ok: false,
			error: `Detected ${parsed.formatLabel}, but timeline QC omitted every cue. ${qc.summary}`,
			qc,
		};
	}

	const outputFormat = options.format === 'vtt' ? 'vtt' : 'srt';
	return {
		ok: true,
		inputFormat: parsed.format,
		inputFormatLabel: parsed.formatLabel,
		cues: reflowed.cues,
		output: serializeCues(reflowed.cues, outputFormat),
		qc,
		warnings: parsed.warnings,
	};
}

export const SAMPLE_RARE_SUBTITLES: Record<
	'ttml' | 'smi' | 'sbv' | 'lrc' | 'ass',
	{ filename: string; format: SubtitleInputFormat; label: string; content: string }
> = {
	ttml: {
		filename: 'harbor-walk.ttml',
		format: 'ttml',
		label: 'TTML / DFXP subtitles',
		content: `<?xml version="1.0" encoding="utf-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttp="http://www.w3.org/ns/ttml#parameter" xmlns:tts="http://www.w3.org/ns/ttml#styling" ttp:frameRate="30" ttp:tickRate="1000">
  <head>
    <styling>
      <style xml:id="base" tts:color="white" />
    </styling>
  </head>
  <body>
    <div>
      <p begin="00:00:00.500" end="00:00:03.000">Local conversion keeps<br/>every timestamp on your machine.</p>
      <p begin="00:00:03.200" dur="2.5s">Captions and lyrics stay in sync<br/>after a quick review pass.</p>
    </div>
  </body>
</tt>`,
	},
	smi: {
		filename: 'harbor-walk.smi',
		format: 'smi',
		label: 'SAMI captions',
		content: `<SAMI>
<HEAD>
<TITLE>Harbor Walk</TITLE>
</HEAD>
<BODY>
<SYNC Start=0><P Class=ENCC>Welcome to the old harbor walk.</P></SYNC>
<SYNC Start=3500><P Class=ENCC>We begin at the ferry pier<br>and follow the promenade.</P></SYNC>
<SYNC Start=7200><P Class=ENCC>Bring a light jacket for the evening wind.</P></SYNC>
<SYNC Start=11000><P Class=ENCC>&nbsp;</P></SYNC>
</BODY>
</SAMI>`,
	},
	sbv: {
		filename: 'bakery-reel.sbv',
		format: 'sbv',
		label: 'YouTube SBV captions',
		content: `0:00:00.000,0:00:03.400
The kitchen scene opens on a warm loaf of bread.

0:00:03.600,0:00:07.200
Flour dust hangs in the window light.

0:00:07.500,0:00:11.000
A quiet morning shift starts before sunrise.`,
	},
	lrc: {
		filename: 'harbor-lights.lrc',
		format: 'lrc',
		label: 'Synced LRC lyrics',
		content: `[ti:Harbor Lights]
[ar:Studio Session]
[al:Night Drive]
[by:jsontosrt]
[00:01.00]Street lamps shimmer on the water
[00:05.50]We count the ferries one by one
[00:10.25][00:40.25]Same line returns in the second verse
[00:14.75]The city hums a quiet tune`,
	},
	ass: {
		filename: 'harbor-reel.ass',
		format: 'ass',
		label: 'ASS / SSA dialogue',
		content: `[Script Info]
Title: Harbor Reel
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,0,2,20,20,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.50,0:00:03.20,Default,Ana,0,0,0,,{\\an8}Hold the shot, then pan left
Dialogue: 0,0:00:03.60,0:00:07.10,Default,Ana,0,0,0,,Flour, water, salt, and time\\Nmake the dough
Dialogue: 0,0:00:07.40,0:00:10.00,Default,Bruno,0,0,0,,The oven door closes\\hwith a soft click`,
	},
};
