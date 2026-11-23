import { describe, expect, it } from 'vitest';
import {
	MAX_MERGE_TRACKS,
	MIN_MERGE_TRACKS,
	SAMPLE_BILINGUAL_TRACKS,
	mergeSubtitleTracks,
	parseTrackSrtOrVtt,
} from '../src/lib/subtitle-merge';
import type {
	MergeMode,
	MergeSubtitlesOptions,
	MergeTrackInput,
} from '../src/lib/subtitle-merge';

interface RawCue {
	start: string;
	end: string;
	text: string;
}

function buildSrt(cues: RawCue[]): string {
	return `${cues
		.map((cue, index) => `${index + 1}\n${cue.start} --> ${cue.end}\n${cue.text}`)
		.join('\n\n')}\n`;
}

function buildVtt(cues: RawCue[]): string {
	return `WEBVTT\n\n${cues
		.map((cue) => `${cue.start} --> ${cue.end}\n${cue.text}`)
		.join('\n\n')}\n`;
}

const BASE_OPTIONS: MergeSubtitlesOptions = {
	mode: 'stacked',
	outputFormat: 'srt',
	toleranceMs: 100,
	sequentialGapMs: 500,
	includeLabels: false,
};

function options(overrides: Partial<MergeSubtitlesOptions> = {}): MergeSubtitlesOptions {
	return { ...BASE_OPTIONS, ...overrides };
}

function track(id: string, name: string, content: string, label?: string): MergeTrackInput {
	const result: MergeTrackInput = { id, name, content };
	if (label !== undefined) result.label = label;
	return result;
}

describe('parseTrackSrtOrVtt', () => {
	it('parses SRT with BOM, CRLF, index lines, and multi-line text', () => {
		const raw =
			'\uFEFF1\r\n00:00:00,000 --> 00:00:01,250\r\nHello\r\nWorld\r\n\r\n' +
			'2\r\n00:00:02,000 --> 00:00:03,500\r\nSecond cue\r\n';
		const result = parseTrackSrtOrVtt(raw);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.format).toBe('srt');
		expect(result.cues).toHaveLength(2);
		expect(result.cues[0]!.lines).toEqual(['Hello', 'World']);
		expect(result.cues[0]!.startSec).toBe(0);
		expect(result.cues[0]!.endSec).toBeCloseTo(1.25, 9);
		expect(result.cues[1]!.index).toBe(2);
	});

	it('parses WebVTT with header, cue identifiers, settings, and short timestamps', () => {
		const raw = [
			'WEBVTT',
			'Kind: captions',
			'',
			'intro',
			'00:01.000 --> 00:03.500 align:start position:0%',
			'Hello there',
			'',
			'00:04.000 --> 00:06.000',
			'Next line',
			'',
		].join('\n');
		const result = parseTrackSrtOrVtt(raw);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.format).toBe('vtt');
		expect(result.cues).toHaveLength(2);
		expect(result.cues[0]!.startSec).toBeCloseTo(1, 9);
		expect(result.cues[0]!.endSec).toBeCloseTo(3.5, 9);
		expect(result.cues[0]!.lines).toEqual(['Hello there']);
		expect(result.cues[1]!.startSec).toBeCloseTo(4, 9);
	});

	it('rejects empty and untimed input', () => {
		expect(parseTrackSrtOrVtt('')).toMatchObject({ ok: false });
		expect(parseTrackSrtOrVtt('   \n  ')).toMatchObject({ ok: false });
		expect(parseTrackSrtOrVtt('not a subtitle')).toMatchObject({ ok: false });
		expect(parseTrackSrtOrVtt('WEBVTT\n\n')).toMatchObject({ ok: false });
	});

	it('skips WebVTT NOTE blocks', () => {
		const raw = [
			'WEBVTT',
			'',
			'NOTE this is a comment',
			'',
			'00:01.000 --> 00:02.000',
			'Visible line',
			'',
		].join('\n');
		const result = parseTrackSrtOrVtt(raw);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.cues).toHaveLength(1);
		expect(result.cues[0]!.lines).toEqual(['Visible line']);
	});
});

