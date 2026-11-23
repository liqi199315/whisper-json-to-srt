import type { SubtitleCue } from './types';
import { serializeCues } from './subtitle-engine';
import { analyzeCues, buildQcReport } from './timeline-qc';
import type { TimelineQcReport } from './timeline-qc';

export type MergeMode = 'stacked' | 'interleave' | 'sequential';

export interface MergeTrackInput {
	id: string;
	name: string;
	label?: string;
	content: string;
}

export interface MergeSubtitlesOptions {
	mode: MergeMode;
	outputFormat: 'srt' | 'vtt';
	toleranceMs: number;
	sequentialGapMs: number;
	includeLabels: boolean;
}

export interface MergeCueDiffItem {
	cueIndex: number;
	startSec: number;
	endSec: number;
	sourceTracks: string[];
	driftMs: number;
	overlapMs: number;
	status: 'aligned' | 'drift' | 'overlap' | 'unmatched';
	note: string;
	lines: string[];
}

export type MergeSubtitlesResult =
	| {
			ok: true;
			cues: SubtitleCue[];
			output: string;
			qc: TimelineQcReport;
			diffPreview: MergeCueDiffItem[];
			stats: {
				trackCount: number;
				inputCueCounts: number[];
				outputCueCount: number;
				alignedCount: number;
				driftCount: number;
				overlapCount: number;
				unmatchedCount: number;
			};
	  }
	| {
			ok: false;
			error: string;
	  };

export const MAX_MERGE_TRACKS = 10;
export const MIN_MERGE_TRACKS = 2;

interface ParsedTiming {
	startSec: number;
	endSec: number;
	separator: ',' | '.';
}

interface PreparedTrack {
	id: string;
	name: string;
	cues: SubtitleCue[];
}

interface DraftCue {
	seq: number;
	startSec: number;
	endSec: number;
	lines: string[];
	sourceTracks: string[];
	driftMs: number;
	status: 'aligned' | 'drift' | 'overlap' | 'unmatched';
	note: string;
}

const EPSILON = 1e-9;

function normalizeNewlines(raw: string): string {
	return raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function parseClockToken(token: string): { seconds: number; separator: ',' | '.' } | null {
	const match = /^(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})([,.])(\d{1,3})$/.exec(token.trim());
	if (!match) return null;
	const hours = match[1] ? Number(match[1]) : 0;
	const minutes = Number(match[2]);
	const seconds = Number(match[3]);
	const separator = match[4] as ',' | '.';
	const millis = Number(match[5]!.padEnd(3, '0'));
	if (minutes > 59 || seconds > 59) return null;
	const total = hours * 3600 + minutes * 60 + seconds + millis / 1000;
	if (!Number.isFinite(total)) return null;
	return { seconds: total, separator };
}

function parseTimingLine(line: string): ParsedTiming | null {
	const arrowIndex = line.indexOf('-->');
	if (arrowIndex < 0) return null;
	const startRaw = line.slice(0, arrowIndex).trim();
	const endRaw = line.slice(arrowIndex + 3).trim().split(/\s+/)[0] ?? '';
	const start = parseClockToken(startRaw);
	const end = parseClockToken(endRaw);
	if (!start || !end) return null;
	return { startSec: start.seconds, endSec: end.seconds, separator: start.separator };
}

export function parseTrackSrtOrVtt(
	rawText: string,
): { ok: true; format: 'srt' | 'vtt'; cues: SubtitleCue[] } | { ok: false; error: string } {
	if (typeof rawText !== 'string' || rawText.trim().length === 0) {
		return { ok: false, error: 'Track content is empty.' };
	}

	const lines = normalizeNewlines(rawText).split('\n');
	let isVtt = false;
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		isVtt = /^WEBVTT\b/i.test(trimmed);
		break;
	}

	const blocks: string[][] = [];
	let current: string[] = [];
	for (const line of lines) {
		if (line.trim() === '') {
			if (current.length > 0) {
				blocks.push(current);
				current = [];
			}
			continue;
		}
		current.push(line);
	}
	if (current.length > 0) blocks.push(current);

	const cues: SubtitleCue[] = [];
	let sawComma = false;
	let sawDot = false;

	for (const block of blocks) {
		const first = block[0]?.trim() ?? '';
		if (/^(NOTE|STYLE|REGION)\b/i.test(first)) continue;

		const timingIndex = block.findIndex((line) => line.includes('-->'));
		if (timingIndex < 0) continue;

		const timing = parseTimingLine(block[timingIndex]!);
		if (!timing) continue;
		if (timing.separator === ',') sawComma = true;
		else sawDot = true;

		const textLines = block
			.slice(timingIndex + 1)
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
		if (textLines.length === 0) continue;

		cues.push({
			index: cues.length + 1,
			startSec: timing.startSec,
			endSec: timing.endSec,
			lines: textLines,
		});
	}

	if (cues.length === 0) {
		return {
			ok: false,
			error:
				'No timed cues were found. Use SRT blocks or WebVTT cues with a timing line like 00:00:01,000 --> 00:00:02,000.',
		};
	}

	const format: 'srt' | 'vtt' = isVtt || (sawDot && !sawComma) ? 'vtt' : 'srt';
	return { ok: true, format, cues };
}

