import { describe, expect, it } from 'vitest';
import {
	SAMPLE_REVERSE_SUBTITLES,
	convertSubtitleToJson,
	type SubtitleToJsonOptions,
	type SubtitleToJsonResult,
} from '../src/lib/subtitle-to-json';
import { convertAsrJson, parseAsrJson } from '../src/lib/subtitle-engine';
import type { CueFormatOptions } from '../src/lib/types';

const BASE_OPTIONS: CueFormatOptions = {
	format: 'srt',
	maxCharsPerLine: 42,
	maxLinesPerCue: 2,
	maxCueDurationSec: 5,
	pauseSplitGapSec: 0.6,
	offsetMs: 0,
	includeSpeakerPrefix: false,
};

function success(result: SubtitleToJsonResult) {
	if (!result.ok) throw new Error(result.error);
	return result;
}

function records(value: unknown): Array<Record<string, unknown>> {
	if (!Array.isArray(value)) throw new Error('Expected an array of records.');
	return value as Array<Record<string, unknown>>;
}

function record(value: unknown): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error('Expected a record.');
	}
	return value as Record<string, unknown>;
}

function srtOf(result: ReturnType<typeof convertAsrJson>) {
	if (!result.ok) throw new Error(result.error);
	return result;
}

describe('convertSubtitleToJson SRT parsing', () => {
	it('parses SRT cues, timestamps, text, and speaker prefixes', () => {
		const result = success(
			convertSubtitleToJson(SAMPLE_REVERSE_SUBTITLES['srt-speakers'].content, {
				schema: 'openai-verbose-json',
			}),
		);

		expect(result.inputFormat).toBe('srt');
		expect(result.cueCount).toBe(4);
		expect(result.durationSec).toBe(12.4);
		expect(result.speakers).toEqual(['SPEAKER_00', 'SPEAKER_01']);

		const segments = records(result.data.segments);
		expect(segments[0]).toMatchObject({
			id: 0,
			seek: 0,
			start: 0.5,
			end: 3.2,
			text: 'Welcome to the studio session on caption timing.',
		});
		expect(segments[1]).toMatchObject({
			id: 1,
			start: 3.4,
			end: 6.1,
			text: 'We start with raw SRT files and rebuild the transcript JSON.',
		});
		expect(segments[3]).toMatchObject({
			id: 3,
			start: 9.2,
			end: 12.4,
			text: 'Every timestamp stays on the original millisecond grid.',
		});
	});

	it('detects bracketed host names and bare SPEAKER prefixes', () => {
		const raw = [
			'1',
			'00:00:00,000 --> 00:00:02,000',
			'[Host]: Bracket speaker line.',
			'',
			'2',
			'00:00:02,200 --> 00:00:04,000',
			'SPEAKER_07: Bare prefix line.',
			'',
			'3',
			'00:00:04,200 --> 00:00:06,000',
			'[SPEAKER_00] No colon after the bracket.',
		].join('\n');

		const result = success(
			convertSubtitleToJson(raw, { schema: 'generic-timestamped' }),
		);

		expect(result.speakers).toEqual(['Host', 'SPEAKER_07', 'SPEAKER_00']);
		const cues = records(result.data.cues);
		expect(cues.map((cue) => cue.text)).toEqual([
			'Bracket speaker line.',
			'Bare prefix line.',
			'No colon after the bracket.',
		]);
		expect(cues.map((cue) => cue.speaker)).toEqual(['Host', 'SPEAKER_07', 'SPEAKER_00']);
	});

	it('keeps speaker prefixes inside text when detection is disabled', () => {
		const result = success(
			convertSubtitleToJson(SAMPLE_REVERSE_SUBTITLES['srt-speakers'].content, {
				schema: 'openai-verbose-json',
				detectSpeakers: false,
			}),
		);

		expect(result.speakers).toEqual([]);
		expect(records(result.data.segments)[0]?.text).toBe(
			'[SPEAKER_00]: Welcome to the studio session on caption timing.',
		);
	});

	it('skips malformed blocks but keeps readable cues', () => {
		const raw = [
			'1',
			'00:00:00,000 --> 00:00:02,000',
			'Good cue.',
			'',
			'2',
			'00:00:0x,000 --> 00:00:03,000',
			'Bad timestamp.',
		].join('\n');

		const result = success(convertSubtitleToJson(raw, { schema: 'openai-verbose-json' }));
		expect(result.cueCount).toBe(1);
		expect(result.qc.checkedSegments).toBe(2);
		expect(result.qc.omittedSegments).toBe(1);
		expect(result.qc.emittedCues).toBe(1);
	});

	it('reports overlapping cues through timeline QC without changing timing', () => {
		const raw = [
			'1',
			'00:00:00,000 --> 00:00:05,000',
			'First cue runs long.',
			'',
			'2',
			'00:00:04,000 --> 00:00:08,000',
			'Second cue overlaps.',
		].join('\n');

		const result = success(convertSubtitleToJson(raw, { schema: 'openai-verbose-json' }));
		expect(result.qc.status).toBe('warning');
		expect(result.qc.issues.some((issue) => issue.code === 'overlap')).toBe(true);
		expect(records(result.data.segments)[1]?.start).toBe(4);
	});
});

