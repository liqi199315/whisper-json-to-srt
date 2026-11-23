import { describe, expect, it } from 'vitest';
import {
	SAMPLE_RARE_SUBTITLES,
	convertSubtitleText,
	detectSubtitleFormat,
	parseSubtitleText,
	reflowSubtitleCues,
} from '../src/lib/subtitle-parsers';
import type { SubtitleCue } from '../src/lib/types';

const SRT_SAMPLE = `1
00:00:00,500 --> 00:00:03,000
<i>Local conversion</i> keeps every frame on your machine.

2
00:00:03,200 --> 00:00:06,400
Captions and lyrics stay in sync.`;

const VTT_SAMPLE = `WEBVTT - Harbor walk
Kind: captions

NOTE This block is a comment
that spans two lines

STYLE
::cue { color: white }

intro
00:00:00.500 --> 00:00:03.000 align:start position:10%
<v Alice>Welcome to the old harbor walk.
Second visible line

00:00:03.200 --> 00:00:06.400
<v Bob>We begin at the ferry pier.`;

const TTML_TIMING_SAMPLE = `<tt xmlns:ttp="http://www.w3.org/ns/ttml#parameter" ttp:frameRate="25" ttp:tickRate="1000">
  <body>
    <div>
      <p begin="00:00:01:12" end="00:00:04:00">Frames and ticks<br/>line two</p>
      <p begin="1500t" dur="2s">A &amp; B &lt; C &#65;</p>
    </div>
  </body>
</tt>`;

const SSA_FALLBACK_SAMPLE = `[Script Info]
ScriptType: v4.00

[Events]
Dialogue: Marked=0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Plain SSA text`;

function cue(startSec: number, endSec: number, lines: string[]): SubtitleCue {
	return { index: 1, startSec, endSec, lines };
}

describe('detectSubtitleFormat', () => {
	it('detects each supported format from content', () => {
		const cases: Array<[SubtitleCue | string, string]> = [
			['srt', SRT_SAMPLE],
			['vtt', VTT_SAMPLE],
			['ttml', SAMPLE_RARE_SUBTITLES.ttml.content],
			['smi', SAMPLE_RARE_SUBTITLES.smi.content],
			['sbv', SAMPLE_RARE_SUBTITLES.sbv.content],
			['lrc', SAMPLE_RARE_SUBTITLES.lrc.content],
			['ass', SAMPLE_RARE_SUBTITLES.ass.content],
		];
		for (const [expected, content] of cases) {
			expect(detectSubtitleFormat(content as string)).toBe(expected);
		}
	});

	it('prefers content signatures over a misleading extension', () => {
		expect(detectSubtitleFormat(SRT_SAMPLE, 'captions.sbv')).toBe('srt');
	});

	it('falls back to the file extension when content is ambiguous', () => {
		expect(detectSubtitleFormat('', 'clip.sbv')).toBe('sbv');
		expect(detectSubtitleFormat('', 'clip.ssa')).toBe('ass');
		expect(detectSubtitleFormat('', 'clip.ttml')).toBe('ttml');
		expect(detectSubtitleFormat('', 'clip.dfxp')).toBe('ttml');
		expect(detectSubtitleFormat('', 'clip.smi')).toBe('smi');
		expect(detectSubtitleFormat('', 'clip.lrc')).toBe('lrc');
	});

	it('returns null for unknown content and unknown extensions', () => {
		expect(detectSubtitleFormat('plain words with no cues', 'notes.mov')).toBeNull();
		expect(detectSubtitleFormat('')).toBeNull();
	});
});

