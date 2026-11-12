import { describe, expect, it } from 'vitest';
import { SAMPLE_PAYLOADS } from '../src/lib/sample-payloads';
import {
	convertAsrJson,
	formatTimestamp,
	parseAsrJson,
	reflowCues,
	serializeCues,
} from '../src/lib/subtitle-engine';
import type { CueFormatOptions, DialectId, SubtitleCue } from '../src/lib/types';

const BASE_OPTIONS: CueFormatOptions = {
	format: 'srt',
	maxCharsPerLine: 42,
	maxLinesPerCue: 2,
	maxCueDurationSec: 5,
	pauseSplitGapSec: 0.6,
	offsetMs: 0,
	includeSpeakerPrefix: false,
};

describe('formatTimestamp', () => {
	it('rounds total milliseconds before decomposition to avoid 1000ms overflow on 999.6ms', () => {
		expect(formatTimestamp(1.9996, 'srt')).toBe('00:00:02,000');
		expect(formatTimestamp(0.9996, 'vtt')).toBe('00:00:01.000');
		expect(formatTimestamp(59.9996, 'srt')).toBe('00:01:00,000');
		expect(formatTimestamp(3599.9996, 'vtt')).toBe('01:00:00.000');
	});

	it('clamps negative and non-finite inputs to zero', () => {
		expect(formatTimestamp(-4.25, 'srt')).toBe('00:00:00,000');
		expect(formatTimestamp(Number.NaN, 'vtt')).toBe('00:00:00.000');
		expect(formatTimestamp(3723.045, 'srt')).toBe('01:02:03,045');
	});
});

