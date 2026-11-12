export type DialectId =
	| 'openai-verbose-json'
	| 'whisperx-diarized'
	| 'whisper-cpp'
	| 'deepgram-nova'
	| 'assemblyai-utterances';

export type OutputFormat = 'srt' | 'vtt' | 'txt' | 'csv';

export interface WordTiming {
	word: string;
	startSec: number;
	endSec: number;
	speaker?: string;
}

export interface RawSegment {
	startSec: number;
	endSec: number;
	text: string;
	speaker?: string;
	words?: WordTiming[];
}

export type ParseResult =
	| {
			ok: true;
			dialect: DialectId;
			dialectLabel: string;
			durationSec: number;
			wordTimingAvailable: boolean;
			speakerLabels: string[];
			segments: RawSegment[];
	  }
	| {
			ok: false;
			error: string;
	  };

export interface CueFormatOptions {
	format: OutputFormat;
	maxCharsPerLine: number;
	maxLinesPerCue: 1 | 2;
	maxCueDurationSec: number;
	pauseSplitGapSec: number;
	offsetMs: number;
	includeSpeakerPrefix: boolean;
}

export interface SubtitleCue {
	index: number;
	startSec: number;
	endSec: number;
	speaker?: string;
	lines: string[];
}

export interface RouteFaqItem {
	question: string;
	answer: string;
}

export interface ToolRoutePreset {
	slug: string;
	path: string;
	navLabel: string;
	h1: string;
	seoTitle: string;
	metaDescription: string;
	primaryKeyword: string;
	heroSummary: string;
	defaultSampleId: DialectId;
	defaultOptions: CueFormatOptions;
	schemaNotes: string[];
	faqs: RouteFaqItem[];
}
