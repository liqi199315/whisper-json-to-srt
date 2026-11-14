import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	convertAsrJson,
	formatTimestamp,
	parseAsrJson,
	reflowCues,
} from '../src/lib/subtitle-engine';
import { SAMPLE_PAYLOADS, SAMPLE_ORDER } from '../src/lib/sample-payloads';
import { formatQcReport } from '../src/lib/timeline-qc';
import type { CueFormatOptions } from '../src/lib/types';

const FIXTURE_DIR = path.resolve(__dirname, 'fixtures/qc');

const BASE_OPTIONS: CueFormatOptions = {
	format: 'srt',
	maxCharsPerLine: 42,
	maxLinesPerCue: 2,
	maxCueDurationSec: 5,
	pauseSplitGapSec: 0.6,
	offsetMs: 0,
	includeSpeakerPrefix: false,
};

function fixture(name: string): string {
	return readFileSync(path.join(FIXTURE_DIR, name), 'utf8');
}

describe('timeline QC: non-finite and unrepresentable input times', () => {
	it('drops overflow timings instead of emitting 00:00:00,000 for them', () => {
		const result = convertAsrJson(fixture('overflow-finite.json'), BASE_OPTIONS);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.qc.issues.some((issue) => issue.code === 'unrepresentable-time')).toBe(true);
		expect(result.qc.omittedSegments).toBe(1);
		expect(result.qc.emittedCues).toBe(1);
		expect(result.cues.every((cue) => Number.isFinite(cue.startSec) && Number.isFinite(cue.endSec))).toBe(
			true,
		);
		expect(result.output).not.toContain('00:00:00,000 --> 00:00:00,000');
		expect(result.output).not.toContain('OVERFLOW_FINITE_LINE');
		expect(result.output).toContain('VALID_LINE_BEFORE_OVERFLOW');
	});

	it('reports JSON 1e999 as a non-finite time with segment position and raw value', () => {
		const result = convertAsrJson(fixture('mixed-defects.json'), BASE_OPTIONS);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const infinite = result.qc.issues.filter(
			(issue) => issue.code === 'invalid-time' && issue.scope === 'segment' && issue.index === 5,
		);
		expect(infinite.length).toBeGreaterThan(0);
		expect(infinite.some((issue) => issue.value === 'Infinity')).toBe(true);
		expect(result.output).not.toContain('PRIVATE_TRANSCRIPT_MARKER');
		expect(result.output).not.toContain('00:00:00,000 --> 00:00:00,000');
	});

	it('classifies null and "NaN" string times as invalid instead of zero', () => {
		const result = convertAsrJson(fixture('nan-expressions.json'), BASE_OPTIONS);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.qc.omittedSegments).toBe(2);
		expect(
			result.qc.issues.some(
				(issue) => issue.code === 'invalid-time' && issue.index === 1 && issue.value === 'null',
			),
		).toBe(true);
		expect(
			result.qc.issues.some(
				(issue) => issue.code === 'invalid-time' && issue.index === 2 && issue.value === '"NaN"',
			),
		).toBe(true);
		expect(result.output).toContain('KEPT_LINE');
		expect(result.output).not.toContain('NULL_START_LINE');
		expect(result.output).not.toContain('STRING_NAN_LINE');
	});

	it('refuses conversion when every candidate segment is invalid and keeps QC detail', () => {
		const result = convertAsrJson(fixture('all-invalid.json'), BASE_OPTIONS);
		expect(result.ok).toBe(false);
		if (result.ok) return;

		expect(result.error).toMatch(/timeline qc|invalid-time|no timed transcript/i);
		expect(result.qc?.errorCount).toBeGreaterThan(0);
		expect(result.qc?.issues.some((issue) => issue.code === 'invalid-time')).toBe(true);
	});

	it('throws instead of formatting non-finite timestamps as 00:00:00', () => {
		expect(() => formatTimestamp(Number.NaN, 'srt')).toThrow(RangeError);
		expect(() => formatTimestamp(Number.POSITIVE_INFINITY, 'vtt')).toThrow(RangeError);
		expect(formatTimestamp(-4.25, 'srt')).toBe('00:00:00,000');
	});
});