describe('mergeSubtitleTracks guard rails', () => {
	const valid = buildSrt([{ start: '00:00:00,000', end: '00:00:01,000', text: 'Line' }]);

	it('rejects fewer than two tracks', () => {
		const result = mergeSubtitleTracks([], options());
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toContain(`at least ${MIN_MERGE_TRACKS}`);

		const single = mergeSubtitleTracks([track('a', 'A', valid)], options());
		expect(single.ok).toBe(false);
		if (single.ok) return;
		expect(single.error).toContain('at least 2');
	});

	it('rejects more than ten tracks', () => {
		const tracks = Array.from({ length: MAX_MERGE_TRACKS + 1 }, (_, index) =>
			track(`t${index}`, `Track ${index + 1}`, valid),
		);
		const result = mergeSubtitleTracks(tracks, options());
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toContain(`at most ${MAX_MERGE_TRACKS}`);
		expect(result.error).toContain('Received 11');
	});

	it('rejects a track with no valid cues', () => {
		const result = mergeSubtitleTracks(
			[track('a', 'English', valid), track('b', 'Broken', 'no timing here')],
			options(),
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toContain('Track 2 ("Broken") has no valid cues');
	});

	it('rejects unknown modes and negative option values', () => {
		const tracks = [track('a', 'A', valid), track('b', 'B', valid)];
		const badMode = mergeSubtitleTracks(tracks, options({ mode: 'sideways' as MergeMode }));
		expect(badMode.ok).toBe(false);

		const badTolerance = mergeSubtitleTracks(tracks, options({ toleranceMs: -1 }));
		expect(badTolerance.ok).toBe(false);

		const badGap = mergeSubtitleTracks(tracks, options({ sequentialGapMs: Number.NaN }));
		expect(badGap.ok).toBe(false);
	});
});

describe('stacked merge', () => {
	const english = buildSrt([
		{ start: '00:00:00,500', end: '00:00:02,000', text: 'Anchor one' },
		{ start: '00:00:03,000', end: '00:00:04,500', text: 'Anchor two' },
	]);
	const chinese = buildVtt([
		{ start: '00:00:00.500', end: '00:00:02.000', text: '第一条' },
		{ start: '00:00:03.000', end: '00:00:04.500', text: '第二条' },
	]);

	it('merges two aligned tracks into one cue list', () => {
		const result = mergeSubtitleTracks(
			[track('en', 'English', english), track('zh', 'Chinese', chinese)],
			options(),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.stats.trackCount).toBe(2);
		expect(result.stats.inputCueCounts).toEqual([2, 2]);
		expect(result.stats.outputCueCount).toBe(2);
		expect(result.stats.alignedCount).toBe(2);
		expect(result.stats.driftCount).toBe(0);
		expect(result.stats.overlapCount).toBe(0);
		expect(result.stats.unmatchedCount).toBe(0);
		expect(result.qc.emittedCues).toBe(2);

		expect(result.cues[0]!.lines).toEqual(['Anchor one', '第一条']);
		expect(result.cues[1]!.lines).toEqual(['Anchor two', '第二条']);
		expect(result.diffPreview[0]!.sourceTracks).toEqual(['en', 'zh']);
		expect(result.diffPreview[0]!.status).toBe('aligned');
		expect(result.output).toContain('00:00:00,500 --> 00:00:02,000');
		expect(result.output).not.toContain('WEBVTT');
	});

	it('adds bracket labels without double brackets', () => {
		const withLabels = mergeSubtitleTracks(
			[
				track('en', 'English', english, 'EN'),
				track('zh', 'Chinese', chinese, '[ZH]'),
			],
			options({ includeLabels: true }),
		);
		expect(withLabels.ok).toBe(true);
		if (!withLabels.ok) return;
		expect(withLabels.cues[0]!.lines[0]).toBe('[EN] Anchor one');
		expect(withLabels.cues[0]!.lines[1]).toBe('[ZH] 第一条');
		expect(withLabels.output).not.toContain('[[ZH]]');
		expect(withLabels.output).toContain('[EN] Anchor two');

		const withoutLabels = mergeSubtitleTracks(
			[track('en', 'English', english, 'EN'), track('zh', 'Chinese', chinese, '[ZH]')],
			options({ includeLabels: false }),
		);
		expect(withoutLabels.ok).toBe(true);
		if (!withoutLabels.ok) return;
		expect(withoutLabels.cues[0]!.lines).toEqual(['Anchor one', '第一条']);
	});

	it('reports start-time drift and respects the tolerance window', () => {
		const drifted = buildVtt([
			{ start: '00:00:00.700', end: '00:00:02.200', text: '偏移一' },
			{ start: '00:00:03.200', end: '00:00:04.700', text: '偏移二' },
		]);

		const strict = mergeSubtitleTracks(
			[track('en', 'English', english), track('zh', 'Chinese', drifted)],
			options({ toleranceMs: 100 }),
		);
		expect(strict.ok).toBe(true);
		if (!strict.ok) return;
		expect(strict.stats.driftCount).toBe(2);
		expect(strict.stats.alignedCount).toBe(0);
		expect(strict.diffPreview[0]!.driftMs).toBe(200);
		expect(strict.diffPreview[0]!.status).toBe('drift');
		expect(strict.diffPreview[0]!.note).toContain('200 ms');

		const relaxed = mergeSubtitleTracks(
			[track('en', 'English', english), track('zh', 'Chinese', drifted)],
			options({ toleranceMs: 1000 }),
		);
		expect(relaxed.ok).toBe(true);
		if (!relaxed.ok) return;
		expect(relaxed.stats.driftCount).toBe(0);
		expect(relaxed.stats.alignedCount).toBe(2);
		expect(relaxed.diffPreview[0]!.status).toBe('aligned');
	});

	it('keeps unmatched anchor and secondary cues in chronological order', () => {
		const anchor = buildSrt([
			{ start: '00:00:00,000', end: '00:00:01,000', text: 'Matched anchor' },
			{ start: '00:00:02,000', end: '00:00:03,000', text: 'Lonely anchor' },
		]);
		const secondary = buildSrt([
			{ start: '00:00:00,000', end: '00:00:01,000', text: 'Matched secondary' },
			{ start: '00:00:10,000', end: '00:00:11,000', text: 'Late secondary' },
		]);

		const result = mergeSubtitleTracks(
			[track('en', 'English', anchor), track('zh', 'Chinese', secondary)],
			options({ toleranceMs: 100 }),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.stats.outputCueCount).toBe(3);
		expect(result.stats.alignedCount).toBe(1);
		expect(result.stats.unmatchedCount).toBe(2);
		expect(result.cues.map((cue) => cue.startSec)).toEqual([0, 2, 10]);
		expect(result.diffPreview[1]!.status).toBe('unmatched');
		expect(result.diffPreview[1]!.note).toContain('No secondary cue matched');
		expect(result.diffPreview[2]!.status).toBe('unmatched');
		expect(result.diffPreview[2]!.note).toContain('No anchor cue matched');
		expect(result.output).toContain('Lonely anchor');
		expect(result.output).toContain('Late secondary');
	});

	it('accepts ten tracks and stacks all of their lines', () => {
		const tracks = Array.from({ length: MAX_MERGE_TRACKS }, (_, index) =>
			track(
				`t${index}`,
				`Track ${index + 1}`,
				buildSrt([
					{ start: '00:00:00,000', end: '00:00:01,000', text: `Line ${index + 1}` },
				]),
			),
		);
		const result = mergeSubtitleTracks(tracks, options());
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.stats.trackCount).toBe(MAX_MERGE_TRACKS);
		expect(result.stats.inputCueCounts).toEqual(Array.from({ length: 10 }, () => 1));
		expect(result.stats.outputCueCount).toBe(1);
		expect(result.cues[0]!.lines).toHaveLength(10);
		expect(result.diffPreview[0]!.sourceTracks).toHaveLength(10);
		expect(result.diffPreview[0]!.status).toBe('aligned');
	});
});

