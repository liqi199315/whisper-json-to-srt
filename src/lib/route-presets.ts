import type { ToolRoutePreset } from './types';
import { LONG_TAIL_PRESETS, LONG_TAIL_WORKFLOW_CARDS } from './long-tail-presets';

export interface WorkflowLinkCard {
	slug: string;
	path: string;
	badge: string;
	anchorText: string;
	presetConfig: string;
	summary: string;
}

export interface HowItWorksStep {
	step: string;
	title: string;
	detail: string;
}

export interface FormatFieldCard {
	id: string;
	title: string;
	tag: string;
	timingUnit: string;
	keyPaths: string[];
	behaviorNote: string;
}

export const ROUTE_PRESETS: ToolRoutePreset[] = [
	{
		slug: '',
		path: '/',
		navLabel: 'JSON to SRT',
		h1: 'Whisper JSON to SRT Converter',
		seoTitle: 'Whisper JSON to SRT Converter | Local Browser Subtitle Tool',
		metaDescription:
			'Convert OpenAI Whisper, WhisperX, whisper.cpp, Deepgram, and AssemblyAI JSON transcripts to SRT, VTT, TXT, or CSV in your browser with zero file uploads.',
		primaryKeyword: 'whisper json to srt converter',
		heroSummary:
			'Paste or drop any ASR JSON transcript to generate broadcast-safe SRT, WebVTT, plain text, or CSV cues right in your browser tab. Auto-detects Whisper-family JSON, Deepgram, AssemblyAI, OpenAI diarized_json, and plain CapCut drafts with word-boundary line wrapping, live CPS checks, and no 2 MB cloud upload cap.',
		defaultSampleId: 'openai-verbose-json',
		defaultOptions: {
			format: 'srt',
			maxCharsPerLine: 42,
			maxLinesPerCue: 2,
			maxCueDurationSec: 6,
			pauseSplitGapSec: 0.6,
			offsetMs: 0,
			includeSpeakerPrefix: false,
		},
		schemaNotes: [
			'Auto-detects JSON layouts by inspecting top-level keys: segments[] and words[] for OpenAI Whisper and faster-whisper, diarized_json segments with seg_ ids, speaker-annotated segments[] for WhisperX, transcription[] offsets for whisper.cpp, Deepgram channels or utterances, AssemblyAI millisecond utterances, and plain CapCut materials.texts plus tracks.',
			'Formats SubRip cues using sequential 1-based indices, comma-separated HH:MM:SS,mmm timestamps, and blank-line separators compatible with Premiere Pro, DaVinci Resolve, Final Cut Pro, CapCut, and FFmpeg.',
			'Wraps long transcript segments greedily on word boundaries up to 42 characters per line and 2 lines per cue, splitting cues earlier when speech pauses exceed 0.6 seconds or cue duration reaches 6 seconds.',
			'Reads uploaded .json files directly through the browser File.text() API so multi-megabyte hour-long podcast and lecture transcripts convert in milliseconds without leaving your device.',
		],
		faqs: [
			{
				question: 'Which Whisper and ASR JSON dialects does this converter accept?',
				answer:
					'The parser accepts OpenAI Whisper verbose_json, faster-whisper segment JSON, OpenAI diarized_json, WhisperX speaker JSON, whisper.cpp -oj and -ojf files, Deepgram word or utterance responses, AssemblyAI transcripts, and plain-text CapCut or Jianying drafts. Encrypted CapCut 6.0+ project files are refused.',
			},
			{
				question: 'Are my transcript JSON files uploaded to an external server?',
				answer:
					'No. Every parse, cue wrap, reading-speed calculation, timestamp offset, and Blob file download executes inside your local browser JavaScript runtime. Zero transcript bytes are sent over the network.',
			},
			{
				question: 'Can I convert Whisper JSON files larger than 2 MB or 5 MB?',
				answer:
					'Yes. Cloud subtitle sites often reject JSON files above 2 MB unless you buy a subscription. Because this workbench parses files locally in browser memory, multi-megabyte JSON transcripts from multi-hour recordings convert immediately at zero cost.',
			},
			{
				question: 'How does timestamp offset adjustment handle negative shifts at the start of a video?',
				answer:
					'Positive or negative millisecond offsets shift every cue start and end timestamp uniformly, while clamping any resulting negative timestamp at 00:00:00,000 so video editors and media players never reject the generated subtitle track.',
			},
		],
		guides: [
			{
				id: 'pipeline-overview',
				kicker: 'Production ASR Pipeline',
				heading: 'From raw speech audio to broadcast-ready subtitle cues',
				paragraphs: [
					'Running speech-to-text models like OpenAI Whisper, faster-whisper, or Deepgram is only the first half of subtitle generation. Speech recognition decoders prioritize acoustic probabilities across 30-second audio windows, often yielding single continuous segments that stretch over 80 characters without respect for video frame boundaries or viewer reading speeds.',
					'Saving your transcription as rich JSON rather than flat SRT preserves precise word timestamps, speaker labels, and acoustic confidence scores. This converter runs locally in your browser to reflow those timed word tokens into balanced, readable subtitle cues conforming to international broadcast specifications.',
				],
				code: {
					label: 'run_whisper_export_json.py',
					source: `import json
import whisper

model = whisper.load_model("base")
result = model.transcribe(
    "podcast_episode.mp3",
    word_timestamps=True,
    verbose=False,
)

# Preserve the full JSON payload with word timestamps
with open("transcript_raw.json", "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print("Transcription saved. Drop transcript_raw.json into the converter above.")
`,
				},
			},
			{
				id: 'reading-speed-rules',
				kicker: 'Visual Timing Standards',
				heading: 'Balancing line width, pause splits, and characters per second',
				paragraphs: [
					'Professional subtitling requires adhering to two fundamental visual constraints: maximum line width (CPL) and reading speed (CPS). Standard broadcast delivery (EBU and Netflix) mandates a maximum of 37 to 42 characters per line and no more than two lines per cue, ensuring text never covers critical visual elements.',
					'Equally vital is reading speed management. Adult viewers comfortably process between 15 and 20 characters per second. When speech accelerates beyond 22 CPS, subtitle reading degrades into a stressful chore. This tool evaluates CPS live for every cue, flagging congested lines before export.',
				],
				bullets: [
					'Natural pause splitting: When speakers pause for more than 0.6 seconds, cues split automatically to maintain natural cadence.',
					'Zero server upload: Every file operation happens in browser memory using File.text() and Blob URLs, protecting client confidentiality.',
					'Universal format compatibility: Export SubRip (.srt), WebVTT (.vtt), plain text (.txt), or CSV (.csv) with millisecond accuracy.',
				],
				links: [
					{
						href: '/whisper-verbose-json-to-srt/',
						label: 'OpenAI Whisper verbose_json preset',
					},
					{
						href: '/short-video-caption-splitter/',
						label: 'Vertical video 16-character caption preset',
					},
				],
			},
		],
	},
	{
		slug: 'whisper-verbose-json-to-srt',
		path: '/whisper-verbose-json-to-srt/',
		navLabel: 'verbose_json to SRT',
		h1: 'Whisper verbose_json to SRT Converter',
		seoTitle: 'Whisper verbose_json to SRT | OpenAI Audio API Subtitle Tool',
		metaDescription:
			'Turn OpenAI Audio API verbose_json responses with word or segment timestamps into 42-character SRT subtitles locally in your browser with no file cap.',
		primaryKeyword: 'whisper verbose_json to srt',
		heroSummary:
			'Built specifically for OpenAI /v1/audio/transcriptions payloads captured with response_format set to verbose_json. Uses word-level floating-point timestamps when available and falls back to proportional segment splitting when only segments[] is present.',
		defaultSampleId: 'openai-verbose-json',
		defaultOptions: {
			format: 'srt',
			maxCharsPerLine: 42,
			maxLinesPerCue: 2,
			maxCueDurationSec: 6,
			pauseSplitGapSec: 0.6,
			offsetMs: 0,
			includeSpeakerPrefix: false,
		},
		schemaNotes: [
			'OpenAI Audio API verbose_json payloads store floating-point seconds inside top-level words[] when timestamp_granularities includes "word", alongside utterance-level blocks in segments[].start, segments[].end, and segments[].text.',
			'Local Python whisper CLI and faster-whisper JSON dumps frequently nest words[] inside each entry of segments[] with leading whitespace attached to each token such as " world". The parser normalizes both top-level and nested word arrays automatically.',
			'When an API call omits word granularity and only returns segments[], long 15-second Whisper segments are divided across word boundaries with timestamps interpolated proportionally by character length so cues stay readable.',
			'Metadata keys returned by OpenAI such as task, language, duration, avg_logprob, compression_ratio, and no_speech_prob are tolerated without schema errors.',
		],
		faqs: [
			{
				question: 'Why save OpenAI Whisper output as verbose_json instead of requesting response_format="srt" directly?',
				answer:
					'Requesting response_format="srt" from the OpenAI API locks you into fixed long segment blocks with no word timestamps, no custom line-length control, and no raw transcript metadata. Saving verbose_json once lets you regenerate 42-character desktop SRT, 16-character mobile SRT, VTT, TXT, and CSV anytime without paying to re-transcribe audio.',
			},
			{
				question: 'Does OpenAI verbose_json include word-level timestamps by default?',
				answer:
					'Only when your transcription request passes response_format="verbose_json" together with timestamp_granularities=["word", "segment"]. If your saved JSON only has segments[], this converter still builds compliant SRT cues by splitting segment text and interpolating cue times.',
			},
			{
				question: 'How are Whisper leading spaces and punctuation tokens cleaned up?',
				answer:
					'Whisper tokenizers prefix most English words with a leading space and sometimes emit standalone punctuation entries. The cue builder trims leading line spaces and merges detached punctuation onto the preceding word before counting characters per line.',
			},
		],
		guides: [
			{
				id: 'api-verbose-json-capture',
				kicker: 'OpenAI API Integration',
				heading: 'Requesting verbose_json with word-level timestamps',
				paragraphs: [
					'The OpenAI /v1/audio/transcriptions endpoint defaults to returning a simple JSON object containing only a single text string. To obtain timestamped subtitle data, you must explicitly specify response_format="verbose_json" and pass timestamp_granularities=["word", "segment"].',
					'With word-level granularity enabled, OpenAI returns both coarse segment ranges and precise floating-point start and end times for every spoken word token. Storing this verbose_json payload lets you rebuild subtitles with custom line lengths whenever required without re-calling the paid API.',
				],
				code: {
					label: 'openai_transcribe_verbose.py',
					source: `from openai import OpenAI
import json

client = OpenAI()

with open("interview.mp3", "rb") as audio_file:
    transcript = client.audio.transcriptions.create(
        model="whisper-1",
        file=audio_file,
        response_format="verbose_json",
        timestamp_granularities=["word", "segment"],
    )

with open("interview_verbose.json", "w", encoding="utf-8") as out:
    out.write(transcript.model_dump_json(indent=2))
`,
				},
			},
			{
				id: 'word-vs-segment-timings',
				kicker: 'Timing Resolution',
				heading: 'Why word-level tokens produce cleaner subtitle transitions',
				paragraphs: [
					'When using segment-only JSON, subtitle boundaries are locked to Whisper decoder chunk boundaries. A single segment might span 12 seconds with three sentences, resulting in unwieldy paragraphs that clutter the lower third of the video screen.',
					'Our client-side parser leverages the nested words array to group tokens into balanced 42-character lines. When speech pauses exceed 0.6 seconds, the parser generates a fresh cue immediately, ensuring subtitles mirror natural vocal phrasing.',
				],
				bullets: [
					'Proportional fallback: If word timestamps are missing, segments are partitioned proportionally by character count.',
					'Leading space normalization: Word tokens beginning with spaces (e.g., " hello") are trimmed for accurate character counts.',
					'Clean punctuation binding: Standalone punctuation tokens merge onto preceding words rather than forming orphaned cues.',
				],
				links: [
					{
						href: '/faster-whisper-srt/',
						label: 'faster-whisper JSON guide and export',
					},
					{
						href: '/whisper-json-to-vtt/',
						label: 'Export HTML5 WebVTT (.vtt) format',
					},
				],
			},
		],
	},
	{
		slug: 'whisper-json-to-vtt',
		path: '/whisper-json-to-vtt/',
		navLabel: 'Whisper JSON to VTT',
		h1: 'OpenAI Whisper JSON to WebVTT Converter',
		seoTitle: 'OpenAI Whisper JSON to VTT | HTML5 WebVTT Subtitle Export',
		metaDescription:
			'Export OpenAI Whisper JSON transcripts to W3C WebVTT subtitle files with dot-millisecond timestamps for HTML5 video tracks directly in your browser.',
		primaryKeyword: 'openai whisper json to vtt',
		heroSummary:
			'Convert Whisper JSON transcripts directly into standards-compliant .vtt caption tracks for HTML5 <video>, Plyr, Video.js, HLS.js, and Cloudflare Stream without server round-trips.',
		defaultSampleId: 'openai-verbose-json',
		defaultOptions: {
			format: 'vtt',
			maxCharsPerLine: 42,
			maxLinesPerCue: 2,
			maxCueDurationSec: 6,
			pauseSplitGapSec: 0.6,
			offsetMs: 0,
			includeSpeakerPrefix: false,
		},
		schemaNotes: [
			'Prepends the mandatory UTF-8 WEBVTT file header followed by a blank line as required by the W3C WebVTT specification and browser <track kind="captions"> parsers.',
			'Formats cue timings with a period before milliseconds (HH:MM:SS.mmm --> HH:MM:SS.mmm) rather than SubRip commas, preventing silent caption load failures in Safari, Chrome, and Firefox.',
			'Outputs clean cue timing blocks ready for browser <track> elements, HLS playlists, and web player caption menus.',
			'Supports optional speaker prefixes and millisecond sync offsets when embedding diarized or trimmed video clips on the web.',
		],
		faqs: [
			{
				question: 'What is the exact syntax difference between SRT and WebVTT output from Whisper JSON?',
				answer:
					'WebVTT starts with a mandatory WEBVTT header line and separates seconds from milliseconds with a dot (00:00:01.250 --> 00:00:03.800), whereas SRT has no header line and separates milliseconds with a comma (00:00:01,250 --> 00:00:03,800). HTML5 <track> elements reject comma-formatted timestamps.',
			},
			{
				question: 'How do I attach the downloaded .vtt file to an HTML5 video element?',
				answer:
					'Place a <track kind="captions" src="/captions.vtt" srclang="en" label="English" default> element inside your <video> tag and ensure your static host serves .vtt files with the text/vtt MIME type and CORS headers if hosted on another origin.',
			},
			{
				question: 'Can I also convert WhisperX or Deepgram JSON to WebVTT on this page?',
				answer:
					'Yes. Although this preset defaults to WebVTT output with an OpenAI Whisper sample, the input box and file uploader accept every supported JSON dialect, including diarized_json and plain CapCut drafts, and export any of them as .vtt.',
			},
		],
		guides: [
			{
				id: 'vtt-syntax-standards',
				kicker: 'W3C WebVTT Specification',
				heading: 'Key formatting differences between SubRip (.srt) and WebVTT (.vtt)',
				paragraphs: [
					'WebVTT (Web Video Text Tracks) is the official W3C standard for HTML5 video captioning. While SubRip (.srt) uses sequential numeric cue identifiers and comma millisecond separators (00:01:23,456), WebVTT strictly requires a leading WEBVTT header and period millisecond separators (00:01:23.456).',
					'Attempting to load a comma-separated SRT file inside an HTML5 <track> tag in modern browsers causes silent parsing failures. Converting Whisper JSON directly to WebVTT guarantees full compatibility across Chrome, Safari, Firefox, and mobile WebKit.',
				],
				code: {
					label: 'html5_video_with_vtt.html',
					source: `<video controls width="1080" height="720" poster="/poster.jpg">
  <source src="/media/video.mp4" type="video/mp4" />
  <track
    kind="captions"
    src="/subtitles/captions.vtt"
    srclang="en"
    label="English Captions"
    default
  />
</video>
`,
				},
			},
			{
				id: 'streaming-vtt-integration',
				kicker: 'HLS and Cloud Video Delivery',
				heading: 'Using WebVTT with HLS m3u8 playlists and web players',
				paragraphs: [
					'Modern streaming platforms like Video.js, Plyr, and HLS.js rely on WebVTT for adaptive bitrate video captions. WebVTT subtitle segments can be referenced directly within master .m3u8 playlists under the EXT-X-MEDIA SUBTITLES tag.',
					'Because our converter outputs clean UTF-8 text with period-delimited timestamps and blank-line cue separators, the exported .vtt files require zero manual reformatting before deployment to CDNs or Cloudflare Stream buckets.',
				],
				bullets: [
					'MIME type requirement: Ensure web servers serve .vtt files with text/vtt and UTF-8 charset headers.',
					'Cross-origin access: Add Access-Control-Allow-Origin: * headers when caption tracks are hosted on external CDNs.',
					'Cue settings support: Position and alignment tags can be customized in modern CSS using the ::cue pseudo-element.',
				],
				links: [
					{
						href: '/',
						label: 'Standard SubRip (.srt) master converter',
					},
					{
						href: '/about/',
						label: 'Architecture and browser-local privacy guarantee',
					},
				],
			},
		],
	},
	{
		slug: 'whisperx-diarized-json-to-srt',
		path: '/whisperx-diarized-json-to-srt/',
		navLabel: 'WhisperX Diarized',
		h1: 'WhisperX JSON to SRT with Speaker Labels',
		seoTitle: 'WhisperX JSON to SRT Speaker Labels | Diarized Subtitle Tool',
		metaDescription:
			'Convert WhisperX diarized JSON transcripts and pyannote speaker IDs into speaker-prefixed SRT or VTT subtitles in your browser without uploading files.',
		primaryKeyword: 'whisperx json to srt speaker labels',
		heroSummary:
			'Turn WhisperX + pyannote.audio diarization JSON into speaker-labeled subtitles. Preserves SPEAKER_00 and custom speaker names while splitting cues cleanly whenever the active speaker changes.',
		defaultSampleId: 'whisperx-diarized',
		defaultOptions: {
			format: 'srt',
			maxCharsPerLine: 42,
			maxLinesPerCue: 2,
			maxCueDurationSec: 6,
			pauseSplitGapSec: 0.6,
			offsetMs: 0,
			includeSpeakerPrefix: true,
		},
		schemaNotes: [
			'Reads segment-level speaker strings (segments[].speaker) and word-level speaker assignments (segments[].words[].speaker) produced by WhisperX wav2vec2 forced alignment and pyannote diarization.',
			'Handles WhisperX unaligned tokens such as numerals, currency symbols, and punctuation marks where word objects omit start and end floats by inheriting neighbor boundaries safely.',
			'Starts a fresh subtitle cue whenever the speaker label changes between words so two voices never collide inside one unlabeled caption block.',
			'Prepends [SPEAKER_XX] to cue turns when speaker prefixes are enabled, and accounts for prefix length during line wrapping so captions stay clean on screen.',
		],
		faqs: [
			{
				question: 'Why are some words in WhisperX JSON missing start and end timestamps?',
				answer:
					'WhisperX computes word timings through phoneme-level wav2vec2 alignment. Digits like "2026" or symbols like "%" have no direct acoustic phoneme match in basic models, so WhisperX leaves start and end undefined on those word entries. Our parser interpolates timestamps from adjacent aligned words instead of crashing or dropping numbers.',
			},
			{
				question: 'Can I rename SPEAKER_00 and SPEAKER_01 to real guest names before downloading SRT?',
				answer:
					'Yes. Run a quick string replace on "SPEAKER_00" in your JSON or edit the text directly inside the JSON input pane, and the live preview updates every speaker prefix across all cues immediately.',
			},
			{
				question: 'What happens if I uncheck the speaker prefix toggle on a WhisperX file?',
				answer:
					'Unchecking Include speaker prefix hides the [SPEAKER_00] label from the exported SRT or VTT lines while still respecting speaker turn boundaries during cue segmentation.',
			},
		],
		guides: [
			{
				id: 'whisperx-generation-workflow',
				kicker: 'Multi-Speaker Diarization',
				heading: 'Running WhisperX and pyannote to generate speaker-labeled JSON',
				paragraphs: [
					'WhisperX combines OpenAI Whisper speech recognition with wav2vec2 forced phoneme alignment and pyannote.audio speaker diarization. This three-stage pipeline produces word-level timestamps alongside speaker cluster IDs (such as SPEAKER_00 and SPEAKER_01).',
					'Standard subtitle exporters struggle with diarized data because speaker turns often switch mid-sentence or within short pauses. This tool reads the speaker property on both segment and word levels, splitting cues on speaker transitions to prevent multi-speaker overlap.',
				],
				code: {
					label: 'run_whisperx_diarize.sh',
					source: `# Run WhisperX transcription with wav2vec2 alignment and pyannote diarization
whisperx interview.wav \\
  --model large-v2 \\
  --align_model WAV2VEC2_ASR_LARGE_LV60K_960H \\
  --diarize \\
  --hf_token "hf_YourHuggingFaceTokenHere" \\
  --output_format json \\
  --output_dir ./transcripts

# Load the resulting interview.json into the converter above
`,
				},
			},
			{
				id: 'handling-unaligned-tokens',
				kicker: 'Robust Token Parsing',
				heading: 'Interpolating timestamps for numbers, symbols, and fast turns',
				paragraphs: [
					'In raw WhisperX output, acoustic phoneme aligners occasionally fail on non-phonetic tokens like numbers ("2026"), acronyms ("NASA"), or currency signs ("$50"). In these edge cases, WhisperX leaves the start and end properties undefined.',
					'Our parser safely detects unaligned tokens and interpolates their timing from neighboring words. This prevents cue corruption and ensures speaker labels like [SPEAKER_00] are cleanly formatted at the beginning of each dialogue block.',
				],
				bullets: [
					'Custom speaker naming: Edit SPEAKER_00 directly in the JSON pane to update all cue prefixes in real time.',
					'Clean turn boundaries: A new cue starts immediately whenever a different speaker begins talking.',
					'Toggleable speaker tags: Uncheck Include speaker prefix to preserve turn splitting without printing labels in the video.',
				],
				links: [
					{
						href: '/gpt-4o-transcribe-diarize-srt/',
						label: 'OpenAI diarized_json converter preset',
					},
					{
						href: '/deepgram-json-to-srt/',
						label: 'Deepgram Nova multi-speaker utterances preset',
					},
				],
			},
		],
	},
	{
		slug: 'whisper-cpp-json-to-srt',
		path: '/whisper-cpp-json-to-srt/',
		navLabel: 'whisper.cpp JSON',
		h1: 'whisper.cpp JSON to SRT Online Converter',
		seoTitle: 'whisper.cpp JSON to SRT Online | Local Offset & Token Tool',
		metaDescription:
			'Parse whisper.cpp JSON transcription arrays with millisecond offsets and token timestamps into clean SRT subtitles locally in any modern browser tab.',
		primaryKeyword: 'whisper.cpp json to srt online',
		heroSummary:
			'Convert local whisper.cpp CLI JSON files (-oj and -ojf) into formatted SRT or WebVTT subtitles. Parses integer millisecond offsets, timestamp strings, and segment timings locally with zero cloud uploads.',
		defaultSampleId: 'whisper-cpp',
		defaultOptions: {
			format: 'srt',
			maxCharsPerLine: 42,
			maxLinesPerCue: 2,
			maxCueDurationSec: 6,
			pauseSplitGapSec: 0.5,
			offsetMs: 0,
			includeSpeakerPrefix: false,
		},
		schemaNotes: [
			'Recognizes whisper.cpp root objects containing transcription[] items where timings sit in offsets.from and offsets.to (integer milliseconds) alongside timestamps.from and timestamps.to ("HH:MM:SS,mmm").',
			'Prioritizes integer millisecond offsets for drift-free timestamp math and falls back to parsing formatted timestamp strings when offsets are absent.',
			'Splits long whisper.cpp decoder blocks across clean word boundaries with proportional cue durations so lines fit inside 42-character or 16-character safe zones.',
			'Works offline once loaded, matching the local-first privacy workflow of users running quantized GGML and GGUF Whisper models on Apple Silicon or desktop GPUs.',
		],
		faqs: [
			{
				question: 'Which whisper.cpp CLI flags produce JSON compatible with this tool?',
				answer:
					'Both -oj (--output-json) and -ojf (--output-json-full) work out of the box. Drop the generated .json file straight into the browser dropzone to rewrap long segments into clean SRT or WebVTT cues.',
			},
			{
				question: 'Does the parser read whisper.cpp offsets or formatted timestamp strings?',
				answer:
					'It prioritizes numeric millisecond integers in offsets.from and offsets.to for exact arithmetic precision, and falls back to parsing timestamps.from and timestamps.to strings if offsets are absent.',
			},
			{
				question: 'Why convert whisper.cpp JSON instead of using whisper.cpp -osrt directly?',
				answer:
					'The built-in -osrt flag in whisper.cpp dumps fixed decoder segments that frequently span 80 to 120 characters on a single line unless you re-run inference with --max-len and --split-on-word. Converting the saved JSON lets you tune line width, line count, and sync offsets in real time without re-running model inference.',
			},
		],
		guides: [
			{
				id: 'whisper-cpp-cli-usage',
				kicker: 'Local Offline Inference',
				heading: 'Extracting millisecond JSON transcripts with whisper.cpp',
				paragraphs: [
					'whisper.cpp provides high-performance, lightweight Whisper inference optimized for Apple Silicon (Metal), Linux, and Windows via GGML and GGUF quantization. Running local inference keeps sensitive interviews and voice notes entirely on your machine.',
					'By passing the -oj (--output-json) or -ojf (--output-json-full) command-line flags, whisper.cpp generates a structured JSON file containing transcription offset ranges and token-level timing data.',
				],
				code: {
					label: 'run_whisper_cpp.sh',
					source: `# Transcribe audio using quantized ggml model on Apple Silicon or CPU
./main \\
  -m models/ggml-medium.bin \\
  -f meeting_recording.wav \\
  -ojf \\
  -of meeting_transcript

# Converts meeting_transcript.json to broadcast SRT with no network uploads
`,
				},
			},
			{
				id: 'offsets-precision-advantage',
				kicker: 'Integer Timing Precision',
				heading: 'Why integer millisecond offsets prevent cumulative timestamp drift',
				paragraphs: [
					'whisper.cpp JSON output provides timings in two formats: formatted timestamp strings ("00:01:23,450") and integer millisecond counters (offsets.from = 83450). Converting floating-point seconds across hours of audio can introduce subtle rounding drift.',
					'Our engine prioritizes whisper.cpp integer millisecond offsets for exact arithmetic calculation, splitting long decoder blocks at natural word boundaries while preserving perfect synchronization with video footage.',
				],
				bullets: [
					'Complete offline privacy: Works without an internet connection once loaded in your browser.',
					'Decoder block rewrapping: Breaks whisper.cpp segments exceeding 80 characters into standard two-line subtitle cues.',
					'Custom sync offsets: Shift entire transcripts forward or backward with millisecond granularity.',
				],
				links: [
					{
						href: '/',
						label: 'Master Whisper JSON converter',
					},
					{
						href: '/premiere-pro-srt-import/',
						label: 'Premiere Pro import troubleshooting and clean re-export',
					},
				],
			},
		],
	},
	{
		slug: 'short-video-caption-splitter',
		path: '/short-video-caption-splitter/',
		navLabel: 'Short Video Splitter',
		h1: 'Whisper SRT Max Characters Per Line Splitter',
		seoTitle: 'Whisper SRT Max Characters Per Line | Short Video Captions',
		metaDescription:
			'Split Whisper word-timestamp JSON into single-line 16-character SRT captions for vertical Reels, Shorts, and TikTok videos with exact word timing.',
		primaryKeyword: 'whisper srt max characters per line',
		heroSummary:
			'Pre-configured to 16 max characters per line and 1 line per cue so vertical 9:16 captions never clip behind TikTok, Instagram Reels, or YouTube Shorts UI overlays.',
		defaultSampleId: 'openai-verbose-json',
		defaultOptions: {
			format: 'srt',
			maxCharsPerLine: 16,
			maxLinesPerCue: 1,
			maxCueDurationSec: 2.5,
			pauseSplitGapSec: 0.35,
			offsetMs: 0,
			includeSpeakerPrefix: false,
		},
		schemaNotes: [
			'Locks default wrapping to maxCharsPerLine of 16 and maxLinesPerCue of 1, producing punchy 2-to-4-word captions tailored for large bold fonts inside 1080x1920 vertical safe zones.',
			'Uses word-level startSec and endSec timings so rapid short-form speech snaps onto screen on the exact spoken syllable rather than drifting across multi-sentence blocks.',
			'Breaks cues early on natural micro-pauses (0.35s gap threshold) and caps cue duration at 2.5 seconds to maintain brisk visual pacing.',
			'Displays the exact maximum character count and reading speed of generated cues so editors can verify safe-zone compliance before importing into CapCut, Premiere Pro, or DaVinci Resolve.',
		],
		faqs: [
			{
				question: 'Why do Whisper CLI --max_line_width and --max_line_count often fail or error out?',
				answer:
					'In Python Whisper CLI, passing --max_line_width or --max_line_count throws an error unless --word_timestamps True is also enabled, and changing your target width from 42 chars (YouTube 16:9) to 16 chars (Reels 9:16) otherwise requires re-running GPU transcription. Splitting from saved word-level JSON takes under 10 milliseconds in your browser.',
			},
			{
				question: 'What happens when a single spoken word is longer than the max characters per line setting?',
				answer:
					'Single Latin words that exceed the configured character threshold stay intact on their own single-word cue rather than hyphenating mid-word, preserving clean readability during fast playback.',
			},
			{
				question: 'What character limit works best for TikTok, Reels, and YouTube Shorts?',
				answer:
					'For large center-screen bold subtitles (65 to 85 pt on a 1080px canvas), 14 to 18 characters on 1 line keeps every word inside the central safe margin away from right-side action buttons. For standard two-line lower-third captions on horizontal 16:9 video, switch Max chars to 42 and Max lines to 2.',
			},
		],
		guides: [
			{
				id: 'mobile-safe-zone-geometry',
				kicker: '9:16 Vertical Video Safe Zones',
				heading: 'Designing single-line captions for TikTok, Instagram Reels, and Shorts',
				paragraphs: [
					'Vertical 9:16 mobile videos (1080x1920 pixels) impose strict visual layout restrictions. The bottom 20% of the screen is obscured by user account names, audio tracks, and description text, while the right margin is packed with like, comment, and share icons.',
					'Traditional horizontal subtitles (42 characters across two lines) inevitably collide with these platform UI elements. Restricting captions to 16 characters on a single line keeps every word inside the central safe zone, maximizing viewer attention and retention.',
				],
				code: {
					label: 'ffmpeg_burn_vertical_captions.sh',
					source: `# Burn 16-character single-line captions into a 1080x1920 vertical video
ffmpeg -i vertical_video.mp4 \\
  -vf "subtitles=captions_16char.srt:force_style='Alignment=2,MarginV=280,FontName=Montserrat,FontSize=28,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2'" \\
  -c:a copy \\
  output_with_captions.mp4
`,
				},
			},
			{
				id: 'dynamic-reading-pacing',
				kicker: 'Pacing and Retention',
				heading: 'Fast caption rhythm and word-level synchronization',
				paragraphs: [
					'Fast-paced social media content requires snappy, rhythmic caption delivery. When captions remain static on screen for more than 3 seconds, audience drop-off rates increase. Single-line cues displayed for 0.8 to 2.0 seconds maintain visual momentum.',
					'This tool leverages Whisper word-level timestamps to group 2 to 4 words per cue. Pauses as brief as 0.35 seconds trigger a clean break, ensuring subtitles appear in synchronization with the speaker vocal emphasis.',
				],
				bullets: [
					'Safe boundary wrapping: Words are never split mid-syllable; individual long words stay on their own single cue.',
					'Live CPS indicator: Immediately view characters-per-second metrics to avoid visually overwhelming viewers.',
					'Zero upload latency: Batch re-split hour-long podcasts into short-form clips in milliseconds locally.',
				],
				links: [
					{
						href: '/capcut-json-to-srt/',
						label: 'CapCut draft JSON to SRT converter',
					},
					{
						href: '/whisper-verbose-json-to-srt/',
						label: 'OpenAI Whisper verbose_json preset',
					},
				],
			},
		],
	},
	...LONG_TAIL_PRESETS,
];

