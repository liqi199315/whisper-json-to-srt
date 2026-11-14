import type { SubtitleCue } from './types';

export type QcSeverity = 'error' | 'warning' | 'info';
export type QcScope = 'segment' | 'cue';

export type QcIssueCode =
	| 'invalid-time'
	| 'unrepresentable-time'
	| 'negative-time'
	| 'reversed-range'
	| 'zero-duration'
	| 'overlap'
	| 'empty-segment'
	| 'empty-cue'
	| 'offset-clamped';

export interface QcIssue {
	code: QcIssueCode;
	severity: QcSeverity;
	scope: QcScope;
	index: number;
	field?: string;
	value?: string;
	relatedIndex?: number;
	message: string;
}

export interface TimelineQcReport {
	status: 'clean' | 'warning' | 'error';
	checkedSegments: number;
	emittedCues: number;
	omittedSegments: number;
	omittedCues: number;
	errorCount: number;
	warningCount: number;
	infoCount: number;
	issues: QcIssue[];
	summary: string;
}

export type QcSink = (issue: QcIssue) => void;

export interface TimelineScan {
	issues: QcIssue[];
	checkedSegments: number;
	omittedSegments: number;
}

const EPSILON = 1e-9;
const OVERLAP_TOLERANCE_SEC = 1e-6;

