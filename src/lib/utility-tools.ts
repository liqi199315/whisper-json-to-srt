export interface UtilityToolLink {
	slug: string;
	path: string;
	navLabel: string;
	shortTag: string;
	badge: string;
	anchorText: string;
	configLabel: string;
	summary: string;
}

export const UTILITY_TOOL_LINKS: UtilityToolLink[] = [
	{
		slug: 'merge-subtitles',
		path: '/merge-subtitles/',
		navLabel: 'Merge Subtitles',
		shortTag: '2-10',
		badge: 'Bilingual / Multi-Track',
		anchorText: 'Merge Dual & Multi-Track Subtitles (Up to 10 Files)',
		configLabel: 'Stacked / Interleave / Sequential',
		summary:
			'Combine 2 to 10 local SRT or VTT files with adjustable overlap tolerance, language prefixes, and per-cue timing diff preview.',
	},
	{
		slug: 'fix-subtitle-encoding',
		path: '/fix-subtitle-encoding/',
		navLabel: 'Fix Encoding',
		shortTag: 'UTF-8',
		badge: 'Mojibake Repair',
		anchorText: 'Fix Garbled Subtitle Encoding & Mojibake to UTF-8',
		configLabel: '11 codepages | BOM & CRLF',
		summary:
			'Detect GBK, CP1251, Shift-JIS, Big5, EUC-KR, and UTF-16 locally from raw bytes with live before/after cue preview.',
	},
	{
		slug: 'srt-to-json',
		path: '/srt-to-json/',
		navLabel: 'SRT to JSON',
		shortTag: '.json',
		badge: 'Reverse Converter',
		anchorText: 'Convert SRT, VTT & ASS Subtitles Back to JSON',
		configLabel: 'Whisper / Deepgram / Generic',
		summary:
			'Parse subtitles back into Whisper verbose_json, Deepgram utterances, or generic timestamped JSON for lossless round-trips.',
	},
	{
		slug: 'ttml-to-srt',
		path: '/ttml-to-srt/',
		navLabel: 'TTML to SRT',
		shortTag: '.ttml',
		badge: 'XML / Broadcast',
		anchorText: 'TTML & DFXP XML to SRT / VTT Converter',
		configLabel: 'TTML / SBV / LRC / ASS',
		summary:
			'Convert Netflix and broadcast TTML/DFXP XML captions plus SBV, LRC, and ASS tracks into clean SRT or WebVTT with QC.',
	},
	{
		slug: 'smi-to-srt',
		path: '/smi-to-srt/',
		navLabel: 'SAMI to SRT',
		shortTag: '.smi',
		badge: 'Legacy Caption',
		anchorText: 'SAMI (.smi) to SRT / VTT Subtitle Converter',
		configLabel: 'SAMI SYNC / SBV / LRC / ASS',
		summary:
			'Convert legacy SAMI SYNC blocks and HTML entities into UTF-8 SRT or VTT with line wrapping, offset shift, and Timeline QC.',
	},
];