describe('parseAsrJson across all 5 ASR dialects', () => {
	it('parses all 5 built-in sample payloads with matching dialect IDs and valid cues', () => {
		const dialectIds: DialectId[] = [
			'openai-verbose-json',
			'whisperx-diarized',
			'whisper-cpp',
			'deepgram-nova',
			'assemblyai-utterances',
		];

		for (const id of dialectIds) {
			const sample = SAMPLE_PAYLOADS[id];
			expect(sample.filename.endsWith('.json')).toBe(true);
			const parsed = parseAsrJson(sample.json);
			expect(parsed.ok).toBe(true);
			if (!parsed.ok) continue;

			expect(parsed.dialect).toBe(id);
			expect(parsed.durationSec).toBeGreaterThan(5);
			expect(parsed.segments.length).toBeGreaterThan(0);

			const converted = convertAsrJson(sample.json, {
				...BASE_OPTIONS,
				includeSpeakerPrefix: true,
			});
			expect(converted.ok).toBe(true);
			if (converted.ok) {
				expect(converted.cues.length).toBeGreaterThanOrEqual(2);
				expect(converted.output).toContain('-->');
			}
		}
	});

	it('detects whisperx-diarized and interpolates unaligned word entries inside segments', () => {
		const payload = JSON.stringify({
			segments: [
				{
					start: 0.5,
					end: 2.5,
					text: 'Testing 2026 diarization.',
					speaker: 'SPEAKER_00',
					words: [
						{ word: 'Testing', start: 0.5, end: 1.0, speaker: 'SPEAKER_00' },
						{ word: '2026', speaker: 'SPEAKER_00' },
						{ word: 'diarization.', start: 1.4, end: 2.5, speaker: 'SPEAKER_00' },
					],
				},
				{
					start: 3.0,
					end: 4.4,
					text: 'Confirmed.',
					words: [{ word: 'Confirmed.', start: 3.0, end: 4.4, speaker: 'SPEAKER_01' }],
				},
			],
		});

		const parsed = parseAsrJson(payload);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;

		expect(parsed.dialect).toBe('whisperx-diarized');
		expect(parsed.wordTimingAvailable).toBe(true);
		expect(parsed.speakerLabels).toEqual(['SPEAKER_00', 'SPEAKER_01']);
		expect(parsed.segments[0]?.words?.[1]).toEqual({
			word: '2026',
			startSec: 1,
			endSec: 1.4,
			speaker: 'SPEAKER_00',
		});
	});

	it('normalizes openai-verbose-json with top-level words[] or word-only payloads', () => {
		const withTopLevelWords = JSON.stringify({
			duration: 4.2,
			segments: [
				{ id: 0, start: 0.0, end: 1.8, text: 'Hello world.' },
				{ id: 1, start: 2.0, end: 4.0, text: 'Second line.' },
			],
			words: [
				{ word: 'Hello', start: 0.0, end: 0.8 },
				{ word: 'world.', start: 0.85, end: 1.8 },
				{ word: 'Second', start: 2.0, end: 2.9 },
				{ word: 'line.', start: 2.95, end: 4.0 },
			],
		});

		const parsedMapped = parseAsrJson(withTopLevelWords);
		expect(parsedMapped.ok).toBe(true);
		if (parsedMapped.ok) {
			expect(parsedMapped.dialect).toBe('openai-verbose-json');
			expect(parsedMapped.wordTimingAvailable).toBe(true);
			expect(parsedMapped.segments[0]?.words?.map((w) => w.word)).toEqual([
				'Hello',
				'world.',
			]);
			expect(parsedMapped.segments[1]?.words?.map((w) => w.word)).toEqual([
				'Second',
				'line.',
			]);
		}

		const wordOnly = JSON.stringify({
			words: [
				{ word: 'Word', start: 0.12, end: 0.45 },
				{ word: 'only', start: 0.48, end: 0.82 },
				{ word: 'payload.', start: 0.86, end: 1.4 },
			],
		});

		const parsedWordOnly = parseAsrJson(wordOnly);
		expect(parsedWordOnly.ok).toBe(true);
		if (parsedWordOnly.ok) {
			expect(parsedWordOnly.dialect).toBe('openai-verbose-json');
			expect(parsedWordOnly.wordTimingAvailable).toBe(true);
			expect(parsedWordOnly.segments[0]?.text).toBe('Word only payload.');
		}
	});

	it('normalizes whisper-cpp from either millisecond offsets or timestamp strings', () => {
		const cppPayload = JSON.stringify({
			transcription: [
				{
					offsets: { from: 250, to: 1750 },
					text: ' Offset based segment.',
				},
				{
					timestamps: { from: '00:00:02,100', to: '00:00:04.600' },
					text: ' Timestamp fallback segment.',
				},
			],
		});

		const parsed = parseAsrJson(cppPayload);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;

		expect(parsed.dialect).toBe('whisper-cpp');
		expect(parsed.wordTimingAvailable).toBe(false);
		expect(parsed.segments).toEqual([
			{ startSec: 0.25, endSec: 1.75, text: 'Offset based segment.' },
			{ startSec: 2.1, endSec: 4.6, text: 'Timestamp fallback segment.' },
		]);
	});

	it('normalizes deepgram-nova punctuated words and numeric speaker labels', () => {
		const deepgramPayload = JSON.stringify({
			results: {
				channels: [
					{
						alternatives: [
							{
								words: [
									{
										word: 'hello',
										punctuated_word: 'Hello,',
										start: 0.1,
										end: 0.5,
										speaker: 0,
									},
									{
										word: 'team',
										punctuated_word: 'team.',
										start: 0.55,
										end: 0.95,
										speaker: 0,
									},
									{
										word: 'welcome',
										punctuated_word: 'Welcome!',
										start: 1.2,
										end: 1.8,
										speaker: 1,
									},
								],
							},
						],
					},
				],
			},
		});

		const parsed = parseAsrJson(deepgramPayload);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;

		expect(parsed.dialect).toBe('deepgram-nova');
		expect(parsed.wordTimingAvailable).toBe(true);
		expect(parsed.speakerLabels).toEqual(['Speaker 0', 'Speaker 1']);
		expect(parsed.segments[0]?.text).toBe('Hello, team.');
		expect(parsed.segments[1]?.text).toBe('Welcome!');
	});

	it('normalizes assemblyai-utterances from utterances[] and millisecond word-only payloads', () => {
		const wordOnlyMs = JSON.stringify({
			words: [
				{ text: 'Integer', start: 240, end: 780, speaker: 'A' },
				{ text: 'milliseconds', start: 820, end: 1850, speaker: 'A' },
			],
		});

		const parsed = parseAsrJson(wordOnlyMs);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;

		expect(parsed.dialect).toBe('assemblyai-utterances');
		expect(parsed.wordTimingAvailable).toBe(true);
		expect(parsed.segments[0]?.startSec).toBe(0.24);
		expect(parsed.segments[0]?.endSec).toBe(1.85);
		expect(parsed.speakerLabels).toEqual(['A']);
	});
});