describe('convertSubtitleToJson WebVTT parsing', () => {
	it('parses voice spans, cue settings, identifiers, and NOTE blocks', () => {
		const result = success(
			convertSubtitleToJson(SAMPLE_REVERSE_SUBTITLES['vtt-web'].content, {
				schema: 'openai-verbose-json',
			}),
		);

		expect(result.inputFormat).toBe('vtt');
		expect(result.cueCount).toBe(3);
		expect(result.speakers).toEqual(['Host', 'Editor']);

		const segments = records(result.data.segments);
		expect(segments[0]).toMatchObject({
			start: 0.8,
			end: 3.6,
			text: 'This demo walks through a reverse conversion from captions to JSON.',
		});
		expect(segments[1]?.text).toBe(
			'We keep the cue settings out of the exported transcript.',
		);
		expect(segments[2]?.text).toBe(
			'Tags like color classes are removed from the clean text.',
		);
	});

	it('accepts a cue identifier line and MM:SS timestamps', () => {
		const raw = [
			'WEBVTT',
			'',
			'cue-1',
			'01:02.000 --> 01:04.500',
			'Short form timestamps work.',
		].join('\n');

		const result = success(convertSubtitleToJson(raw, { schema: 'openai-verbose-json' }));
		expect(result.inputFormat).toBe('vtt');
		expect(result.cueCount).toBe(1);
		expect(records(result.data.segments)[0]).toMatchObject({
			start: 62,
			end: 64.5,
			text: 'Short form timestamps work.',
		});
	});
});

describe('convertSubtitleToJson ASS parsing', () => {
	it('reads Dialogue actor names, ASS escapes, and override tags', () => {
		const result = success(
			convertSubtitleToJson(SAMPLE_REVERSE_SUBTITLES['ass-dialogue'].content, {
				schema: 'openai-verbose-json',
			}),
		);

		expect(result.inputFormat).toBe('ass');
		expect(result.cueCount).toBe(3);
		expect(result.durationSec).toBe(11.5);
		expect(result.speakers).toEqual(['Host', 'Guest']);

		const segments = records(result.data.segments);
		expect(segments[0]).toMatchObject({
			start: 1,
			end: 4.2,
			text: 'Welcome back to the studio. Today we rebuild the transcript JSON.',
		});
		expect(segments[1]).toMatchObject({
			start: 4.4,
			end: 7.8,
			text: 'Glad to be here. The parser keeps every cue intact.',
		});
		expect(segments[2]).toMatchObject({
			start: 8,
			end: 11.5,
			text: 'This line has no speaker name and stays neutral.',
		});
	});

	it('maps trailing AS SSA Dialogue blocks to the ass input format', () => {
		const raw = [
			'[Events]',
			'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
			'Dialogue: 0,0:00:02.50,0:00:05.75,Default,Announcer,0,0,0,,Plain SSA style dialogue.',
		].join('\n');

		const result = success(convertSubtitleToJson(raw, { schema: 'generic-timestamped' }));
		expect(result.inputFormat).toBe('ass');
		expect(result.cueCount).toBe(1);
		const cue = records(result.data.cues)[0];
		expect(cue).toMatchObject({ start: 2.5, end: 5.75, text: 'Plain SSA style dialogue.' });
		expect(cue?.speaker).toBe('Announcer');
	});
});

