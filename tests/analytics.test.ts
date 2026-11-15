import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	SUBTITLE_CONVERTED_EVENT,
	resetSubtitleConvertedSession,
	sanitizeAnalyticsParams,
	trackSubtitleConverted,
	trackToolEvent,
} from '../src/lib/analytics';

type GtagCall = [command: 'event', eventName: string, params?: Record<string, unknown>];

function installGtag(): GtagCall[] {
	const calls: GtagCall[] = [];
	vi.stubGlobal('window', {
		gtag: (command: 'event', eventName: string, params?: Record<string, unknown>) => {
			calls.push([command, eventName, params]);
		},
	});
	return calls;
}

describe('trackSubtitleConverted', () => {
	it('sends subtitle_converted once per page load with format and cue_count only', () => {
		const calls = installGtag();
		resetSubtitleConvertedSession();

		expect(trackSubtitleConverted({ format: 'srt', cueCount: 3 })).toBe(true);
		expect(trackSubtitleConverted({ format: 'vtt', cueCount: 9 })).toBe(false);

		expect(calls).toEqual([
			[
				'event',
				SUBTITLE_CONVERTED_EVENT,
				{ format: 'srt', cue_count: 3 },
			],
		]);
		expect(calls.some((call) => call[1] === 'subtitle_export')).toBe(false);
	});

	it('does not send subtitle_converted for a failed conversion', () => {
		const calls = installGtag();
		resetSubtitleConvertedSession();

		expect(trackSubtitleConverted({ format: 'srt', cueCount: 0, ok: false })).toBe(false);
		expect(calls).toEqual([]);

		expect(trackSubtitleConverted({ format: 'srt', cueCount: 2 })).toBe(true);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.[1]).toBe(SUBTITLE_CONVERTED_EVENT);
	});

	it('keeps the existing subtitle_export helper path unchanged', () => {
		const calls = installGtag();
		resetSubtitleConvertedSession();

		trackToolEvent('subtitle_export', { export_action: 'copy', output_format: 'srt' });
		trackToolEvent('subtitle_export', { export_action: 'download', output_format: 'vtt' });

		expect(calls.map((call) => call[1])).toEqual(['subtitle_export', 'subtitle_export']);
		expect(calls[0]?.[2]).toEqual({ export_action: 'copy', output_format: 'srt' });
		expect(calls[1]?.[2]).toEqual({ export_action: 'download', output_format: 'vtt' });
	});

	it('drops identifying params before any event is sent', () => {
		expect(
			sanitizeAnalyticsParams({
				format: 'srt',
				cue_count: 4,
				filename: 'meeting.json',
				text: 'hello from the transcript',
			}),
		).toEqual({ format: 'srt', cue_count: 4 });
	});
});

afterEach(() => {
	resetSubtitleConvertedSession();
	vi.unstubAllGlobals();
});