describe('TTML / DFXP parsing', () => {
	it('parses the built-in sample with millisecond clock times and a duration', () => {
		const parsed = parseSubtitleText(SAMPLE_RARE_SUBTITLES.ttml.content, {
			filename: 'harbor-walk.ttml',
		});
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.format).toBe('ttml');
		expect(parsed.formatLabel).toContain('TTML');
		expect(parsed.cues).toHaveLength(2);
		expect(parsed.cues[0]?.startSec).toBe(0.5);
		expect(parsed.cues[0]?.endSec).toBe(3);
		expect(parsed.cues[0]?.lines).toHaveLength(2);
		expect(parsed.cues[1]?.startSec).toBe(3.2);
		expect(parsed.cues[1]?.endSec).toBe(5.7);
		expect(parsed.warnings).toHaveLength(0);
	});

	it('supports frame times, tick times, durations, break tags, and XML entities', () => {
		const parsed = parseSubtitleText(TTML_TIMING_SAMPLE, { format: 'ttml' });
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.cues).toHaveLength(2);
		expect(parsed.cues[0]?.startSec).toBeCloseTo(1.48, 6);
		expect(parsed.cues[0]?.endSec).toBe(4);
		expect(parsed.cues[0]?.lines).toEqual(['Frames and ticks', 'line two']);
		expect(parsed.cues[1]?.startSec).toBe(1.5);
		expect(parsed.cues[1]?.endSec).toBe(3.5);
		expect(parsed.cues[1]?.lines).toEqual(['A & B < C A']);
	});

	it('defaults to 30 fps when ttp:frameRate is absent', () => {
		const parsed = parseSubtitleText(
			'<tt><body><div><p begin="00:00:02:15" end="00:00:05:00">Default rate</p></div></body></tt>',
			{ format: 'ttml' },
		);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.cues[0]?.startSec).toBe(2.5);
		expect(parsed.cues[0]?.endSec).toBe(5);
	});

	it('rejects a TTML document without cue elements', () => {
		const parsed = parseSubtitleText('<tt><body></body></tt>', { format: 'ttml' });
		expect(parsed.ok).toBe(false);
		if (!parsed.ok) expect(parsed.error).toContain('No readable TTML');
	});
});

describe('SAMI parsing', () => {
	it('pairs SYNC blocks and skips the blank end marker', () => {
		const parsed = parseSubtitleText(SAMPLE_RARE_SUBTITLES.smi.content, {
			filename: 'harbor-walk.smi',
		});
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.format).toBe('smi');
		expect(parsed.cues).toHaveLength(3);
		expect(parsed.cues.map((item) => item.startSec)).toEqual([0, 3.5, 7.2]);
		expect(parsed.cues[1]?.lines).toEqual([
			'We begin at the ferry pier',
			'and follow the promenade.',
		]);
		expect(parsed.cues[2]?.endSec).toBe(11);
		expect(parsed.cues.some((item) => item.lines.join(' ').includes('\u00a0'))).toBe(false);
	});

	it('accepts quoted Start values and gives the last cue a short tail', () => {
		const parsed = parseSubtitleText(
			'<SAMI><BODY><SYNC Start="1200"><P>First line</P></SYNC><SYNC Start="4000"><P>&nbsp;</P></SYNC></BODY></SAMI>',
			{ format: 'smi' },
		);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.cues).toHaveLength(1);
		expect(parsed.cues[0]?.startSec).toBe(1.2);
		expect(parsed.cues[0]?.endSec).toBe(4);
	});

	it('rejects a SAMI file without SYNC markers', () => {
		const parsed = parseSubtitleText('<SAMI><BODY>No sync here</BODY></SAMI>', {
			format: 'smi',
		});
		expect(parsed.ok).toBe(false);
		if (!parsed.ok) expect(parsed.error).toContain('SYNC');
	});
});

describe('SBV parsing', () => {
	it('parses comma separated time range headers followed by text blocks', () => {
		const parsed = parseSubtitleText(SAMPLE_RARE_SUBTITLES.sbv.content, {
			filename: 'bakery-reel.sbv',
		});
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.format).toBe('sbv');
		expect(parsed.cues).toHaveLength(3);
		expect(parsed.cues[0]?.startSec).toBe(0);
		expect(parsed.cues[0]?.endSec).toBe(3.4);
		expect(parsed.cues[2]?.startSec).toBe(7.5);
		expect(parsed.cues[2]?.endSec).toBe(11);
	});

	it('skips blocks without a valid SBV header', () => {
		const parsed = parseSubtitleText(
			'0:00:00.000,0:00:01.000\nFirst\n\nNot a time header\nSecond',
			{ format: 'sbv' },
		);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.cues).toHaveLength(1);
		expect(parsed.warnings).toHaveLength(1);
	});
});

describe('LRC parsing', () => {
	it('parses multiple timestamps per line, metadata tags, and chronological order', () => {
		const parsed = parseSubtitleText(SAMPLE_RARE_SUBTITLES.lrc.content, {
			filename: 'harbor-lights.lrc',
		});
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.format).toBe('lrc');
		expect(parsed.cues).toHaveLength(5);
		expect(parsed.cues.map((item) => item.startSec)).toEqual([1, 5.5, 10.25, 14.75, 40.25]);
		expect(parsed.cues[2]?.lines).toEqual(['Same line returns in the second verse']);
		expect(parsed.cues[4]?.lines).toEqual(['Same line returns in the second verse']);
		expect(parsed.cues[4]?.endSec).toBe(43.25);
	});

	it('treats a positive offset as an earlier start', () => {
		const parsed = parseSubtitleText('[offset:500]\n[00:02.00]Early', { format: 'lrc' });
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.cues[0]?.startSec).toBe(1.5);
	});

	it('treats a negative offset as a later start', () => {
		const parsed = parseSubtitleText('[offset:-250]\n[00:02.00]Later', { format: 'lrc' });
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.cues[0]?.startSec).toBe(2.25);
	});

	it('supports centiseconds and milliseconds in the same file', () => {
		const parsed = parseSubtitleText('[00:01.5]Tenths\n[00:02.25]Centis\n[00:03.125]Millis', {
			format: 'lrc',
		});
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.cues.map((item) => item.startSec)).toEqual([1.5, 2.25, 3.125]);
	});

	it('rejects an LRC file with no timed lines', () => {
		const parsed = parseSubtitleText('[ti:Only metadata]', { format: 'lrc' });
		expect(parsed.ok).toBe(false);
	});
});