describe('convertSubtitleToJson schema presets', () => {
	it('writes seconds by default for generic-timestamped', () => {
		const result = success(
			convertSubtitleToJson(SAMPLE_REVERSE_SUBTITLES['srt-speakers'].content, {
				schema: 'generic-timestamped',
			}),
		);

		expect(result.data.format).toBe('generic-timestamped-json');
		expect(result.data.timestamp_unit).toBe('seconds');
		expect(result.data.cue_count).toBe(4);
		expect(result.data.duration).toBe(12.4);
		const first = records(result.data.cues)[0];
		expect(first).toMatchObject({
			index: 1,
			start: 0.5,
			end: 3.2,
			duration: 2.7,
			text: 'Welcome to the studio session on caption timing.',
			speaker: 'SPEAKER_00',
		});
	});

	it('writes integer milliseconds for generic-timestamped', () => {
		const result = success(
			convertSubtitleToJson(SAMPLE_REVERSE_SUBTITLES['srt-speakers'].content, {
				schema: 'generic-timestamped',
				timestampUnit: 'milliseconds',
			}),
		);

		expect(result.data.timestamp_unit).toBe('milliseconds');
		expect(result.data.duration).toBe(12400);
		const first = records(result.data.cues)[0];
		expect(first).toMatchObject({ start: 500, end: 3200, duration: 2700 });
		expect(Number.isInteger(first?.start)).toBe(true);
	});

	it('omits the speaker key when no speaker was detected', () => {
		const raw = [
			'1',
			'00:00:00,000 --> 00:00:02,000',
			'Plain narration line.',
			'',
			'2',
			'00:00:02,200 --> 00:00:04,500',
			'Second plain narration line.',
		].join('\n');

		const result = success(convertSubtitleToJson(raw, { schema: 'generic-timestamped' }));
		const first = records(result.data.cues)[0];
		expect(first && 'speaker' in first).toBe(false);
	});

	it('builds Deepgram utterances and keeps extracted speaker labels', () => {
		const result = success(
			convertSubtitleToJson(SAMPLE_REVERSE_SUBTITLES['srt-speakers'].content, {
				schema: 'deepgram-utterances',
			}),
		);

		expect(result.data.metadata).toEqual({ duration: 12.4, channels: 1 });
		const utterances = records(record(result.data.results).utterances);
		expect(utterances.map((utt) => utt.speaker)).toEqual([
			'SPEAKER_00',
			'SPEAKER_00',
			'SPEAKER_01',
			'SPEAKER_01',
		]);
		expect(utterances[0]).toMatchObject({
			id: 'utt_0',
			start: 0.5,
			end: 3.2,
			confidence: 1,
			channel: 0,
			transcript: 'Welcome to the studio session on caption timing.',
		});
	});

	it('defaults Deepgram speakers to 0 when no label is present', () => {
		const raw = [
			'1',
			'00:00:00,000 --> 00:00:02,000',
			'None speaker line one.',
			'',
			'2',
			'00:00:02,200 --> 00:00:04,500',
			'None speaker line two.',
		].join('\n');

		const result = success(convertSubtitleToJson(raw, { schema: 'deepgram-utterances' }));
		const utterances = records(record(result.data.results).utterances);
		expect(utterances.every((utt) => utt.speaker === 0)).toBe(true);
	});

	it('applies language, indent, and duration defaults', () => {
		const compact = success(
			convertSubtitleToJson(SAMPLE_REVERSE_SUBTITLES['srt-speakers'].content, {
				schema: 'openai-verbose-json',
				prettyIndent: 0,
			}),
		);
		expect(compact.data.language).toBe('en');
		expect(compact.json.includes('\n')).toBe(false);

		const french = success(
			convertSubtitleToJson(SAMPLE_REVERSE_SUBTITLES['srt-speakers'].content, {
				schema: 'openai-verbose-json',
				language: 'fr',
			}),
		);
		expect(french.data.language).toBe('fr');
		expect(french.json.includes('\n')).toBe(true);
		expect(french.data.task).toBe('transcribe');
	});

	it('joins the full transcript text in the OpenAI payload', () => {
		const result = success(
			convertSubtitleToJson(SAMPLE_REVERSE_SUBTITLES['srt-speakers'].content, {
				schema: 'openai-verbose-json',
			}),
		);
		expect(result.data.text).toBe(
			'Welcome to the studio session on caption timing. ' +
				'We start with raw SRT files and rebuild the transcript JSON. ' +
				'Then we export the same cues without losing a single frame. ' +
				'Every timestamp stays on the original millisecond grid.',
		);
	});
});