describe('reflowCues timing, TikTok 16-char mode, and proportional fallback', () => {
	it('clamps negative offsetMs to 0 and guarantees endSec > startSec by at least 0.05s', () => {
		const parsed = parseAsrJson(
			JSON.stringify({
				segments: [
					{
						start: 0.2,
						end: 1.1,
						text: 'Early intro cue.',
						words: [
							{ word: 'Early', start: 0.2, end: 0.5 },
							{ word: 'intro', start: 0.52, end: 0.8 },
							{ word: 'cue.', start: 0.82, end: 1.1 },
						],
					},
					{
						start: 2.5,
						end: 3.5,
						text: 'Later cue.',
						words: [
							{ word: 'Later', start: 2.5, end: 3.0 },
							{ word: 'cue.', start: 3.0, end: 3.5 },
						],
					},
				],
			}),
		);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;

		const cues = reflowCues(parsed, {
			...BASE_OPTIONS,
			offsetMs: -2000,
		});

		expect(cues).toHaveLength(2);
		expect(cues[0]?.startSec).toBe(0);
		expect(cues[0]?.endSec).toBe(0.05);
		expect(cues[1]?.startSec).toBe(0.5);
		expect(cues[1]?.endSec).toBe(1.5);
	});

	it('reflows word timings into 16-char 1-line TikTok cues and splits on pauses and speakers', () => {
		const parsed = parseAsrJson(SAMPLE_PAYLOADS['whisperx-diarized'].json);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;

		const cues = reflowCues(parsed, {
			...BASE_OPTIONS,
			maxCharsPerLine: 16,
			maxLinesPerCue: 1,
			pauseSplitGapSec: 0.6,
			includeSpeakerPrefix: false,
		});

		expect(cues.length).toBeGreaterThan(6);
		for (const cue of cues) {
			expect(cue.lines).toHaveLength(1);
			const line = cue.lines[0]!;
			if (/\s/.test(line)) {
				expect(line.length).toBeLessThanOrEqual(16);
			}
		}

		const exactPausePayload = parseAsrJson(
			JSON.stringify({
				words: [
					{ word: 'Before', start: 0.6, end: 1.2 },
					{ word: 'After', start: 1.8, end: 2.2 },
				],
			}),
		);
		expect(exactPausePayload.ok).toBe(true);
		if (exactPausePayload.ok) {
			const splitCues = reflowCues(exactPausePayload, {
				...BASE_OPTIONS,
				pauseSplitGapSec: 0.6,
			});
			expect(splitCues).toHaveLength(2);
			expect(splitCues[0]?.lines).toEqual(['Before']);
			expect(splitCues[1]?.lines).toEqual(['After']);
		}
	});

	it('prepends speaker prefix on speaker turns when includeSpeakerPrefix is enabled', () => {
		const parsed = parseAsrJson(SAMPLE_PAYLOADS['whisperx-diarized'].json);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;

		const cues = reflowCues(parsed, {
			...BASE_OPTIONS,
			maxCharsPerLine: 42,
			maxLinesPerCue: 2,
			includeSpeakerPrefix: true,
		});

		expect(cues[0]?.lines[0]?.startsWith('[SPEAKER_00] ')).toBe(true);
		const firstSpeakerOne = cues.find((c) => c.speaker === 'SPEAKER_01');
		expect(firstSpeakerOne?.lines[0]?.startsWith('[SPEAKER_01] ')).toBe(true);
		for (const cue of cues) {
			for (const line of cue.lines) {
				expect(line.length).toBeLessThanOrEqual(42);
			}
		}
	});

	it('splits CJK and long segment-only text proportionally by character count', () => {
		const cjkPayload = parseAsrJson(
			JSON.stringify({
				segments: [
					{
						start: 0,
						end: 10,
						text: '这是一段没有词级时间戳的超长中文字幕文本，需要按字符数成比例切分并插值计算起止时间。',
					},
				],
			}),
		);
		expect(cjkPayload.ok).toBe(true);
		if (!cjkPayload.ok) return;
		expect(cjkPayload.wordTimingAvailable).toBe(false);

		const cjkCues = reflowCues(cjkPayload, {
			...BASE_OPTIONS,
			maxCharsPerLine: 12,
			maxLinesPerCue: 1,
		});

		expect(cjkCues.length).toBeGreaterThanOrEqual(4);
		expect(cjkCues[0]?.startSec).toBe(0);
		expect(cjkCues[cjkCues.length - 1]?.endSec).toBe(10);

		for (let i = 0; i < cjkCues.length; i++) {
			const cue = cjkCues[i]!;
			expect(cue.lines).toHaveLength(1);
			expect(cue.lines[0]!.length).toBeLessThanOrEqual(12);
			expect(/^[，。！？]/.test(cue.lines[0]!)).toBe(false);
			if (i > 0) {
				expect(cue.startSec).toBeCloseTo(cjkCues[i - 1]!.endSec, 5);
			}
		}

		const englishLongPayload = parseAsrJson(
			JSON.stringify({
				transcription: [
					{
						offsets: { from: 1000, to: 9000 },
						text: 'Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu',
					},
				],
			}),
		);
		expect(englishLongPayload.ok).toBe(true);
		if (englishLongPayload.ok) {
			const enCues = reflowCues(englishLongPayload, {
				...BASE_OPTIONS,
				maxCharsPerLine: 20,
				maxLinesPerCue: 1,
			});
			expect(enCues.length).toBeGreaterThanOrEqual(3);
			expect(enCues[0]?.startSec).toBe(1);
			expect(enCues[enCues.length - 1]?.endSec).toBe(9);
			for (const cue of enCues) {
				expect(cue.lines[0]!.length).toBeLessThanOrEqual(20);
			}
		}
	});
});