describe('interleave merge', () => {
	const english = buildSrt([
		{ start: '00:00:00,000', end: '00:00:02,000', text: 'EN zero' },
		{ start: '00:00:04,000', end: '00:00:06,000', text: 'EN four' },
	]);
	const chinese = buildVtt([
		{ start: '00:00:01.000', end: '00:00:03.000', text: 'ZH one' },
		{ start: '00:00:05.000', end: '00:00:07.000', text: 'ZH five' },
	]);

	it('sorts all cues by start time and flags overlaps with the predecessor', () => {
		const result = mergeSubtitleTracks(
			[track('en', 'English', english), track('zh', 'Chinese', chinese)],
			options({ mode: 'interleave' }),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.cues.map((cue) => cue.startSec)).toEqual([0, 1, 4, 5]);
		expect(result.cues.map((cue) => cue.index)).toEqual([1, 2, 3, 4]);
		expect(result.diffPreview.map((item) => item.status)).toEqual([
			'aligned',
			'overlap',
			'aligned',
			'overlap',
		]);
		expect(result.diffPreview[0]!.note).toBe('First cue in the merged timeline.');
		expect(result.diffPreview[1]!.overlapMs).toBe(1000);
		expect(result.diffPreview[1]!.note).toContain('1000 ms');
		expect(result.stats.overlapCount).toBe(2);
		expect(result.stats.alignedCount).toBe(2);
		expect(result.diffPreview[1]!.sourceTracks).toEqual(['zh']);
		expect(result.qc.issues.some((issue) => issue.code === 'overlap')).toBe(true);
	});

	it('breaks start-time ties by end time, track index, then original index', () => {
		const first = buildSrt([
			{ start: '00:00:00,000', end: '00:00:02,000', text: 'First A' },
			{ start: '00:00:00,000', end: '00:00:01,000', text: 'First B' },
			{ start: '00:00:00,000', end: '00:00:01,000', text: 'First C' },
		]);
		const second = buildVtt([{ start: '00:00:00.000', end: '00:00:01.000', text: 'Second' }]);

		const result = mergeSubtitleTracks(
			[track('a', 'A', first), track('b', 'B', second)],
			options({ mode: 'interleave' }),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.cues.map((cue) => cue.lines[0])).toEqual([
			'First B',
			'First C',
			'Second',
			'First A',
		]);
	});
});