function sortCues(cues: SubtitleCue[]): SubtitleCue[] {
	return [...cues].sort(
		(a, b) => a.startSec - b.startSec || a.endSec - b.endSec || a.index - b.index,
	);
}

function midpoint(cue: SubtitleCue): number {
	return (cue.startSec + cue.endSec) / 2;
}

function roundSeconds(value: number): number {
	return Math.round(value * 1e6) / 1e6;
}

function bracketLabel(label: string | undefined): string {
	const text = (label ?? '').trim();
	if (!text) return '';
	if (text.length >= 2 && text.startsWith('[') && text.endsWith(']')) return `${text} `;
	return `[${text}] `;
}

function applyLabel(cue: SubtitleCue, prefix: string): SubtitleCue {
	if (!prefix) return cue;
	const [first = '', ...rest] = cue.lines;
	return { ...cue, lines: [`${prefix}${first}`, ...rest] };
}

function overlapNote(overlapMs: number): string {
	if (overlapMs > 0) return `Starts ${overlapMs} ms before the previous cue ends.`;
	return 'Starts less than 1 ms before the previous cue ends.';
}

function finalizeDrafts(drafts: DraftCue[]): {
	cues: SubtitleCue[];
	diffPreview: MergeCueDiffItem[];
} {
	const ordered = [...drafts].sort(
		(a, b) => a.startSec - b.startSec || a.endSec - b.endSec || a.seq - b.seq,
	);

	const cues: SubtitleCue[] = [];
	const diffPreview: MergeCueDiffItem[] = [];
	let previousEnd: number | null = null;

	ordered.forEach((draft, position) => {
		const cueIndex = position + 1;
		const overlapRaw = previousEnd === null ? 0 : previousEnd - draft.startSec;
		const overlapMs = overlapRaw > 0 ? Math.round(overlapRaw * 1000) : 0;

		let status = draft.status;
		let note = draft.note;
		if (overlapRaw > EPSILON) {
			if (status === 'aligned') {
				status = 'overlap';
				note = overlapNote(overlapMs);
			} else {
				note = note ? `${note} ${overlapNote(overlapMs)}` : overlapNote(overlapMs);
			}
		} else if (!note) {
			note =
				cueIndex === 1
					? 'First cue in the merged timeline.'
					: 'No overlap with the previous cue.';
		}

		const cue: SubtitleCue = {
			index: cueIndex,
			startSec: draft.startSec,
			endSec: draft.endSec,
			lines: draft.lines,
		};
		cues.push(cue);
		diffPreview.push({
			cueIndex,
			startSec: draft.startSec,
			endSec: draft.endSec,
			sourceTracks: draft.sourceTracks,
			driftMs: draft.driftMs,
			overlapMs,
			status,
			note,
			lines: [...draft.lines],
		});
		previousEnd = draft.endSec;
	});

	return { cues, diffPreview };
}