describe('serializeCues across SRT, VTT, TXT, and RFC 4180 CSV', () => {
	const sampleCues: SubtitleCue[] = [
		{
			index: 1,
			startSec: 0.24,
			endSec: 1.9996,
			speaker: 'Host',
			lines: ['Hello, "world"!', 'Welcome back.'],
		},
		{
			index: 2,
			startSec: 2.5,
			endSec: 4.125,
			speaker: 'Guest',
			lines: ['Glad to join today.'],
		},
	];

	it('formats numbered SRT blocks with comma millisecond separators', () => {
		const srt = serializeCues(sampleCues, 'srt');
		expect(srt).toBe(
			[
				'1\n00:00:00,240 --> 00:00:02,000\nHello, "world"!\nWelcome back.',
				'2\n00:00:02,500 --> 00:00:04,125\nGlad to join today.',
			].join('\n\n'),
		);
	});

	it('formats WebVTT with WEBVTT header and dot millisecond separators', () => {
		const vtt = serializeCues(sampleCues, 'vtt');
		expect(vtt.startsWith('WEBVTT\n\n')).toBe(true);
		expect(vtt).toContain('00:00:00.240 --> 00:00:02.000');
		expect(vtt).toContain('00:00:02.500 --> 00:00:04.125');
	});

	it('formats clean readable TXT transcript lines without duplicating speaker tags', () => {
		const txt = serializeCues(sampleCues, 'txt');
		expect(txt).toBe(
			'[00:00:00] [Host] Hello, "world"! Welcome back.\n[00:00:02] [Guest] Glad to join today.',
		);
	});

	it('formats RFC 4180 CSV with exact header and proper double-quote escaping', () => {
		const csv = serializeCues(sampleCues, 'csv');
		const lines = csv.split('\n');
		expect(lines[0]).toBe('index,start,end,speaker,text');
		expect(lines[1]).toBe(
			'1,00:00:00.240,00:00:02.000,Host,"Hello, ""world""! Welcome back."',
		);
		expect(lines[2]).toBe(
			'2,00:00:02.500,00:00:04.125,Guest,Glad to join today.',
		);
	});
});

describe('malformed input handling and large payload throughput', () => {
	it('returns actionable errors on empty input, invalid JSON, and unknown schemas', () => {
		const emptyRes = convertAsrJson('   ', BASE_OPTIONS);
		expect(emptyRes.ok).toBe(false);
		if (!emptyRes.ok) {
			expect(emptyRes.error).toMatch(/empty/i);
		}

		const badJsonRes = convertAsrJson('{ "segments": [ broken', BASE_OPTIONS);
		expect(badJsonRes.ok).toBe(false);
		if (!badJsonRes.ok) {
			expect(badJsonRes.error).toMatch(/invalid json syntax/i);
		}

		const unknownShapeRes = convertAsrJson(
			JSON.stringify({ hello: 'world' }),
			BASE_OPTIONS,
		);
		expect(unknownShapeRes.ok).toBe(false);
		if (!unknownShapeRes.ok) {
			expect(unknownShapeRes.error).toMatch(/unrecognized/i);
		}

		const emptySegmentsRes = convertAsrJson(
			JSON.stringify({ segments: [] }),
			BASE_OPTIONS,
		);
		expect(emptySegmentsRes.ok).toBe(false);
	});

	it('converts a >2.5 MB OpenAI verbose_json payload without size caps', () => {
		const segments = Array.from({ length: 4200 }, (_, i) => {
			const segStart = i * 2;
			const segEnd = segStart + 1.8;
			const words = [
				'Podcast',
				'episode',
				'benchmark',
				'audio',
				'transcript',
				'segment',
				'verified',
				'locally',
			].map((word, idx) => ({
				word,
				start: Number((segStart + idx * 0.22).toFixed(2)),
				end: Number((segStart + idx * 0.22 + 0.2).toFixed(2)),
			}));
			return {
				id: i,
				seek: i * 200,
				start: segStart,
				end: segEnd,
				text: ' Podcast episode benchmark audio transcript segment verified locally.',
				tokens: [50364, 412, 889, 1024, 1532, 2048, 3072, 4096, 50456],
				temperature: 0,
				avg_logprob: -0.15,
				compression_ratio: 1.4,
				no_speech_prob: 0.01,
				words,
			};
		});

		const raw = JSON.stringify({
			task: 'transcribe',
			language: 'english',
			duration: 8400,
			segments,
		});
		expect(Buffer.byteLength(raw, 'utf8')).toBeGreaterThan(2.5 * 1024 * 1024);

		const result = convertAsrJson(raw, BASE_OPTIONS);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.cues.length).toBeGreaterThanOrEqual(4200);
			expect(result.output).toContain('00:00:00,000 -->');
		}
	});
});