export function isRepresentableSeconds(seconds: number): boolean {
	if (!Number.isFinite(seconds)) return false;
	const milliseconds = Math.round(seconds * 1000);
	return Number.isFinite(milliseconds) && Math.abs(milliseconds) <= Number.MAX_SAFE_INTEGER;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeValue(value: unknown): string {
	if (typeof value === 'number') return String(value);
	if (typeof value === 'string') return JSON.stringify(value);
	if (value === null) return 'null';
	if (Array.isArray(value)) return 'an array';
	if (value === undefined) return 'missing';
	return typeof value;
}

function describeKind(value: unknown): string {
	if (typeof value === 'number') {
		return Number.isFinite(value) ? 'a number' : 'a non-finite number';
	}
	if (typeof value === 'string') return 'a string';
	if (value === null) return 'null';
	if (Array.isArray(value)) return 'an array';
	return typeof value;
}

interface TimeInspection {
	seconds: number | null;
	issue?: QcIssue;
	omitted: boolean;
}

interface InspectTimeOptions {
	scale: number;
	index: number;
	field: string;
	required: boolean;
	unit: 'segment' | 'utterance' | 'word' | 'transcript';
	context?: string;
}

function failureNote(required: boolean, unit: InspectTimeOptions['unit']): string {
	if (required) return ' The segment was omitted from the subtitle output.';
	if (unit === 'word') return ' Word timing was interpolated from nearby words.';
	return ' The value was ignored in favour of a fallback timing source.';
}

function inspectTime(raw: unknown, options: InspectTimeOptions): TimeInspection {
	const { scale, index, field, required, unit, context } = options;
	const prefix = context
		? `${context} ${field}`
		: `${unit.charAt(0).toUpperCase()}${unit.slice(1)} ${index} ${field}`;

	if (raw === undefined || raw === null) {
		if (!required) return { seconds: null, omitted: false };
		return {
			seconds: null,
			omitted: true,
			issue: {
				code: 'invalid-time',
				severity: 'error',
				scope: 'segment',
				index,
				field,
				value: describeValue(raw),
				message: `${prefix} is ${describeValue(raw)}.${failureNote(required, unit)}`,
			},
		};
	}

	if (typeof raw !== 'number') {
		return {
			seconds: null,
			omitted: required,
			issue: {
				code: 'invalid-time',
				severity: required ? 'error' : 'warning',
				scope: 'segment',
				index,
				field,
				value: describeValue(raw),
				message: `${prefix} is ${describeKind(raw)} (${describeValue(raw)}), not a JSON number.${failureNote(required, unit)}`,
			},
		};
	}

	if (!Number.isFinite(raw)) {
		return {
			seconds: null,
			omitted: required,
			issue: {
				code: 'invalid-time',
				severity: required ? 'error' : 'warning',
				scope: 'segment',
				index,
				field,
				value: String(raw),
				message: `${prefix} is ${String(raw)}, which is not a finite number.${failureNote(required, unit)}`,
			},
		};
	}

	const seconds = raw * scale;
	if (!isRepresentableSeconds(seconds)) {
		return {
			seconds: null,
			omitted: required,
			issue: {
				code: 'unrepresentable-time',
				severity: required ? 'error' : 'warning',
				scope: 'segment',
				index,
				field,
				value: String(raw),
				message: `${prefix} is ${String(raw)}, which overflows a millisecond subtitle timestamp.${failureNote(required, unit)}`,
			},
		};
	}

	if (seconds < 0) {
		if (!required) {
			return {
				seconds: null,
				omitted: false,
				issue: {
					code: 'negative-time',
					severity: 'warning',
					scope: 'segment',
					index,
					field,
					value: String(raw),
					message: `${prefix} is ${String(raw)} seconds before zero.${failureNote(required, unit)}`,
				},
			};
		}
		return {
			seconds: 0,
			omitted: false,
			issue: {
				code: 'negative-time',
				severity: 'warning',
				scope: 'segment',
				index,
				field,
				value: String(raw),
				message: `${prefix} is ${String(raw)}. It was clamped to 0.000 s in the subtitle output.`,
			},
		};
	}

	return { seconds, omitted: false };
}

function compareRange(
	start: number | null,
	end: number | null,
	index: number,
	context: string,
): QcIssue | undefined {
	if (start === null || end === null) return undefined;
	if (end < start - EPSILON) {
		return {
			code: 'reversed-range',
			severity: 'warning',
			scope: 'segment',
			index,
			field: 'range',
			value: `${start} -> ${end}`,
			message: `${context} ends at ${end} s before it starts at ${start} s. Timing was left unchanged for review.`,
		};
	}
	if (Math.abs(end - start) < EPSILON) {
		return {
			code: 'zero-duration',
			severity: 'info',
			scope: 'segment',
			index,
			field: 'range',
			value: `${start} -> ${end}`,
			message: `${context} has zero duration at ${start} s. Timing was left unchanged for review.`,
		};
	}
	return undefined;
}

function pushIssue(issues: QcIssue[], issue: QcIssue | undefined): void {
	if (issue) issues.push(issue);
}

function readUnitText(item: Record<string, unknown>): string {
	const candidates = [item.text, item.transcript];
	for (const candidate of candidates) {
		if (typeof candidate === 'string' && candidate.trim().length > 0) {
			return candidate.trim();
		}
	}
	return '';
}

function countWords(item: Record<string, unknown>): number {
	if (!Array.isArray(item.words)) return 0;
	let count = 0;
	for (const word of item.words) {
		if (!isRecord(word)) continue;
		if (typeof word.word === 'string' && word.word.trim().length > 0) {
			count += 1;
		} else if (typeof word.text === 'string' && word.text.trim().length > 0) {
			count += 1;
		}
	}
	return count;
}

function scanWhisperSegments(root: Record<string, unknown>): TimelineScan {
	const issues: QcIssue[] = [];
	const omitted = new Set<number>();
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
			field: 'start',
			required: true,
			unit: 'segment',
		});
		const end = inspectTime(item.end, {
			scale: 1,
			index,
			field: 'end',
			required: true,
			unit: 'segment',
		});
		pushIssue(issues, start.issue);
		pushIssue(issues, end.issue);
		if (start.omitted || end.omitted) omitted.add(index);
		pushIssue(
			issues,
			compareRange(start.seconds, end.seconds, index, `Segment ${index}`),
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
					unit: 'word',
					context: `Segment ${index}`,
				});
				const wordEnd = inspectTime(word.end, {
					scale: 1,
					index,
					field: `words[${wordIdx + 1}].end`,
					required: false,
					unit: 'word',
					context: `Segment ${index}`,
				});
				pushIssue(issues, wordStart.issue);
				pushIssue(issues, wordEnd.issue);
				pushIssue(
					issues,
					compareRange(
						wordStart.seconds,
						wordEnd.seconds,
						index,
						`Segment ${index} word ${wordIdx + 1}`,
					),
				);
			});
		}

		if (!readUnitText(item) && countWords(item) === 0) {
			omitted.add(index);
			issues.push({
				code: 'empty-segment',
				severity: 'warning',
				scope: 'segment',
				index,
				field: 'text',
				message: `Segment ${index} has no caption text and no words. The segment was omitted from the subtitle output.`,
			});
		}
	});

	const topWords = Array.isArray(root.words)
		? root.words
		: Array.isArray(root.word_segments)
			? root.word_segments
			: null;
	if (!anyNestedWords && topWords) {
		topWords.forEach((word, wordIdx) => {
			if (!isRecord(word)) return;
			const wordStart = inspectTime(word.start, {
				scale: 1,
				index: wordIdx + 1,
				field: 'start',
				required: false,
				unit: 'word',
				context: `Top-level word ${wordIdx + 1}`,
			});
			const wordEnd = inspectTime(word.end, {
				scale: 1,
				index: wordIdx + 1,
				field: 'end',
				required: false,
				unit: 'word',
				context: `Top-level word ${wordIdx + 1}`,
			});
			pushIssue(issues, wordStart.issue);
			pushIssue(issues, wordEnd.issue);
			pushIssue(
				issues,
				compareRange(
					wordStart.seconds,
					wordEnd.seconds,
					wordIdx + 1,
					`Top-level word ${wordIdx + 1}`,
				),
			);
		});
	}

	return { issues, checkedSegments: checked, omittedSegments: omitted.size };
}