function mergeStacked(
	tracks: PreparedTrack[],
	toleranceMs: number,
): { cues: SubtitleCue[]; diffPreview: MergeCueDiffItem[] } {
	const anchor = tracks[0]!;
	const toleranceSec = toleranceMs / 1000;
	const driftLimitMs = toleranceMs > 0 ? toleranceMs / 2 : 150;

	const matches = new Map<number, Array<{ id: string; cue: SubtitleCue }>>();
	const unmatchedSecondary: Array<{ id: string; cue: SubtitleCue }> = [];

	for (let trackIndex = 1; trackIndex < tracks.length; trackIndex++) {
		const track = tracks[trackIndex]!;
		for (const cue of track.cues) {
			let bestAnchor = -1;
			let bestMidDistance = Number.POSITIVE_INFINITY;
			let bestStartDistance = Number.POSITIVE_INFINITY;

			for (let anchorIndex = 0; anchorIndex < anchor.cues.length; anchorIndex++) {
				const candidate = anchor.cues[anchorIndex]!;
				const withinWindow =
					cue.startSec <= candidate.endSec + toleranceSec &&
					cue.endSec >= candidate.startSec - toleranceSec;
				if (!withinWindow) continue;

				const midDistance = Math.abs(midpoint(cue) - midpoint(candidate));
				const startDistance = Math.abs(cue.startSec - candidate.startSec);
				const isCloser =
					midDistance < bestMidDistance - EPSILON ||
					(Math.abs(midDistance - bestMidDistance) <= EPSILON &&
						startDistance < bestStartDistance - EPSILON);
				if (isCloser) {
					bestAnchor = anchorIndex;
					bestMidDistance = midDistance;
					bestStartDistance = startDistance;
				}
			}

			if (bestAnchor >= 0) {
				const bucket = matches.get(bestAnchor) ?? [];
				bucket.push({ id: track.id, cue });
				matches.set(bestAnchor, bucket);
			} else {
				unmatchedSecondary.push({ id: track.id, cue });
			}
		}
	}

	const drafts: DraftCue[] = [];
	let seq = 0;

	for (let anchorIndex = 0; anchorIndex < anchor.cues.length; anchorIndex++) {
		const anchorCue = anchor.cues[anchorIndex]!;
		const bucket = matches.get(anchorIndex) ?? [];
		const lines = [...anchorCue.lines];
		const sourceTracks = [anchor.id];
		let driftMs = 0;

		for (const match of bucket) {
			lines.push(...match.cue.lines);
			if (!sourceTracks.includes(match.id)) sourceTracks.push(match.id);
			const startDrift = Math.round(Math.abs(match.cue.startSec - anchorCue.startSec) * 1000);
			if (startDrift > driftMs) driftMs = startDrift;
		}

		let status: DraftCue['status'];
		let note: string;
		if (bucket.length === 0) {
			status = 'unmatched';
			note = `No secondary cue matched this anchor cue within ${toleranceMs} ms.`;
		} else if (driftMs > driftLimitMs) {
			status = 'drift';
			note = `Start times drift by ${driftMs} ms across ${bucket.length} matched cue(s); the limit is ${driftLimitMs} ms.`;
		} else {
			status = 'aligned';
			note = 'Aligned with the anchor cue.';
		}

		drafts.push({
			seq: seq++,
			startSec: anchorCue.startSec,
			endSec: anchorCue.endSec,
			lines,
			sourceTracks,
			driftMs,
			status,
			note,
		});
	}

	for (const item of unmatchedSecondary) {
		drafts.push({
			seq: seq++,
			startSec: item.cue.startSec,
			endSec: item.cue.endSec,
			lines: [...item.cue.lines],
			sourceTracks: [item.id],
			driftMs: 0,
			status: 'unmatched',
			note: `No anchor cue matched this cue within ${toleranceMs} ms.`,
		});
	}

	return finalizeDrafts(drafts);
}

function mergeInterleave(tracks: PreparedTrack[]): {
	cues: SubtitleCue[];
	diffPreview: MergeCueDiffItem[];
} {
	const entries: Array<{
		trackIndex: number;
		track: PreparedTrack;
		cue: SubtitleCue;
	}> = [];

	tracks.forEach((track, trackIndex) => {
		for (const cue of track.cues) entries.push({ trackIndex, track, cue });
	});

	entries.sort(
		(a, b) =>
			a.cue.startSec - b.cue.startSec ||
			a.cue.endSec - b.cue.endSec ||
			a.trackIndex - b.trackIndex ||
			a.cue.index - b.cue.index,
	);

	const drafts: DraftCue[] = entries.map((entry, seq) => ({
		seq,
		startSec: entry.cue.startSec,
		endSec: entry.cue.endSec,
		lines: [...entry.cue.lines],
		sourceTracks: [entry.track.id],
		driftMs: 0,
		status: 'aligned',
		note: '',
	}));

	return finalizeDrafts(drafts);
}

function mergeSequential(
	tracks: PreparedTrack[],
	sequentialGapMs: number,
): { cues: SubtitleCue[]; diffPreview: MergeCueDiffItem[] } {
	const gapSec = sequentialGapMs / 1000;
	const drafts: DraftCue[] = [];
	let runningEnd = 0;
	let seq = 0;

	tracks.forEach((track, trackIndex) => {
		const firstStart = track.cues[0]!.startSec;
		const shift = trackIndex === 0 ? 0 : runningEnd + gapSec - firstStart;
		let trackMaxEnd = 0;

		for (const cue of track.cues) {
			const startSec = roundSeconds(cue.startSec + shift);
			const endSec = roundSeconds(cue.endSec + shift);
			drafts.push({
				seq: seq++,
				startSec,
				endSec,
				lines: [...cue.lines],
				sourceTracks: [track.id],
				driftMs: 0,
				status: 'aligned',
				note: '',
			});
			if (endSec > trackMaxEnd) trackMaxEnd = endSec;
		}

		if (trackMaxEnd > runningEnd) runningEnd = trackMaxEnd;
	});

	return finalizeDrafts(drafts);
}