describe('ASS / SSA parsing', () => {
	it('parses Format columns, override tags, centiseconds, and commas inside dialogue', () => {
		const parsed = parseSubtitleText(SAMPLE_RARE_SUBTITLES.ass.content, {
			filename: 'harbor-reel.ass',
		});
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.format).toBe('ass');
		expect(parsed.cues).toHaveLength(3);
		expect(parsed.cues[0]?.startSec).toBe(0.5);
		expect(parsed.cues[0]?.endSec).toBe(3.2);
		expect(parsed.cues[0]?.lines).toEqual(['Hold the shot, then pan left']);
		expect(parsed.cues[0]?.speaker).toBe('Ana');
		expect(parsed.cues[1]?.lines).toEqual([
			'Flour, water, salt, and time',
			'make the dough',
		]);
		expect(parsed.cues[2]?.lines).toEqual(['The oven door closes with a soft click']);
		expect(parsed.cues[2]?.speaker).toBe('Bruno');
	});

	it('falls back to SSA v4 column positions without a Format line', () => {
		const parsed = parseSubtitleText(SSA_FALLBACK_SAMPLE, { format: 'ass' });
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.cues).toHaveLength(1);
		expect(parsed.cues[0]?.startSec).toBe(1);
		expect(parsed.cues[0]?.endSec).toBe(2);
		expect(parsed.cues[0]?.lines).toEqual(['Plain SSA text']);
	});

	it('rejects an ASS file without dialogue lines', () => {
		const parsed = parseSubtitleText('[Events]\nFormat: Layer, Start, End, Text', {
			format: 'ass',
		});
		expect(parsed.ok).toBe(false);
	});
});

describe('SRT parsing', () => {
	it('parses indexes, timing lines, and inline markup', () => {
		const parsed = parseSubtitleText(SRT_SAMPLE, { filename: 'clip.srt' });
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.format).toBe('srt');
		expect(parsed.cues).toHaveLength(2);
		expect(parsed.cues[0]?.startSec).toBe(0.5);
		expect(parsed.cues[0]?.endSec).toBe(3);
		expect(parsed.cues[0]?.lines).toEqual([
			'Local conversion keeps every frame on your machine.',
		]);
		expect(parsed.cues[1]?.startSec).toBe(3.2);
	});

	it('decodes entities and strips font tags', () => {
		const parsed = parseSubtitleText(
			'1\n00:00:00,000 --> 00:00:01,500\n<font color="#fff">Tom &amp; Jerry</font>',
			{ format: 'srt' },
		);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.cues[0]?.lines).toEqual(['Tom & Jerry']);
	});

	it('skips malformed blocks and keeps the readable cues', () => {
		const parsed = parseSubtitleText(
			'1\n00:00:00,000 --> 00:00:01,000\nHi\n\nBroken block without timing\n\n2\n00:00:02,000 --> 00:00:03,000\nBye',
			{ format: 'srt' },
		);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.cues).toHaveLength(2);
		expect(parsed.warnings).toHaveLength(1);
	});
});

describe('WebVTT parsing', () => {
	it('skips the header, NOTE and STYLE blocks, cue ids, settings, and keeps voices', () => {
		const parsed = parseSubtitleText(VTT_SAMPLE, { filename: 'clip.vtt' });
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.format).toBe('vtt');
		expect(parsed.cues).toHaveLength(2);
		expect(parsed.cues[0]?.startSec).toBe(0.5);
		expect(parsed.cues[0]?.endSec).toBe(3);
		expect(parsed.cues[0]?.speaker).toBe('Alice');
		expect(parsed.cues[0]?.lines).toHaveLength(2);
		expect(parsed.cues[1]?.speaker).toBe('Bob');
	});

	it('parses timestamps without an hour component', () => {
		const parsed = parseSubtitleText(
			'WEBVTT\n\n00:01.500 --> 00:03.000\nShort clock',
			{ format: 'vtt' },
		);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.cues[0]?.startSec).toBe(1.5);
		expect(parsed.cues[0]?.endSec).toBe(3);
	});

	it('rejects a WebVTT file without cues', () => {
		const parsed = parseSubtitleText('WEBVTT\n\nNOTE nothing here', { format: 'vtt' });
		expect(parsed.ok).toBe(false);
		if (!parsed.ok) expect(parsed.error).toContain('No readable WebVTT');
	});
});