const TIMESTAMP_RE = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?$/;

function parseTimestampSeconds(value: unknown): number | null {
	if (typeof value !== 'string') return null;
	const match = value.trim().match(TIMESTAMP_RE);
	if (!match) return null;
	const hours = match[1] ? Number(match[1]) : 0;
	const minutes = Number(match[2]);
	const seconds = Number(match[3]);
	const millis = match[4] ? Number(match[4].padEnd(3, '0')) : 0;
	const total = hours * 3600 + minutes * 60 + seconds + millis / 1000;
	return Number.isFinite(total) ? total : null;
}

function scanWhisperCpp(root: Record<string, unknown>): TimelineScan {
	const issues: QcIssue[] = [];
	const omitted = new Set<number>();
	let checked = 0;

	const items = Array.isArray(root.transcription) ? root.transcription : [];
	items.forEach((item, idx) => {
		if (!isRecord(item)) return;
		const index = idx + 1;
		checked += 1;

		let start: number | null = null;
		let end: number | null = null;
		let offsetIssue: QcIssue | undefined;

		if (isRecord(item.offsets)) {
			const from = inspectTime(item.offsets.from, {
				scale: 0.001,
				index,
				field: 'offsets.from',
				required: false,
				unit: 'segment',
			});
			const to = inspectTime(item.offsets.to, {
				scale: 0.001,
				index,
				field: 'offsets.to',
				required: false,
				unit: 'segment',
			});
			if (from.seconds !== null && to.seconds !== null) {
				start = from.seconds;
				end = to.seconds;
			} else {
				offsetIssue = from.issue ?? to.issue;
			}
		}

		if (start === null || end === null) {
			const fromTs = parseTimestampSeconds(isRecord(item.timestamps) ? item.timestamps.from : undefined);
			const toTs = parseTimestampSeconds(isRecord(item.timestamps) ? item.timestamps.to : undefined);
			if (fromTs !== null && toTs !== null) {
				start = fromTs;
				end = toTs;
				if (offsetIssue) {
					issues.push({
						...offsetIssue,
						severity: 'warning',
						message: `${offsetIssue.message} Timestamp strings were used instead.`,
					});
				}
			} else {
				omitted.add(index);
				if (offsetIssue) {
					issues.push({
						...offsetIssue,
						severity: 'error',
						message: `${offsetIssue.message} No timestamp fallback was readable, so the segment was omitted from the subtitle output.`,
					});
				} else {
					issues.push({
						code: 'invalid-time',
						severity: 'error',
						scope: 'segment',
						index,
						field: 'offsets',
						message: `Segment ${index} has neither readable millisecond offsets nor timestamp strings. The segment was omitted from the subtitle output.`,
					});
				}
			}
		}

		pushIssue(issues, compareRange(start, end, index, `Segment ${index}`));

		if (!readUnitText(item)) {
			omitted.add(index);
			issues.push({
				code: 'empty-segment',
				severity: 'warning',
				scope: 'segment',
				index,
				field: 'text',
				message: `Segment ${index} has no caption text. The segment was omitted from the subtitle output.`,
			});
		}
	});

	return { issues, checkedSegments: checked, omittedSegments: omitted.size };
}