describe('convertSubtitleToJson round trips through convertAsrJson', () => {
	const VERBOSE_JSON = JSON.stringify({
		task: 'transcribe',
		language: 'en',
		duration: 9.8,
		text: 'Clean captions need stable cues and stable text for every export. Reverse conversion keeps both.',
		segments: [
			{ id: 0, seek: 0, start: 0.5, end: 3.25, text: 'Clean captions need stable cues' },
			{ id: 1, seek: 0, start: 3.4, end: 6.75, text: 'and stable text for every export.' },
			{ id: 2, seek: 0, start: 7, end: 9.8, text: 'Reverse conversion keeps both.' },
		],
	});

	it('round-trips OpenAI verbose JSON into SRT without losing cues or timestamps', () => {
		const first = srtOf(convertAsrJson(VERBOSE_JSON, BASE_OPTIONS));
		const reverseOptions: SubtitleToJsonOptions = {
			schema: 'openai-verbose-json',
			language: 'en',
		};
		const reversed = success(convertSubtitleToJson(first.output, reverseOptions));

		expect(reversed.inputFormat).toBe('srt');
		expect(reversed.cueCount).toBe(first.cues.length);

		const parsedBack = parseAsrJson(reversed.json);
		expect(parsedBack.ok).toBe(true);
		if (!parsedBack.ok) return;
		expect(parsedBack.dialect).toBe('openai-verbose-json');

		const second = srtOf(convertAsrJson(reversed.json, BASE_OPTIONS));
		expect(second.cues.length).toBe(first.cues.length);
		expect(second.cues.map((cue) => cue.startSec)).toEqual(
			first.cues.map((cue) => cue.startSec),
		);
		expect(second.cues.map((cue) => cue.endSec)).toEqual(
			first.cues.map((cue) => cue.endSec),
		);
		expect(second.cues.map((cue) => cue.lines.join(' '))).toEqual(
			first.cues.map((cue) => cue.lines.join(' ')),
		);
		expect(second.output).toBe(first.output);
	});

	it('round-trips Deepgram utterances including speaker labels', () => {
		const deepgramJson = JSON.stringify({
			metadata: { duration: 8.4, channels: 1 },
			results: {
				utterances: [
					{
						id: 'utt_0',
						start: 0.6,
						end: 3.2,
						confidence: 0.98,
						channel: 0,
						transcript: 'First speaker opens the review.',
						speaker: 0,
					},
					{
						id: 'utt_1',
						start: 3.4,
						end: 6.1,
						confidence: 0.97,
						channel: 0,
						transcript: 'Second speaker answers the question.',
						speaker: 1,
					},
					{
						id: 'utt_2',
						start: 6.3,
						end: 8.4,
						confidence: 0.96,
						channel: 0,
						transcript: 'Closing line returns to the first voice.',
						speaker: 0,
					},
				],
			},
		});

		const options: CueFormatOptions = {
			...BASE_OPTIONS,
			includeSpeakerPrefix: true,
		};
		const first = srtOf(convertAsrJson(deepgramJson, options));
		expect(first.output.includes('[Speaker 0]')).toBe(true);
		expect(first.output.includes('[Speaker 1]')).toBe(true);

		const reversed = success(
			convertSubtitleToJson(first.output, { schema: 'deepgram-utterances' }),
		);
		expect(reversed.cueCount).toBe(first.cues.length);
		expect(reversed.speakers).toEqual(['Speaker 0', 'Speaker 1']);

		const parsedBack = parseAsrJson(reversed.json);
		expect(parsedBack.ok).toBe(true);
		if (!parsedBack.ok) return;
		expect(parsedBack.dialect).toBe('deepgram-nova');
		expect(parsedBack.speakerLabels).toEqual(['Speaker 0', 'Speaker 1']);

		const second = srtOf(convertAsrJson(reversed.json, options));
		expect(second.cues.length).toBe(first.cues.length);
		expect(second.cues.map((cue) => cue.startSec)).toEqual(
			first.cues.map((cue) => cue.startSec),
		);
		expect(second.cues.map((cue) => cue.endSec)).toEqual(
			first.cues.map((cue) => cue.endSec),
		);
		expect(second.cues.map((cue) => cue.lines.join(' '))).toEqual(
			first.cues.map((cue) => cue.lines.join(' ')),
		);
		expect(second.output).toBe(first.output);
	});

	it('keeps ASS actor names usable by the Deepgram adapter', () => {
		const reversed = success(
			convertSubtitleToJson(SAMPLE_REVERSE_SUBTITLES['ass-dialogue'].content, {
				schema: 'deepgram-utterances',
			}),
		);
		const utterances = records(record(reversed.data.results).utterances);
		expect(utterances.map((utt) => utt.speaker)).toEqual(['Host', 'Guest', 0]);

		const parsedBack = parseAsrJson(reversed.json);
		expect(parsedBack.ok).toBe(true);
		if (!parsedBack.ok) return;
		expect(parsedBack.dialect).toBe('deepgram-nova');
		expect(parsedBack.speakerLabels).toEqual(['Host', 'Guest', 'Speaker 0']);
	});
});