describe('reflowSubtitleCues', () => {
	it('wraps Latin text on word boundaries within two lines', () => {
		const result = reflowSubtitleCues([cue(1, 5, ['one two three four'])], {
			maxCharsPerLine: 10,
			maxLinesPerCue: 2,
			offsetMs: 0,
		});
		expect(result.issues).toHaveLength(0);
		expect(result.cues[0]?.lines).toEqual(['one two', 'three four']);
		expect(result.cues[0]?.lines.join(' ')).toBe('one two three four');
	});

	it('wraps CJK text per character and keeps closing punctuation attached', () => {
		const text = '这是一个用于测试换行功能的中文字幕样本';
		const result = reflowSubtitleCues([cue(0, 4, [text])], {
			maxCharsPerLine: 6,
			maxLinesPerCue: 2,
			offsetMs: 0,
		});
		expect(result.cues[0]?.lines[0]).toBe('这是一个用于');
		expect(result.cues[0]?.lines.join('')).toBe(text);
	});

	it('honours a single line limit and preserves the full text', () => {
		const result = reflowSubtitleCues([cue(0, 4, ['alpha beta gamma'])], {
			maxCharsPerLine: 5,
			maxLinesPerCue: 1,
			offsetMs: 0,
		});
		expect(result.cues[0]?.lines).toHaveLength(1);
		expect(result.cues[0]?.lines[0]).toContain('alpha beta gamma');
	});

	it('shifts positive offsets and preserves speakers and indexes', () => {
		const source: SubtitleCue = {
			index: 7,
			startSec: 1,
			endSec: 3,
			lines: ['Shifted line'],
			speaker: 'Ana',
		};
		const result = reflowSubtitleCues([source], {
			maxCharsPerLine: 42,
			maxLinesPerCue: 2,
			offsetMs: 1500,
		});
		expect(result.issues).toHaveLength(0);
		expect(result.cues[0]?.index).toBe(1);
		expect(result.cues[0]?.startSec).toBe(2.5);
		expect(result.cues[0]?.endSec).toBe(4.5);
		expect(result.cues[0]?.speaker).toBe('Ana');
	});

	it('clamps negative offsets at zero and reports an info issue', () => {
		const result = reflowSubtitleCues([cue(0.2, 2, ['Clamped cue'])], {
			maxCharsPerLine: 42,
			maxLinesPerCue: 2,
			offsetMs: -500,
		});
		expect(result.cues[0]?.startSec).toBe(0);
		expect(result.cues[0]?.endSec).toBe(1.5);
		expect(result.issues).toHaveLength(1);
		const issue = result.issues[0];
		expect(issue?.code).toBe('offset-clamped');
		expect(issue?.severity).toBe('info');
		expect(issue?.scope).toBe('cue');
		expect(issue?.message).toContain('clamped');
	});

	it('keeps a minimum duration when the whole cue falls before zero', () => {
		const result = reflowSubtitleCues([cue(0.1, 0.4, ['Deep shift'])], {
			maxCharsPerLine: 42,
			maxLinesPerCue: 2,
			offsetMs: -3000,
		});
		expect(result.cues[0]?.startSec).toBe(0);
		expect(result.cues[0]?.endSec).toBe(0.05);
		expect(result.issues[0]?.code).toBe('offset-clamped');
	});
});