function scanDeepgram(root: Record<string, unknown>): TimelineScan {
	const results = isRecord(root.results) ? root.results : {};
	const utterances = Array.isArray(results.utterances) ? results.utterances : [];
	if (utterances.length > 0) {
		const issues: QcIssue[] = [];
		const omitted = new Set<number>();
		utterances.forEach((item, idx) => {
			if (!isRecord(item)) return;
			const index = idx + 1;
			const start = inspectTime(item.start, {
				scale: 1,
				index,
				field: 'start',
				required: true,
				unit: 'utterance',
			});
			const end = inspectTime(item.end, {
				scale: 1,
				index,
				field: 'end',
				required: true,
				unit: 'utterance',
			});
			pushIssue(issues, start.issue);
			pushIssue(issues, end.issue);
			if (start.omitted || end.omitted) omitted.add(index);
			pushIssue(issues, compareRange(start.seconds, end.seconds, index, `Utterance ${index}`));
			if (!readUnitText(item) && countWords(item) === 0) {
				omitted.add(index);
				issues.push({
					code: 'empty-segment',
					severity: 'warning',
					scope: 'segment',
					index,
					field: 'text',
					message: `Utterance ${index} has no transcript text. The utterance was omitted from the subtitle output.`,
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
		return scanWordList(words, 1, 'channel word');
	}

	return { issues: [], checkedSegments: 1, omittedSegments: 0 };
}

function scanWordList(
	words: unknown[],
	scale: number,
	label: string,
): TimelineScan {
	const issues: QcIssue[] = [];
	words.forEach((item, idx) => {
		if (!isRecord(item)) return;
		const index = idx + 1;
		const start = inspectTime(item.start, {
			scale,
			index,
			field: 'start',
			required: false,
			unit: 'word',
			context: `${label} ${index}`,
		});
		const end = inspectTime(item.end, {
			scale,
			index,
			field: 'end',
			required: false,
			unit: 'word',
			context: `${label} ${index}`,
		});
		pushIssue(issues, start.issue);
		pushIssue(issues, end.issue);
		pushIssue(issues, compareRange(start.seconds, end.seconds, index, `${label} ${index}`));
	});
	return { issues, checkedSegments: words.length, omittedSegments: 0 };
}

function scanAssemblyAi(root: Record<string, unknown>): TimelineScan {
	const utterances = Array.isArray(root.utterances) ? root.utterances : [];
	if (utterances.length > 0) {
		const issues: QcIssue[] = [];
		const omitted = new Set<number>();
		utterances.forEach((item, idx) => {
			if (!isRecord(item)) return;
			const index = idx + 1;
			const start = inspectTime(item.start, {
				scale: 0.001,
				index,
				field: 'start',
				required: true,
				unit: 'utterance',
			});
			const end = inspectTime(item.end, {
				scale: 0.001,
				index,
				field: 'end',
				required: true,
				unit: 'utterance',
			});
			pushIssue(issues, start.issue);
			pushIssue(issues, end.issue);
			if (start.omitted || end.omitted) omitted.add(index);
			pushIssue(issues, compareRange(start.seconds, end.seconds, index, `Utterance ${index}`));
			if (!readUnitText(item) && countWords(item) === 0) {
				omitted.add(index);
				issues.push({
					code: 'empty-segment',
					severity: 'warning',
					scope: 'segment',
					index,
					field: 'text',
					message: `Utterance ${index} has no transcript text. The utterance was omitted from the subtitle output.`,
				});
			}
		});
		return { issues, checkedSegments: utterances.length, omittedSegments: omitted.size };
	}

	const words = Array.isArray(root.words) ? root.words : [];
	if (words.length > 0) {
		const scale =
			typeof root.audio_duration === 'number' ||
			typeof root.acoustic_model === 'string' ||
			typeof root.language_model === 'string'
				? 0.001
				: 1;
		return scanWordList(words, scale, 'Word');
	}

	return { issues: [], checkedSegments: 0, omittedSegments: 0 };
}

function hasCapCutText(content: unknown): boolean {
	if (isRecord(content) && typeof content.text === 'string') {
		return content.text.trim().length > 0;
	}
	if (typeof content === 'string') return content.trim().length > 0;
	return false;
}

function scanCapCut(root: Record<string, unknown>): TimelineScan {
	const issues: QcIssue[] = [];
	const omitted = new Set<number>();
	const materials = isRecord(root.materials) ? root.materials : {};
	const texts = Array.isArray(materials.texts) ? materials.texts : [];
	const textById = new Map<string, string>();

	for (const item of texts) {
		if (!isRecord(item) || typeof item.id !== 'string') continue;
		if (hasCapCutText(item.content)) textById.set(item.id, item.id);
	}

	let index = 0;
	const tracks = Array.isArray(root.tracks) ? root.tracks : [];
	for (const track of tracks) {
		if (!isRecord(track) || !Array.isArray(track.segments)) continue;
		for (const segment of track.segments) {
			if (!isRecord(segment) || typeof segment.material_id !== 'string') continue;
			if (!textById.has(segment.material_id)) continue;
			index += 1;
			const range = isRecord(segment.target_timerange) ? segment.target_timerange : null;
			if (!range) {
				omitted.add(index);
				issues.push({
					code: 'invalid-time',
					severity: 'error',
					scope: 'segment',
					index,
					field: 'target_timerange',
					message: `Segment ${index} has no target_timerange. The segment was omitted from the subtitle output.`,
				});
				continue;
			}
			const start = inspectTime(range.start, {
				scale: 0.000001,
				index,
				field: 'target_timerange.start',
				required: true,
				unit: 'segment',
			});
			const duration = inspectTime(range.duration, {
				scale: 0.000001,
				index,
				field: 'target_timerange.duration',
				required: true,
				unit: 'segment',
			});
			pushIssue(issues, start.issue);
			pushIssue(issues, duration.issue);
			if (start.omitted || duration.omitted) omitted.add(index);
			if (start.seconds !== null && duration.seconds !== null) {
				pushIssue(
					issues,
					compareRange(start.seconds, start.seconds + duration.seconds, index, `Segment ${index}`),
				);
			}
		}
	}

	return { issues, checkedSegments: index, omittedSegments: omitted.size };
}

export function scanTimelineInput(root: Record<string, unknown>): TimelineScan {
	if (Array.isArray(root.transcription)) {
		return scanWhisperCpp(root);
	}
	if (isRecord(root.results)) {
		return scanDeepgram(root);
	}
	if (Array.isArray(root.utterances)) {
		return scanAssemblyAi(root);
	}
	if (
		isRecord(root.materials) &&
		Array.isArray(root.materials.texts) &&
		Array.isArray(root.tracks)
	) {
		return scanCapCut(root);
	}
	if (Array.isArray(root.segments)) {
		return scanWhisperSegments(root);
	}
	if (Array.isArray(root.words)) {
		const scale =
			typeof root.audio_duration === 'number' ||
			typeof root.acoustic_model === 'string' ||
			typeof root.language_model === 'string'
				? 0.001
				: 1;
		return scanWordList(root.words, scale, 'Word');
	}
	if (Array.isArray(root.word_segments)) {
		return scanWordList(root.word_segments, 1, 'Word');
	}
	return { issues: [], checkedSegments: 0, omittedSegments: 0 };
}

export function scanRawJsonText(raw: string): TimelineScan {
	try {
		const parsed: unknown = JSON.parse(raw.replace(/^\uFEFF/, ''));
		if (!isRecord(parsed)) return { issues: [], checkedSegments: 0, omittedSegments: 0 };
		return scanTimelineInput(parsed);
	} catch {
		return { issues: [], checkedSegments: 0, omittedSegments: 0 };
	}
}

export function analyzeCues(cues: SubtitleCue[]): QcIssue[] {
	const issues: QcIssue[] = [];

	for (let i = 0; i < cues.length; i++) {
		const cue = cues[i]!;
		if (!isRepresentableSeconds(cue.startSec) || !isRepresentableSeconds(cue.endSec)) {
			issues.push({
				code: 'invalid-time',
				severity: 'error',
				scope: 'cue',
				index: cue.index,
				field: 'range',
				value: `${cue.startSec} -> ${cue.endSec}`,
				message: `Cue ${cue.index} has a non-finite or unrepresentable time range. It was omitted from the subtitle output.`,
			});
		}
		if (cue.lines.every((line) => line.trim().length === 0)) {
			issues.push({
				code: 'empty-cue',
				severity: 'warning',
				scope: 'cue',
				index: cue.index,
				field: 'text',
				message: `Cue ${cue.index} has no visible text.`,
			});
		}
		if (cue.endSec < cue.startSec - EPSILON) {
			issues.push({
				code: 'reversed-range',
				severity: 'warning',
				scope: 'cue',
				index: cue.index,
				field: 'range',
				value: `${cue.startSec} -> ${cue.endSec}`,
				message: `Cue ${cue.index} ends at ${cue.endSec} s before it starts at ${cue.startSec} s. Timing was left unchanged for review.`,
			});
		} else if (Math.abs(cue.endSec - cue.startSec) < EPSILON) {
			issues.push({
				code: 'zero-duration',
				severity: 'info',
				scope: 'cue',
				index: cue.index,
				field: 'range',
				value: `${cue.startSec} -> ${cue.endSec}`,
				message: `Cue ${cue.index} has zero duration at ${cue.startSec} s. Timing was left unchanged for review.`,
			});
		}

		if (i > 0) {
			const prev = cues[i - 1]!;
			const overlapSec = prev.endSec - cue.startSec;
			if (overlapSec > OVERLAP_TOLERANCE_SEC) {
				issues.push({
					code: 'overlap',
					severity: 'warning',
					scope: 'cue',
					index: cue.index,
					field: 'start',
					value: overlapSec.toFixed(3),
					relatedIndex: prev.index,
					message: `Cue ${cue.index} starts ${overlapSec.toFixed(3)} s before cue ${prev.index} ends. Timing was left unchanged for review.`,
				});
			}
		}
	}

	return issues;
}

const SEVERITY_RANK: Record<QcSeverity, number> = { error: 0, warning: 1, info: 2 };

export function buildQcReport(input: {
	issues: QcIssue[];
	checkedSegments: number;
	emittedCues: number;
	omittedSegments: number;
	omittedCues: number;
}): TimelineQcReport {
	const issues = [...input.issues].sort((a, b) => {
		const severity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
		if (severity !== 0) return severity;
		if (a.scope !== b.scope) return a.scope === 'segment' ? -1 : 1;
		if (a.index !== b.index) return a.index - b.index;
		return a.code.localeCompare(b.code);
	});

	let errorCount = 0;
	let warningCount = 0;
	let infoCount = 0;
	for (const issue of issues) {
		if (issue.severity === 'error') errorCount += 1;
		else if (issue.severity === 'warning') warningCount += 1;
		else infoCount += 1;
	}

	const status: TimelineQcReport['status'] =
		errorCount > 0 ? 'error' : warningCount > 0 ? 'warning' : 'clean';

	const summary =
		status === 'clean'
			? infoCount > 0
				? `Timeline QC: clean with ${infoCount} note(s) (${input.emittedCues} cues checked).`
				: `Timeline QC: clean (${input.emittedCues} cues checked).`
			: `Timeline QC: ${errorCount} error(s), ${warningCount} warning(s), ${infoCount} note(s); ${input.omittedSegments} segment(s) and ${input.omittedCues} cue(s) omitted.`;

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
		summary,
	};
}

export function formatQcReport(report: TimelineQcReport): string {
	const lines = [
		'Timeline QC report',
		`Status: ${report.status}`,
		`Emitted cues: ${report.emittedCues}`,
		`Segments checked: ${report.checkedSegments}`,
		`Omitted segments: ${report.omittedSegments}`,
		`Omitted cues: ${report.omittedCues}`,
		`Errors: ${report.errorCount}`,
		`Warnings: ${report.warningCount}`,
		`Notes: ${report.infoCount}`,
		'',
	];

	if (report.issues.length === 0) {
		lines.push('No timeline QC issues detected.');
		return `${lines.join('\n')}\n`;
	}

	lines.push(`Issues (${report.issues.length}):`);
	for (const issue of report.issues) {
		const location =
			issue.scope === 'cue'
				? `cue ${issue.index}${issue.relatedIndex !== undefined ? ` (related cue ${issue.relatedIndex})` : ''}`
				: `segment ${issue.index}`;
		const field = issue.field ? ` ${issue.field}` : '';
		const value = issue.value !== undefined ? ` value=${issue.value}` : '';
		lines.push(`- [${issue.code}] ${issue.severity} ${location}${field}${value}: ${issue.message}`);
	}
	return `${lines.join('\n')}\n`;
}
