import { analyzeCues, buildQcReport, type TimelineQcReport } from './timeline-qc';
import type { SubtitleCue } from './types';

export type ReverseJsonSchemaId =
	| 'openai-verbose-json'
	| 'deepgram-utterances'
	| 'generic-timestamped';

export type TimestampUnit = 'seconds' | 'milliseconds';

export interface SubtitleToJsonOptions {
	schema: ReverseJsonSchemaId;
	timestampUnit?: TimestampUnit;
	language?: string;
	detectSpeakers?: boolean;
	prettyIndent?: number;
}

export type SubtitleToJsonResult =
	| {
			ok: true;
			inputFormat: 'srt' | 'vtt' | 'ass';
			schema: ReverseJsonSchemaId;
			cueCount: number;
			durationSec: number;
			speakers: string[];
			data: Record<string, unknown>;
			json: string;
			qc: TimelineQcReport;
	  }
	| {
			ok: false;
			error: string;
	  };

export const SAMPLE_REVERSE_SUBTITLES: Record<
	'srt-speakers' | 'vtt-web' | 'ass-dialogue',
	{ filename: string; label: string; content: string }
> = {
	'srt-speakers': {
		filename: 'studio-session.srt',
		label: 'SRT with speaker prefixes',
		content: `1
00:00:00,500 --> 00:00:03,200
[SPEAKER_00]: Welcome to the studio session on caption timing.

2
00:00:03,400 --> 00:00:06,100
[SPEAKER_00] We start with raw SRT files and rebuild the transcript JSON.

3
00:00:06,300 --> 00:00:09,000
[SPEAKER_01]: Then we export the same cues without losing a single frame.

4
00:00:09,200 --> 00:00:12,400
[SPEAKER_01] Every timestamp stays on the original millisecond grid.`,
	},
	'vtt-web': {
		filename: 'product-demo.vtt',
		label: 'WebVTT with voice spans',
		content: `WEBVTT
Kind: captions
Language: en

NOTE This file exercises WebVTT voice spans and cue settings.

1
00:00:00.800 --> 00:00:03.600 align:start position:10%
<v Host>This demo walks through a reverse conversion from captions to JSON.

2
00:00:03.800 --> 00:00:06.900
<v Editor>We keep the cue settings out of the exported transcript.

3
00:00:07.100 --> 00:00:10.200 align:end
<v Host>Tags like <c.yellow>color classes</c> are removed from the clean text.`,
	},
	'ass-dialogue': {
		filename: 'studio-interview.ass',
		label: 'ASS Dialogue lines with actor names',
		content: `[Script Info]
Title: Studio interview captions
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,32,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,20,20,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.20,Default,Host,0,0,0,,Welcome back to the studio.\\NToday we rebuild the transcript JSON.
Dialogue: 0,0:00:04.40,0:00:07.80,Default,Guest,0,0,0,,{\\i1}Glad to be here{\\i0}. The parser keeps every cue intact.
Dialogue: 0,0:00:08.00,0:00:11.50,Default,,0,0,0,,This line has no speaker name and stays neutral.`,
	},
};

interface ParsedCue {
	startSec: number;
	endSec: number;
	text: string;
	speaker?: string;
}

interface ParsedSubtitles {
	format: 'srt' | 'vtt' | 'ass';
	cues: ParsedCue[];
	checkedBlocks: number;
	omittedBlocks: number;
}

const SCHEMA_IDS: readonly ReverseJsonSchemaId[] = [
	'openai-verbose-json',
	'deepgram-utterances',
	'generic-timestamped',
];