export const WORKFLOW_LINK_CARDS: WorkflowLinkCard[] = [
	{
		slug: '',
		path: '/',
		badge: 'All ASR dialects',
		anchorText: 'Whisper & Multi-ASR JSON to SRT Master Converter',
		presetConfig: '.srt | 42 chars x 2 lines',
		summary:
			'Universal local workbench for Whisper, diarized_json, whisper.cpp, Deepgram, AssemblyAI, and plain CapCut drafts.',
	},
	{
		slug: 'whisper-verbose-json-to-srt',
		path: '/whisper-verbose-json-to-srt/',
		badge: 'OpenAI Audio API',
		anchorText: 'OpenAI Whisper verbose_json to 42-Char SRT Converter',
		presetConfig: '.srt | word + segment timings',
		summary:
			'Tuned for /v1/audio/transcriptions verbose_json responses and faster-whisper CLI exports with nested words arrays.',
	},
	{
		slug: 'whisper-json-to-vtt',
		path: '/whisper-json-to-vtt/',
		badge: 'HTML5 Video Track',
		anchorText: 'OpenAI Whisper JSON to W3C WebVTT (.vtt) Exporter',
		presetConfig: '.vtt | WEBVTT dot-ms header',
		summary:
			'Generates compliant WebVTT subtitle tracks with period-millisecond timestamps for HTML5 <video>, Video.js, and HLS.',
	},
	{
		slug: 'whisperx-diarized-json-to-srt',
		path: '/whisperx-diarized-json-to-srt/',
		badge: 'Pyannote Diarization',
		anchorText: 'WhisperX Diarized JSON to Speaker-Labeled SRT Tool',
		presetConfig: '.srt | [SPEAKER_XX] prefixes on',
		summary:
			'Preserves SPEAKER_00 tags, interpolates unaligned numeric tokens, and breaks cues cleanly on every speaker change.',
	},
	{
		slug: 'whisper-cpp-json-to-srt',
		path: '/whisper-cpp-json-to-srt/',
		badge: 'GGML / Apple Silicon',
		anchorText: 'whisper.cpp -oj and -ojf JSON to SRT Online Parser',
		presetConfig: '.srt | ms offsets[] parser',
		summary:
			'Reads local whisper.cpp transcription[] integer millisecond offsets and rewraps long decoder segments cleanly.',
	},
	{
		slug: 'short-video-caption-splitter',
		path: '/short-video-caption-splitter/',
		badge: '9:16 Vertical Safe Zone',
		anchorText: '16-Character Single-Line Short Video Caption Splitter',
		presetConfig: '.srt | 16 chars x 1 line',
		summary:
			'Splits word-level Whisper JSON into punchy single-line captions for TikTok, Instagram Reels, and YouTube Shorts.',
	},
	...LONG_TAIL_WORKFLOW_CARDS,
];