describe('timeline QC: reversed ranges, overlap, and empty segments', () => {
	it('reports reversed source ranges without moving the cue', () => {
		const result = convertAsrJson(fixture('mixed-defects.json'), BASE_OPTIONS);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(
			result.qc.issues.some(
				(issue) => issue.code === 'reversed-range' && issue.scope === 'segment' && issue.index === 4,
			),
		).toBe(true);
		expect(
			result.qc.issues.some(
				(issue) => issue.code === 'reversed-range' && issue.scope === 'cue',
			),
		).toBe(true);
		expect(result.output).toContain('00:00:08,000 --> 00:00:06,500');
	});

	it('reports cue overlap with both cue positions and does not shift timing', () => {
		const result = convertAsrJson(fixture('upload-overlap.json'), BASE_OPTIONS);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const overlap = result.qc.issues.find((issue) => issue.code === 'overlap');
		expect(overlap).toBeDefined();
		expect(overlap?.index).toBe(2);
		expect(overlap?.relatedIndex).toBe(1);
		expect(overlap?.value).toBe('0.500');
		expect(result.output).toContain('00:00:00,000 --> 00:00:02,000');
		expect(result.output).toContain('00:00:01,500 --> 00:00:03,500');
	});

	it('counts omitted empty segments and reports their position', () => {
		const result = convertAsrJson(fixture('mixed-defects.json'), BASE_OPTIONS);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.qc.omittedSegments).toBe(3);
		expect(
			result.qc.issues.some(
				(issue) => issue.code === 'empty-segment' && issue.scope === 'segment' && issue.index === 7,
			),
		).toBe(true);
	});

	it('reports no false positives across every built-in sample dialect', () => {
		for (const id of SAMPLE_ORDER) {
			const result = convertAsrJson(SAMPLE_PAYLOADS[id].json, BASE_OPTIONS);
			expect(result.ok, `${id} should convert`).toBe(true);
			if (!result.ok) continue;
			expect(
				result.qc.issues.map((issue) => `${issue.code}@${issue.scope}:${issue.index}`),
				`${id} should be timeline-clean`,
			).toEqual([]);
			expect(result.qc.omittedSegments).toBe(0);
		}
	});

	it('keeps a clean fixture at zero issues', () => {
		const result = convertAsrJson(fixture('clean.json'), BASE_OPTIONS);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.qc.status).toBe('clean');
		expect(result.qc.issues).toEqual([]);
		expect(result.qc.errorCount).toBe(0);
		expect(result.qc.warningCount).toBe(0);
		expect(result.qc.omittedSegments).toBe(0);
		expect(result.qc.emittedCues).toBe(3);
	});

	it('treats negative user offsets as explicit clamping notes, not reversed cues', () => {
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

		const issues: Parameters<typeof formatQcReport>[0]['issues'] = [];
		const cues = reflowCues(parsed, { ...BASE_OPTIONS, offsetMs: -2000 }, (issue) =>
			issues.push(issue),
		);

		expect(cues[0]?.startSec).toBe(0);
		expect(cues[0]?.endSec).toBe(0.05);
		expect(issues.filter((issue) => issue.code === 'offset-clamped')).toHaveLength(1);
		expect(issues.some((issue) => issue.code === 'reversed-range')).toBe(false);
	});

	it('does not label negative source times as user offset clamping', () => {
		const result = convertAsrJson(
			JSON.stringify({
				segments: [{ start: 0.5, end: -1, text: 'NEGATIVE_END_LINE' }],
			}),
			BASE_OPTIONS,
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.qc.issues.some((issue) => issue.code === 'negative-time')).toBe(true);
		expect(result.qc.issues.some((issue) => issue.code === 'reversed-range')).toBe(true);
		expect(result.qc.issues.some((issue) => issue.code === 'offset-clamped')).toBe(false);
	});
});

describe('timeline QC report hygiene', () => {
	it('formats a plain-text report without transcript text', () => {
		const result = convertAsrJson(fixture('mixed-defects.json'), BASE_OPTIONS);
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		const report = formatQcReport(result.qc);
		expect(report).toContain('Timeline QC report');
		expect(report).toContain('[invalid-time]');
		expect(report).toContain('[overlap]');
		expect(report).toContain('[empty-segment]');
		expect(report).not.toContain('PRIVATE_TRANSCRIPT_MARKER');
		expect(report).not.toContain('CLEAN_OPENING_LINE');
	});
});