export function mergeSubtitleTracks(
	tracks: MergeTrackInput[],
	options: MergeSubtitlesOptions,
): MergeSubtitlesResult {
	if (!Array.isArray(tracks)) {
		return { ok: false, error: 'Merge input must be an array of tracks.' };
	}
	if (tracks.length < MIN_MERGE_TRACKS) {
		return {
			ok: false,
			error: `Merge needs at least ${MIN_MERGE_TRACKS} tracks. Received ${tracks.length}.`,
		};
	}
	if (tracks.length > MAX_MERGE_TRACKS) {
		return {
			ok: false,
			error: `Merge supports at most ${MAX_MERGE_TRACKS} tracks. Received ${tracks.length}.`,
		};
	}

	const mode = options?.mode;
	if (mode !== 'stacked' && mode !== 'interleave' && mode !== 'sequential') {
		return {
			ok: false,
			error: `Unknown merge mode "${String(mode)}". Use stacked, interleave, or sequential.`,
		};
	}

	const outputFormat = options.outputFormat;
	if (outputFormat !== 'srt' && outputFormat !== 'vtt') {
		return {
			ok: false,
			error: `Unknown output format "${String(outputFormat)}". Use srt or vtt.`,
		};
	}

	const toleranceMs = Number(options.toleranceMs);
	if (!Number.isFinite(toleranceMs) || toleranceMs < 0) {
		return { ok: false, error: 'toleranceMs must be a non-negative number.' };
	}

	const sequentialGapMs = Number(options.sequentialGapMs);
	if (!Number.isFinite(sequentialGapMs) || sequentialGapMs < 0) {
		return { ok: false, error: 'sequentialGapMs must be a non-negative number.' };
	}

	const includeLabels = options.includeLabels === true;
	const prepared: PreparedTrack[] = [];
	const inputCueCounts: number[] = [];

	for (let index = 0; index < tracks.length; index++) {
		const track = tracks[index]!;
		const name = track.name?.trim() || track.id?.trim() || `Track ${index + 1}`;
		const id = track.id?.trim() || name;
		const parsed = parseTrackSrtOrVtt(track.content);
		if (!parsed.ok) {
			return {
				ok: false,
				error: `Track ${index + 1} ("${name}") has no valid cues. ${parsed.error}`,
			};
		}
		if (parsed.cues.length === 0) {
			return {
				ok: false,
				error: `Track ${index + 1} ("${name}") has no valid cues.`,
			};
		}

		const labelPrefix = includeLabels ? bracketLabel(track.label) : '';
		const cues = sortCues(parsed.cues).map((cue, cueIndex) => {
			const base: SubtitleCue = { ...cue, index: cueIndex + 1 };
			return applyLabel(base, labelPrefix);
		});

		prepared.push({ id, name, cues });
		inputCueCounts.push(cues.length);
	}

	const merged =
		mode === 'stacked'
			? mergeStacked(prepared, toleranceMs)
			: mode === 'interleave'
				? mergeInterleave(prepared)
				: mergeSequential(prepared, sequentialGapMs);

	const issues = analyzeCues(merged.cues);
	const totalInputCues = inputCueCounts.reduce((total, count) => total + count, 0);
	const qc = buildQcReport({
		issues,
		checkedSegments: totalInputCues,
		emittedCues: merged.cues.length,
		omittedSegments: 0,
		omittedCues: 0,
	});

	const stats = {
		trackCount: tracks.length,
		inputCueCounts,
		outputCueCount: merged.cues.length,
		alignedCount: 0,
		driftCount: 0,
		overlapCount: 0,
		unmatchedCount: 0,
	};
	for (const item of merged.diffPreview) {
		if (item.status === 'aligned') stats.alignedCount += 1;
		else if (item.status === 'drift') stats.driftCount += 1;
		else if (item.status === 'overlap') stats.overlapCount += 1;
		else stats.unmatchedCount += 1;
	}

	return {
		ok: true,
		cues: merged.cues,
		output: serializeCues(merged.cues, outputFormat),
		qc,
		diffPreview: merged.diffPreview,
		stats,
	};
}

export const SAMPLE_BILINGUAL_TRACKS: MergeTrackInput[] = [
	{
		id: 'en',
		name: 'English',
		label: 'EN',
		content: `1
00:00:00,500 --> 00:00:02,800
Welcome back to the workshop.

2
00:00:03,000 --> 00:00:05,600
Today we assemble the frame.

3
00:00:06,000 --> 00:00:08,400
Keep every screw in the tray.

4
00:00:09,000 --> 00:00:11,200
Let us review the checklist.
`,
	},
	{
		id: 'zh',
		name: 'Chinese',
		label: 'ZH',
		content: `WEBVTT

00:00:00.500 --> 00:00:02.800
欢迎回到工作坊。

00:00:03.320 --> 00:00:05.920
今天我们组装框架。

00:00:06.000 --> 00:00:08.400
把每颗螺丝放在托盘里。

00:00:09.000 --> 00:00:11.200
我们来核对清单。
`,
	},
];