export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
	{
		step: '01',
		title: 'Paste or Drop Local ASR JSON',
		detail:
			'Drop a .json file onto the highlighted upload box, paste raw API output, or pick a built-in ASR sample. Multi-megabyte multi-hour files parse in local browser RAM with zero server upload.',
	},
	{
		step: '02',
		title: 'Select a Layout Pill & Check CPS Health',
		detail:
			'Tap a one-click mode pill (Broadcast 42c x 2, TikTok/Shorts 16c x 1, Podcast Speaker Tags, or WebVTT Player) and watch the live Cue Health Summary flag >20 CPS fast cues and line-fit compliance.',
	},
	{
		step: '03',
		title: 'Verify Timings & Download Subtitles',
		detail:
			'Inspect exact timestamps and per-cue character counts in the preview table, apply a positive or negative millisecond sync offset if needed, then copy or download .srt, .vtt, .txt, or .csv immediately.',
	},
];

export const FORMAT_FIELD_CARDS: FormatFieldCard[] = [
	{
		id: 'openai-whisper',
		title: 'OpenAI Whisper & faster-whisper',
		tag: 'verbose_json',
		timingUnit: 'Float seconds (1.62)',
		keyPaths: ['segments[].start / end / text', 'words[].word / start / end', 'segments[].words[]'],
		behaviorNote:
			'Uses exact word timings when present and falls back to proportional word-boundary splitting on segment-only payloads.',
	},
	{
		id: 'whisperx',
		title: 'WhisperX + pyannote.audio',
		tag: 'Diarized JSON',
		timingUnit: 'Float seconds (4.36)',
		keyPaths: ['segments[].speaker', 'segments[].words[].speaker', 'word_segments[]'],
		behaviorNote:
			'Splits cues on speaker turn changes and interpolates missing timestamps on unaligned digits or currency symbols.',
	},
	{
		id: 'whisper-cpp',
		title: 'whisper.cpp Local CLI',
		tag: '-oj / -ojf',
		timingUnit: 'Integer ms (4220)',
		keyPaths: ['transcription[].offsets.from / to', 'transcription[].timestamps.from / to', 'transcription[].text'],
		behaviorNote:
			'Prioritizes integer millisecond offsets for drift-free timing and falls back to HH:MM:SS,mmm string parsing.',
	},
	{
		id: 'deepgram',
		title: 'Deepgram Nova-2 & Nova-3',
		tag: 'REST / SDK JSON',
		timingUnit: 'Float seconds (5.44)',
		keyPaths: [
			'results.channels[0].alternatives[0].words[]',
			'results.utterances[].speaker',
			'words[].punctuated_word',
		],
		behaviorNote:
			'Prefers utterances when present, then punctuated_word capitalization, and maps integer speaker indices into Speaker N prefixes.',
	},
	{
		id: 'assemblyai',
		title: 'AssemblyAI Transcripts',
		tag: 'Utterances JSON',
		timingUnit: 'Integer ms (6120)',
		keyPaths: ['utterances[].start / end / speaker', 'utterances[].words[]', 'words[].text / start / end'],
		behaviorNote:
			'Auto-scales integer millisecond word and utterance timings to seconds without colliding with float Whisper schemas.',
	},
	{
		id: 'export-specs',
		title: 'SRT, WebVTT, CSV & TXT Output',
		tag: '4 Export Targets',
		timingUnit: 'Comma vs dot ms',
		keyPaths: ['SRT: HH:MM:SS,mmm', 'VTT: WEBVTT + HH:MM:SS.mmm', 'CSV: index,start,end,speaker,text'],
		behaviorNote:
			'Clamps negative sync offsets safely at 00:00:00,000 and guarantees minimum 50 ms cue duration for NLE timelines.',
	},
	{
		id: 'openai-diarized',
		title: 'OpenAI diarized_json',
		tag: 'gpt-4o-transcribe-diarize',
		timingUnit: 'Float seconds (0.42)',
		keyPaths: ['segments[].speaker', 'segments[].start / end / text', 'segments[].id = seg_0'],
		behaviorNote:
			'Labels files with seg_ ids or transcript.text.segment as diarized_json. No word array, so long lines split by character count.',
	},
	{
		id: 'capcut-draft',
		title: 'CapCut / Jianying plain draft',
		tag: 'draft_content.json',
		timingUnit: 'Microseconds (200000)',
		keyPaths: ['materials.texts[].content', 'segments[].material_id', 'target_timerange.start / duration'],
		behaviorNote:
			'Reads plain JSON drafts only. CapCut and Jianying 6.0+ files and template-based drafts are encrypted and refused.',
	},
];

export function getPresetBySlug(slug: string): ToolRoutePreset | undefined {
	const normalized = slug.replace(/^\/+|\/+$/g, '');
	return ROUTE_PRESETS.find((preset) => preset.slug === normalized);
}