describe('sequential merge', () => {
	const first = buildSrt([
		{ start: '00:00:00,000', end: '00:00:01,000', text: 'A1' },
		{ start: '00:00:02,000', end: '00:00:03,000', text: 'A2' },
	]);

	it('shifts later tracks to the requested gap and keeps exact spacing', () => {
		const second = buildVtt([
			{ start: '00:00:05.000', end: '00:00:06.000', text: 'B1' },
			{ start: '00:00:07.000', end: '00:00:08.000', text: 'B2' },
		]);
		const result = mergeSubtitleTracks(
			[track('a', 'A', first), track('b', 'B', second)],
			options({ mode: 'sequential', sequentialGapMs: 500 }),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.cues.map((cue) => cue.startSec)).toEqual([0, 2, 3.5, 5.5]);
		expect(result.cues[2]!.endSec).toBe(4.5);
		expect(result.cues[2]!.startSec - result.cues[1]!.endSec).toBeCloseTo(0.5, 9);
		expect(result.cues.map((cue) => cue.index)).toEqual([1, 2, 3, 4]);
		expect(result.diffPreview.every((item) => item.status === 'aligned')).toBe(true);
		expect(result.stats.outputCueCount).toBe(4);
	});

	it('produces the same placement when the next track starts at zero', () => {
		const second = buildSrt([
			{ start: '00:00:00,000', end: '00:00:01,000', text: 'B1' },
			{ start: '00:00:02,000', end: '00:00:03,000', text: 'B2' },
		]);
		const result = mergeSubtitleTracks(
			[track('a', 'A', first), track('b', 'B', second)],
			options({ mode: 'sequential', sequentialGapMs: 500 }),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.cues.map((cue) => cue.startSec)).toEqual([0, 2, 3.5, 5.5]);
	});
});

describe('output formats', () => {
	const english = buildSrt([
		{ start: '00:00:00,500', end: '00:00:02,000', text: 'Hello' },
	]);
	const chinese = buildVtt([
		{ start: '00:00:00.500', end: '00:00:02.000', text: '你好' },
	]);

	it('exports SRT with comma timestamps and numbered cues', () => {
		const result = mergeSubtitleTracks(
			[track('en', 'English', english), track('zh', 'Chinese', chinese)],
			options({ outputFormat: 'srt' }),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.output.startsWith('1\n')).toBe(true);
		expect(result.output).toContain('00:00:00,500 --> 00:00:02,000');
		expect(result.output).toContain('Hello\n你好');
	});

	it('exports VTT with a WEBVTT header and dot timestamps', () => {
		const result = mergeSubtitleTracks(
			[track('en', 'English', english), track('zh', 'Chinese', chinese)],
			options({ outputFormat: 'vtt' }),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.output.startsWith('WEBVTT\n\n')).toBe(true);
		expect(result.output).toContain('00:00:00.500 --> 00:00:02.000');
		expect(result.output).not.toContain('00:00:00,500');
	});
});

describe('bilingual sample', () => {
	it('parses both sample tracks with their expected formats', () => {
		expect(SAMPLE_BILINGUAL_TRACKS).toHaveLength(2);
		const english = parseTrackSrtOrVtt(SAMPLE_BILINGUAL_TRACKS[0]!.content);
		const chinese = parseTrackSrtOrVtt(SAMPLE_BILINGUAL_TRACKS[1]!.content);
		expect(english.ok).toBe(true);
		expect(chinese.ok).toBe(true);
		if (!english.ok || !chinese.ok) return;
		expect(english.format).toBe('srt');
		expect(chinese.format).toBe('vtt');
		expect(english.cues).toHaveLength(4);
		expect(chinese.cues).toHaveLength(4);
	});

	it('surfaces the intentional drift cue and keeps both languages labeled', () => {
		const result = mergeSubtitleTracks(
			SAMPLE_BILINGUAL_TRACKS,
			options({ mode: 'stacked', toleranceMs: 500, includeLabels: true }),
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.stats.driftCount).toBeGreaterThanOrEqual(1);
		const drift = result.diffPreview.find((item) => item.status === 'drift');
		expect(drift).toBeDefined();
		expect(drift!.driftMs).toBeGreaterThanOrEqual(150);
		expect(result.output).toContain('[EN]');
		expect(result.output).toContain('[ZH]');
		expect(result.output).toContain('Welcome back to the workshop.');
		expect(result.output).toContain('今天我们组装框架。');
	});

	it('contains no em-dash or en-dash characters', () => {
		const serialized = JSON.stringify(SAMPLE_BILINGUAL_TRACKS);
		expect(serialized.includes('\u2014')).toBe(false);
		expect(serialized.includes('\u2013')).toBe(false);
	});
});