describe('convertSubtitleToJson error handling', () => {
	const options: SubtitleToJsonOptions = { schema: 'openai-verbose-json' };

	it('rejects empty and whitespace-only input', () => {
		const empty = convertSubtitleToJson('', options);
		expect(empty.ok).toBe(false);
		if (empty.ok) return;
		expect(empty.error.includes('Empty input')).toBe(true);

		const blank = convertSubtitleToJson('  \n\t\n ', options);
		expect(blank.ok).toBe(false);
	});

	it('rejects text that is not a subtitle file', () => {
		const result = convertSubtitleToJson('this is not a subtitle file at all', options);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.includes('Unrecognized subtitle format')).toBe(true);
	});

	it('rejects cue blocks with unreadable timestamps', () => {
		const raw = ['1', '00:00:xx,000 --> 00:00:02,000', 'Broken timing.'].join('\n');
		const result = convertSubtitleToJson(raw, options);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.includes('no readable subtitle cues')).toBe(true);
	});

	it('rejects a WebVTT file with no cues', () => {
		const result = convertSubtitleToJson('WEBVTT\n\nNOTE only a note block\n', options);
		expect(result.ok).toBe(false);
	});

	it('rejects an ASS file with no Dialogue lines', () => {
		const raw = ['[Script Info]', 'Title: Empty events file', '', '[Events]'].join('\n');
		const result = convertSubtitleToJson(raw, options);
		expect(result.ok).toBe(false);
	});
});

describe('SAMPLE_REVERSE_SUBTITLES copy hygiene', () => {
	it('ships clean samples without em-dash or en-dash characters', () => {
		for (const sample of Object.values(SAMPLE_REVERSE_SUBTITLES)) {
			expect(sample.filename.length).toBeGreaterThan(0);
			expect(sample.label.length).toBeGreaterThan(0);
			expect(sample.content.includes('\u2014')).toBe(false);
			expect(sample.content.includes('\u2013')).toBe(false);
		}
	});

	it('samples parse into the expected input formats', () => {
		const expectations: Array<[keyof typeof SAMPLE_REVERSE_SUBTITLES, string, number]> = [
			['srt-speakers', 'srt', 4],
			['vtt-web', 'vtt', 3],
			['ass-dialogue', 'ass', 3],
		];
		for (const [key, format, cueCount] of expectations) {
			const result = success(
				convertSubtitleToJson(SAMPLE_REVERSE_SUBTITLES[key].content, {
					schema: 'generic-timestamped',
				}),
			);
			expect(result.inputFormat).toBe(format);
			expect(result.cueCount).toBe(cueCount);
			expect(result.qc.status).toBe('clean');
		}
	});
});