describe('convertSubtitleText', () => {
	it('converts SRT to VTT with a clean timeline report', () => {
		const result = convertSubtitleText(SRT_SAMPLE, {
			format: 'vtt',
			maxCharsPerLine: 42,
			maxLinesPerCue: 2,
			offsetMs: 0,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.inputFormat).toBe('srt');
		expect(result.inputFormatLabel).toContain('SubRip');
		expect(result.output.startsWith('WEBVTT\n\n')).toBe(true);
		expect(result.qc.status).toBe('clean');
		expect(result.qc.issues).toHaveLength(0);
		expect(result.qc.emittedCues).toBe(2);
		expect(result.warnings).toHaveLength(0);
	});

	it('reports offset clamping through the timeline QC report', () => {
		const result = convertSubtitleText(SAMPLE_RARE_SUBTITLES.ttml.content, {
			format: 'srt',
			maxCharsPerLine: 42,
			maxLinesPerCue: 2,
			offsetMs: -2000,
			filename: 'harbor-walk.ttml',
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.qc.status).toBe('clean');
		expect(result.qc.infoCount).toBe(1);
		expect(result.qc.issues[0]?.code).toBe('offset-clamped');
		expect(result.cues[0]?.startSec).toBe(0);
		expect(result.cues[0]?.endSec).toBe(1);
		expect(result.output).toContain('00:00:00,000 --> 00:00:01,000');
	});

	it('reports reversed ranges as warnings without dropping the cue', () => {
		const result = convertSubtitleText(
			'1\n00:00:05,000 --> 00:00:02,000\nReversed range',
			{ format: 'srt', maxCharsPerLine: 42, maxLinesPerCue: 2, offsetMs: 0 },
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.qc.status).toBe('warning');
		expect(result.qc.issues.some((issue) => issue.code === 'reversed-range')).toBe(true);
		expect(result.cues[0]?.startSec).toBe(5);
		expect(result.cues[0]?.endSec).toBe(2);
	});

	it('honours forceInputFormat when detection is bypassed', () => {
		const result = convertSubtitleText(SAMPLE_RARE_SUBTITLES.sbv.content, {
			format: 'srt',
			maxCharsPerLine: 42,
			maxLinesPerCue: 2,
			offsetMs: 0,
			forceInputFormat: 'sbv',
			filename: 'clip.txt',
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.inputFormat).toBe('sbv');
		expect(result.cues.length).toBeGreaterThan(0);
	});

	it('applies the requested line budget during conversion', () => {
		const result = convertSubtitleText(SAMPLE_RARE_SUBTITLES.ass.content, {
			format: 'srt',
			maxCharsPerLine: 18,
			maxLinesPerCue: 2,
			offsetMs: 0,
			filename: 'harbor-reel.ass',
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		for (const item of result.cues) {
			expect(item.lines.length).toBeLessThanOrEqual(2);
		}
	});

	it('rejects empty, binary, and unknown inputs', () => {
		const empty = convertSubtitleText('   ', {
			format: 'srt',
			maxCharsPerLine: 42,
			maxLinesPerCue: 2,
			offsetMs: 0,
		});
		expect(empty.ok).toBe(false);
		if (!empty.ok) expect(empty.error).toContain('Empty subtitle input');

		const binary = convertSubtitleText('\u0000\u0001\u0002', {
			format: 'srt',
			maxCharsPerLine: 42,
			maxLinesPerCue: 2,
			offsetMs: 0,
		});
		expect(binary.ok).toBe(false);
		if (!binary.ok) expect(binary.error).toContain('Binary');

		const unknown = convertSubtitleText('plain words with no cues', {
			format: 'srt',
			maxCharsPerLine: 42,
			maxLinesPerCue: 2,
			offsetMs: 0,
		});
		expect(unknown.ok).toBe(false);
		if (!unknown.ok) expect(unknown.error).toContain('Could not detect');
	});

	it('fails with parser detail when every cue is empty', () => {
		const result = convertSubtitleText('1\n00:00:00,000 --> 00:00:01,000\n', {
			format: 'srt',
			maxCharsPerLine: 42,
			maxLinesPerCue: 2,
			offsetMs: 0,
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain('No readable SRT');
	});
});

describe('SAMPLE_RARE_SUBTITLES', () => {
	it('parses and converts every sample cleanly with no dash violations', () => {
		for (const sample of Object.values(SAMPLE_RARE_SUBTITLES)) {
			expect(sample.content).not.toMatch(/[\u2013\u2014]/);
			const doubledBrace = '{' + '{';
			expect(sample.content).not.toContain(doubledBrace);

			const parsed = parseSubtitleText(sample.content, { filename: sample.filename });
			expect(parsed.ok).toBe(true);
			if (!parsed.ok) return;
			expect(parsed.format).toBe(sample.format);
			expect(parsed.cues.length).toBeGreaterThan(0);

			const converted = convertSubtitleText(sample.content, {
				format: 'srt',
				maxCharsPerLine: 42,
				maxLinesPerCue: 2,
				offsetMs: 0,
				filename: sample.filename,
			});
			expect(converted.ok).toBe(true);
			if (!converted.ok) return;
			expect(converted.qc.status).toBe('clean');
			expect(converted.output.length).toBeGreaterThan(0);
		}
	});
});