const TIME_TOKEN_RE = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/;
const ASS_TIME_RE = /^(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/;
const ASS_DEFAULT_FORMAT = [
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
const SPEAKER_GLUED_RE = /^SPEAKER[ _-]?\d{1,3}$/i;
const SPEAKER_PREFIX_RE = /^\[\s*([^\]]{1,40}?)\s*\]\s*(:)?\s+/;
const BARE_SPEAKER_PREFIX_RE = /^(SPEAKER[ _-]?\d{1,3})\s*:\s+/i;
const VTT_VOICE_RE = /<v(?:\.[^ >]+)*\s+([^>]+)>/i;

function round3(value: number): number {
	return Math.round(value * 1000) / 1000;
}

function normalizeNewlines(raw: string): string {
	return raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function parseTimeToken(token: string): number | null {
	const match = token.trim().match(TIME_TOKEN_RE);
	if (!match) return null;
	const hours = match[1] ? Number(match[1]) : 0;
	const minutes = Number(match[2]);
	const seconds = Number(match[3]);
	const fraction = match[4] ? Number(match[4].padEnd(3, '0')) : 0;
	const total = hours * 3600 + minutes * 60 + seconds + fraction / 1000;
	return Number.isFinite(total) ? total : null;
}

function parseArrowRange(line: string): { startSec: number; endSec: number } | null {
	const arrowIndex = line.indexOf('-->');
	if (arrowIndex < 0) return null;
	const left = line.slice(0, arrowIndex).trim();
	const right = line.slice(arrowIndex + 3).trim().split(/\s+/)[0] ?? '';
	const startSec = parseTimeToken(left);
	const endSec = parseTimeToken(right);
	if (startSec === null || endSec === null) return null;
	return { startSec: Math.max(0, startSec), endSec: Math.max(0, endSec) };
}

function parseAssTime(token: string): number | null {
	const match = token.trim().match(ASS_TIME_RE);
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	const seconds = Number(match[3]);
	const fractionText = match[4] ?? '';
	const fraction =
		fractionText.length === 0
			? 0
			: Number(fractionText) / Math.pow(10, fractionText.length);
	const total = hours * 3600 + minutes * 60 + seconds + fraction;
	return Number.isFinite(total) ? total : null;
}

function stripInlineMarkup(line: string): string {
	return line
		.replace(/\{\\?[^}]*\}/g, '')
		.replace(/<[^>]*>/g, '')
		.replace(/\\[Nnh]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function splitSpeakerPrefix(text: string): { speaker?: string; text: string } {
	const bracketed = text.match(SPEAKER_PREFIX_RE);
	if (bracketed) {
		const inner = (bracketed[1] ?? '').trim();
		const hasColon = Boolean(bracketed[2]);
		if (inner.length > 0 && (hasColon || SPEAKER_GLUED_RE.test(inner))) {
			return { speaker: inner, text: text.slice(bracketed[0].length).trim() };
		}
	}
	const bare = text.match(BARE_SPEAKER_PREFIX_RE);
	if (bare) {
		return { speaker: (bare[1] ?? '').trim(), text: text.slice(bare[0].length).trim() };
	}
	return { text };
}

function applySpeakerDetection(
	rawText: string,
	explicitSpeaker: string | undefined,
	detectSpeakers: boolean,
): { text: string; speaker?: string } {
	if (!detectSpeakers) {
		const cue: { text: string; speaker?: string } = { text: rawText };
		if (explicitSpeaker) cue.speaker = explicitSpeaker;
		return cue;
	}
	const split = splitSpeakerPrefix(rawText);
	const speaker = explicitSpeaker ?? split.speaker;
	const cue: { text: string; speaker?: string } = { text: split.text };
	if (speaker) cue.speaker = speaker;
	return cue;
}

function readCueBody(
	lines: string[],
	detectSpeakers: boolean,
): { text: string; speaker?: string } | null {
	const cleanLines = lines.map(stripInlineMarkup).filter((line) => line.length > 0);
	if (cleanLines.length === 0) return null;
	const detected = applySpeakerDetection(cleanLines.join(' '), undefined, detectSpeakers);
	detected.text = detected.text.trim();
	return detected.text.length > 0 ? detected : null;
}

function splitBlocks(text: string): string[] {
	return text
		.split(/\n{2,}/)
		.map((block) => block.trim())
		.filter((block) => block.length > 0);
}

function parseSrt(raw: string, detectSpeakers: boolean): ParsedSubtitles {
	const cues: ParsedCue[] = [];
	let checkedBlocks = 0;
	let omittedBlocks = 0;

	for (const block of splitBlocks(raw)) {
		const lines = block.split('\n');
		const timeLineIndex = lines.findIndex((line) => line.includes('-->'));
		if (timeLineIndex < 0) {
			if (/^(NOTE|STYLE|REGION)\b/i.test(lines[0] ?? '')) continue;
			if (lines.length > 0) omittedBlocks += 1;
			continue;
		}
		checkedBlocks += 1;
		const range = parseArrowRange(lines[timeLineIndex]!);
		const body = readCueBody(lines.slice(timeLineIndex + 1), detectSpeakers);
		if (!range || !body) {
			omittedBlocks += 1;
			continue;
		}
		const cue: ParsedCue = {
			startSec: range.startSec,
			endSec: range.endSec,
			text: body.text,
		};
		if (body.speaker) cue.speaker = body.speaker;
		cues.push(cue);
	}

	return { format: 'srt', cues, checkedBlocks, omittedBlocks };
}

function parseVtt(raw: string, detectSpeakers: boolean): ParsedSubtitles {
	const cues: ParsedCue[] = [];
	let checkedBlocks = 0;
	let omittedBlocks = 0;

	for (const block of splitBlocks(raw)) {
		const lines = block.split('\n');
		const first = (lines[0] ?? '').trim();
		if (/^(WEBVTT|NOTE|STYLE|REGION)\b/i.test(first)) continue;

		const timeLineIndex = lines.findIndex((line) => line.includes('-->'));
		if (timeLineIndex < 0) {
			if (lines.length > 0) omittedBlocks += 1;
			continue;
		}
		checkedBlocks += 1;
		const range = parseArrowRange(lines[timeLineIndex]!);
		if (!range) {
			omittedBlocks += 1;
			continue;
		}

		const textLines = lines.slice(timeLineIndex + 1);
		let voice: string | undefined;
		const cleanLines: string[] = [];
		for (const line of textLines) {
			const voiceMatch = line.match(VTT_VOICE_RE);
			if (voiceMatch && voiceMatch[1]) {
				voice = voiceMatch[1].trim();
			}
			const clean = stripInlineMarkup(line);
			if (clean.length > 0) cleanLines.push(clean);
		}
		if (cleanLines.length === 0) {
			omittedBlocks += 1;
			continue;
		}

		const detected = applySpeakerDetection(cleanLines.join(' '), voice, detectSpeakers);
		if (detected.text.length === 0) {
			omittedBlocks += 1;
			continue;
		}
		const cue: ParsedCue = {
			startSec: range.startSec,
			endSec: range.endSec,
			text: detected.text,
		};
		if (detected.speaker) cue.speaker = detected.speaker;
		cues.push(cue);
	}

	return { format: 'vtt', cues, checkedBlocks, omittedBlocks };
}

function splitAssFields(payload: string, count: number): string[] {
	const fields: string[] = [];
	let rest = payload;
	for (let i = 0; i < count - 1; i++) {
		const commaIndex = rest.indexOf(',');
		if (commaIndex < 0) {
			fields.push(rest);
			rest = '';
			continue;
		}
		fields.push(rest.slice(0, commaIndex));
		rest = rest.slice(commaIndex + 1);
	}
	fields.push(rest);
	while (fields.length < count) fields.push('');
	return fields;
}

function readAssText(rawText: string): string {
	return rawText
		.replace(/\{[^}]*\}/g, '')
		.replace(/\\N/g, ' ')
		.replace(/\\n/g, ' ')
		.replace(/\\h/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function parseAss(raw: string, detectSpeakers: boolean): ParsedSubtitles {
	const cues: ParsedCue[] = [];
	let checkedBlocks = 0;
	let omittedBlocks = 0;
	let section = '';
	let formatFields = ASS_DEFAULT_FORMAT;

	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;
		const sectionMatch = trimmed.match(/^\[(.+)\]$/);
		if (sectionMatch) {
			section = (sectionMatch[1] ?? '').toLowerCase();
			continue;
		}
		if (section !== 'events' && !/^(Dialogue|Comment)\s*:/i.test(trimmed)) continue;

		if (/^Format\s*:/i.test(trimmed)) {
			const value = trimmed.slice(trimmed.indexOf(':') + 1);
			formatFields = value.split(',').map((field) => field.trim().toLowerCase());
			continue;
		}
		if (/^Comment\s*:/i.test(trimmed)) continue;
		if (!/^Dialogue\s*:/i.test(trimmed)) continue;

		checkedBlocks += 1;
		const value = trimmed.slice(trimmed.indexOf(':') + 1).trim();
		const fields = splitAssFields(value, formatFields.length);
		const startIdx = formatFields.indexOf('start');
		const endIdx = formatFields.indexOf('end');
		const textIdx = formatFields.indexOf('text');
		const nameIdx = formatFields.indexOf('name');
		if (startIdx < 0 || endIdx < 0 || textIdx < 0) {
			omittedBlocks += 1;
			continue;
		}

		const startSec = parseAssTime(fields[startIdx] ?? '');
		const endSec = parseAssTime(fields[endIdx] ?? '');
		const text = readAssText(fields[textIdx] ?? '');
		if (startSec === null || endSec === null || text.length === 0) {
			omittedBlocks += 1;
			continue;
		}

		const name = nameIdx >= 0 ? (fields[nameIdx] ?? '').trim() : '';
		const detected = applySpeakerDetection(
			text,
			name.length > 0 ? name : undefined,
			detectSpeakers,
		);
		if (detected.text.length === 0) {
			omittedBlocks += 1;
			continue;
		}
		const cue: ParsedCue = {
			startSec: Math.max(0, startSec),
			endSec: Math.max(0, endSec),
			text: detected.text,
		};
		if (detected.speaker) cue.speaker = detected.speaker;
		cues.push(cue);
	}

	return { format: 'ass', cues, checkedBlocks, omittedBlocks };
}

function detectFormat(raw: string): 'srt' | 'vtt' | 'ass' | null {
	if (
		/^\s*\[Script Info\]/im.test(raw) ||
		/^\s*\[Events\]/im.test(raw) ||
		/^\s*Dialogue\s*:/im.test(raw)
	) {
		return 'ass';
	}
	if (/^\s*WEBVTT/.test(raw)) return 'vtt';
	if (raw.includes('-->')) return 'srt';
	return null;
}

function toDeepgramSpeaker(speaker: string | undefined): string | number {
	if (!speaker) return 0;
	if (/^\d+$/.test(speaker)) return Number(speaker);
	return speaker;
}

function buildOpenAiPayload(
	cues: ParsedCue[],
	durationSec: number,
	options: SubtitleToJsonOptions,
): Record<string, unknown> {
	const text = cues
		.map((cue) => cue.text)
		.join(' ')
		.replace(/\s+/g, ' ')
		.trim();
	return {
		task: 'transcribe',
		language: options.language && options.language.trim().length > 0 ? options.language : 'en',
		duration: round3(durationSec),
		text,
		segments: cues.map((cue, idx) => ({
			id: idx,
			seek: 0,
			start: round3(cue.startSec),
			end: round3(cue.endSec),
			text: cue.text,
		})),
	};
}

function buildDeepgramPayload(
	cues: ParsedCue[],
	durationSec: number,
): Record<string, unknown> {
	return {
		metadata: {
			duration: round3(durationSec),
			channels: 1,
		},
		results: {
			utterances: cues.map((cue, idx) => ({
				id: `utt_${idx}`,
				start: round3(cue.startSec),
				end: round3(cue.endSec),
				confidence: 1,
				channel: 0,
				transcript: cue.text,
				speaker: toDeepgramSpeaker(cue.speaker),
			})),
		},
	};
}

function buildGenericPayload(
	cues: ParsedCue[],
	durationSec: number,
	unit: TimestampUnit,
): Record<string, unknown> {
	const convert = (value: number): number =>
		unit === 'milliseconds' ? Math.round(value * 1000) : round3(value);

	return {
		format: 'generic-timestamped-json',
		timestamp_unit: unit,
		cue_count: cues.length,
		duration: unit === 'milliseconds' ? Math.round(durationSec * 1000) : round3(durationSec),
		cues: cues.map((cue, idx) => {
			const item: Record<string, unknown> = {
				index: idx + 1,
				start: convert(cue.startSec),
				end: convert(cue.endSec),
				duration: convert(Math.max(0, cue.endSec - cue.startSec)),
				text: cue.text,
			};
			if (cue.speaker) item.speaker = cue.speaker;
			return item;
		}),
	};
}

export function convertSubtitleToJson(
	rawSubtitleText: string,
	options: SubtitleToJsonOptions,
): SubtitleToJsonResult {
	if (typeof rawSubtitleText !== 'string' || rawSubtitleText.trim().length === 0) {
		return {
			ok: false,
			error: 'Empty input. Paste or upload an SRT, VTT, or ASS subtitle file to convert.',
		};
	}
	if (!SCHEMA_IDS.includes(options.schema)) {
		return {
			ok: false,
			error:
				'Unknown target schema. Choose openai-verbose-json, deepgram-utterances, or generic-timestamped.',
		};
	}

	const detectSpeakers = options.detectSpeakers !== false;
	const normalized = normalizeNewlines(rawSubtitleText);
	const format = detectFormat(normalized);
	if (!format) {
		return {
			ok: false,
			error:
				'Unrecognized subtitle format. Expected an SRT timeline with --> arrows, a WebVTT file, or an ASS [Events] Dialogue list.',
		};
	}

	const parsed =
		format === 'ass'
			? parseAss(normalized, detectSpeakers)
			: format === 'vtt'
				? parseVtt(normalized, detectSpeakers)
				: parseSrt(normalized, detectSpeakers);

	if (parsed.cues.length === 0) {
		return {
			ok: false,
			error: `Detected ${format.toUpperCase()} input, but found no readable subtitle cues with valid timestamps and text.`,
		};
	}

	const cues = parsed.cues;
	const durationSec = round3(
		cues.reduce((max, cue) => Math.max(max, cue.endSec), 0),
	);

	const speakerSet = new Set<string>();
	for (const cue of cues) {
		if (cue.speaker) speakerSet.add(cue.speaker);
	}
	const speakers = Array.from(speakerSet);

	const qcCues: SubtitleCue[] = cues.map((cue, idx) => {
		const item: SubtitleCue = {
			index: idx + 1,
			startSec: cue.startSec,
			endSec: cue.endSec,
			lines: [cue.text],
		};
		if (cue.speaker) item.speaker = cue.speaker;
		return item;
	});
	const qc = buildQcReport({
		issues: analyzeCues(qcCues),
		checkedSegments: parsed.checkedBlocks,
		emittedCues: cues.length,
		omittedSegments: parsed.omittedBlocks,
		omittedCues: 0,
	});

	let data: Record<string, unknown>;
	if (options.schema === 'openai-verbose-json') {
		data = buildOpenAiPayload(cues, durationSec, options);
	} else if (options.schema === 'deepgram-utterances') {
		data = buildDeepgramPayload(cues, durationSec);
	} else {
		data = buildGenericPayload(cues, durationSec, options.timestampUnit ?? 'seconds');
	}

	const indent = Math.max(
		0,
		Math.min(10, Math.round(options.prettyIndent === undefined ? 2 : options.prettyIndent)),
	);

	return {
		ok: true,
		inputFormat: format,
		schema: options.schema,
		cueCount: cues.length,
		durationSec,
		speakers,
		data,
		json: JSON.stringify(data, null, indent),
		qc,
	};
}
