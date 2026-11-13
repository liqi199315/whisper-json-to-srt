import type { ToolRoutePreset } from './types';
import type { WorkflowLinkCard } from './route-presets';

export const LONG_TAIL_PRESETS: ToolRoutePreset[] = [
	{
		slug: 'faster-whisper-srt',
		path: '/faster-whisper-srt/',
		navLabel: 'faster-whisper',
		h1: 'faster-whisper JSON to SRT',
		seoTitle: 'faster-whisper SRT | segments and words JSON to Subtitles',
		metaDescription:
			'Write faster-whisper segments and word timestamps to JSON, then export SRT with line breaks and CPS checks locally in your browser.',
		primaryKeyword: 'faster whisper srt',
		heroSummary:
			'faster-whisper returns timed Segment objects, not a subtitle file. Save segments and words to JSON with the snippet on this page, then drop that file here to reflow line length, check reading speed, and download SRT, VTT, TXT, or CSV.',
		defaultSampleId: 'faster-whisper-json',
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
			'A faster-whisper Segment uses float-second start and end, a text string, and an optional words list. Each word has word, start, end, and probability. The word string often begins with a space.',
			'That shape matches OpenAI verbose_json, so this page does not add a separate parser. The status line reports OpenAI Whisper verbose_json. probability is kept in the file and ignored for cue timing.',
			'Leading spaces on word tokens are trimmed before character counts, so a token such as " timings," does not add a gap at the start of a line.',
			'The loaded sample is original. It includes a pause between "timings," and "not" under the 0.6 second split gap, so those words stay in one cue unless you lower the pause threshold.',
		],
		guides: [
			{
				id: 'dump-json',
				kicker: 'Python snippet',
				heading: 'Write faster-whisper segments and words to JSON',
				paragraphs: [
					'The Python API yields a generator of segments. Iterate it once and store start, end, text, and word timings. Drop the saved file into the converter above. You can change 42-character broadcast lines or 16-character vertical lines without transcribing the audio again.',
					'Install the library with pip install faster-whisper. The snippet uses the small model on CPU so it runs without a GPU. Swap the model name and device when you already have a local CTranslate2 model.',
				],
				code: {
					label: 'save_faster_whisper_json.py',
					source: `import json
from faster_whisper import WhisperModel

model = WhisperModel("small", device="cpu", compute_type="int8")
segments, info = model.transcribe("audio.mp3", word_timestamps=True)

payload = {
    "language": info.language,
    "duration": info.duration,
    "segments": [],
}

for segment in segments:
    words = []
    for word in segment.words or []:
        words.append(
            {
                "word": word.word,
                "start": round(word.start, 3),
                "end": round(word.end, 3),
                "probability": round(word.probability, 3),
            }
        )
    payload["segments"].append(
        {
            "id": segment.id,
            "start": round(segment.start, 3),
            "end": round(segment.end, 3),
            "text": segment.text,
            "words": words,
        }
    )

with open("faster-whisper.json", "w", encoding="utf-8") as handle:
    json.dump(payload, handle, ensure_ascii=False, indent=2)
`,
				},
			},
			{
				id: 'why-json',
				kicker: 'Why not write SRT in the loop',
				heading: 'Keep word timings if you still need to edit line breaks',
				paragraphs: [
					'A short loop can write SRT directly from segment.start, segment.end, and segment.text. That file is one cue per decoder segment. Long segments often run past 80 characters, and you cannot retarget them to a 16-character vertical safe zone without transcribing again.',
					'The JSON file is the editable source. This page splits on word boundaries, pause gaps, and the cue duration limit, then shows characters per second before you copy or download.',
				],
				bullets: [
					'word_timestamps=True is required if you want words[] in the JSON. Segment-only JSON still converts, with timings spread by character length.',
					'Community wrappers that add an SRT flag are optional. The segments object from WhisperModel.transcribe is the stable input.',
					'OpenAI verbose_json from the hosted API uses the same segments and words fields. Use the verbose_json preset when the file came from that API instead of faster-whisper.',
				],
				links: [
					{
						href: '/whisper-verbose-json-to-srt/',
						label: 'OpenAI verbose_json preset',
					},
					{
						href: '/short-video-caption-splitter/',
						label: '16-character vertical caption preset',
					},
				],
			},
		],
		faqs: [
			{
				question: 'Does faster-whisper write an SRT file by itself?',
				answer:
					'WhisperModel.transcribe returns segments. It does not write SubRip. Some command-line wrappers add an output format flag. Saving segments and words as JSON lets you rebuild SRT, VTT, TXT, or CSV with different line widths from the same transcription.',
			},
			{
				question: 'Why does the status line say OpenAI Whisper verbose_json?',
				answer:
					'faster-whisper uses the same segments array and nested words as Whisper verbose_json: float-second start and end, text, and word strings. The existing parser already accepts that shape, including probability on each word and leading spaces. No second parser is required.',
			},
			{
				question: 'Can I still export WebVTT or a 16-character vertical SRT?',
				answer:
					'Yes. Change Output Format to WebVTT, or use the TikTok/Shorts pill for 16 characters on one line. Both run locally on the JSON already in the input box.',
			},
		],
	},
	{
		slug: 'premiere-pro-srt-import',
		path: '/premiere-pro-srt-import/',
		navLabel: 'Premiere SRT',
		h1: 'Fix Premiere Pro SRT Import Generic Error',
		seoTitle: 'Premiere Pro SRT Import Generic Error | Clean UTF-8 Subtitles',
		metaDescription:
			'Re-export a Premiere-safe SRT from transcript JSON: UTF-8 without BOM, comma milliseconds, and one blank line between cues.',
		primaryKeyword: 'premiere pro srt import generic error',
		heroSummary:
			'Premiere Pro shows "The importer reported a generic error" when an SRT is not a strict SubRip file. Start from the original transcript JSON on this page and download a clean SRT instead of patching the rejected file by hand.',
		defaultSampleId: 'premiere-source-json',
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
			'The sample is Whisper-style JSON with float-second words. The download is rebuilt from those timings. This page does not parse or repair an existing .srt file.',
			'SRT cues use a 1-based index, HH:MM:SS,mmm timestamps with a comma before milliseconds, LF line endings, and exactly one blank line between cues.',
			'The file is UTF-8 without a byte-order mark. The sample keeps the accented name José so you can confirm the character survives in the output box.',
			'A dot before milliseconds (00:00:01.250), a short stamp such as 5.0, a leading BOM, or two blank lines between cues are common reasons Premiere rejects a file that still plays in VLC.',
		],
		guides: [
			{
				id: 'rejected-shape',
				kicker: 'What Premiere rejects',
				heading: 'The generic importer error is a parse failure',
				paragraphs: [
					'Adobe community reports of "The importer reported a generic error" line up with a strict SubRip read. Premiere has rejected files whose timestamps use a dot, whose milliseconds are a single digit, or whose line endings came from a Mac editor that saved CR only. A UTF-8 BOM before cue 1 can also make the first index unreadable.',
					'The block below is the shape to avoid. The output box on this page is the replacement, generated from the JSON sample.',
				],
				code: {
					label: 'Rejected by Premiere (dot milliseconds)',
					source: `1
00:00:00.360 --> 00:00:04.420
José checked the SRT after Premiere reported a generic import error.

2
00:00:05.080 --> 00:00:09.200
Comma milliseconds and no byte-order mark let the caption track load.
`,
				},
			},
			{
				id: 'clean-export',
				kicker: 'What this download writes',
				heading: 'Rebuild the SRT from JSON instead of resaving the broken file',
				paragraphs: [
					'Paste or drop the transcript JSON, then use Copy or Download. The browser Blob is the subtitle string with a UTF-8 charset and no BOM prefix. Unit tests lock three rules: the string does not start with U+FEFF, every timestamp uses a comma before three millisecond digits, and cues are separated by a single blank line with LF endings.',
					'If you only have the rejected SRT and not the JSON, this converter cannot recover timings from caption text. Re-save that SRT as UTF-8 without BOM, Unix LF, and comma milliseconds in a text editor, or transcribe again and export from JSON here.',
				],
				bullets: [
					'Index line, timestamp line, one or two text lines, then one empty line before the next index.',
					'Hours, minutes, and seconds are always two digits. Milliseconds are always three digits after a comma.',
					'Negative sync offsets clamp at 00:00:00,000 so the first cue never starts before zero.',
				],
				links: [
					{ href: '/', label: 'Main JSON to SRT converter' },
					{
						href: '/whisper-json-to-vtt/',
						label: 'WebVTT export when the player is HTML5, not Premiere',
					},
				],
			},
		],
		faqs: [
			{
				question: 'Why does VLC play my SRT when Premiere will not import it?',
				answer:
					'VLC accepts looser timestamps, including a dot before milliseconds. Premiere looks for HH:MM:SS,mmm, one blank line between cues, and text it can decode as a caption index. A file that looks fine in a player can still fail the importer.',
			},
			{
				question: 'Does the downloaded SRT include a UTF-8 BOM?',
				answer:
					'No. The subtitle string has no U+FEFF character, and the download Blob does not add the EF BB BF prefix. The sample output includes José so you can see a non-ASCII character in a BOM-free file.',
			},
			{
				question: 'Can I upload the broken SRT and have this page fix it?',
				answer:
					'No. The input is transcript JSON. The page builds a new SRT from word or segment timings. A caption-only text file has no JSON timestamps for the parser to read.',
			},
		],
	},
	{
		slug: 'capcut-json-to-srt',
		path: '/capcut-json-to-srt/',
		navLabel: 'CapCut JSON',
		h1: 'CapCut draft JSON to SRT',
		seoTitle: 'CapCut JSON to SRT | Readable draft_content.json Caption Export',
		metaDescription:
			'Export SRT from a plain-text CapCut or Jianying draft_content.json. Encrypted 6.0+ and template project files cannot be read.',
		primaryKeyword: 'capcut json to srt',
		heroSummary:
			'Read caption text and microsecond timeline ranges from a plain-text CapCut or Jianying project file and download SRT in the browser. CapCut and Jianying 6.0+ project files, and template-based drafts, are encrypted. This tool does not decrypt them.',
		defaultSampleId: 'capcut-draft',
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
			'Readable desktop drafts store captions in materials.texts[]. The content field is usually a JSON string with a text property. Older drafts use a plain string.',
			'Each caption clip lives on a track segment. material_id points at materials.texts[].id. target_timerange.start and target_timerange.duration are microseconds, divided by 1,000,000 to get seconds.',
			'Video, audio, and sticker segments are ignored unless their material_id matches a text item. A text item that is not placed on a segment is not exported. The sample includes "This title is not on a track." and that sentence must not appear in the SRT.',
			'Windows projects use draft_content.json. macOS projects often use the same JSON under the name draft_info.json. draft_meta_info.json is the project index and has no caption cues.',
		],
		guides: [
			{
				id: 'encrypted',
				kicker: 'Read this before you drop a file',
				heading: 'CapCut and Jianying 6.0+ drafts and template projects are encrypted',
				paragraphs: [
					'A current CapCut or Jianying 6.0+ project file, and drafts saved from a template, are encrypted blobs. They are not JSON. This converter cannot read them, and it will not pretend a binary file is a subtitle track. If the file does not open as text that starts with a left brace, export captions another way or use an older plain-text desktop draft.',
					'The sample loaded above is an original readable draft: three subtitle clips, one unused title, and a video segment that is skipped. The status line should say CapCut draft JSON and the SRT should contain three cues.',
				],
				bullets: [
					'Plain JSON from desktop drafts saved before the 6.0 encryption change can be read.',
					'Encrypted 6.0+ files and template-based project files cannot be read.',
					'Closing the project in CapCut before you copy the file avoids a half-written draft.',
				],
			},
			{
				id: 'where-file',
				kicker: 'Where the file lives',
				heading: 'Copy draft_content.json or draft_info.json, then drop it here',
				paragraphs: [
					'On Windows paste %LOCALAPPDATA%\\CapCut\\User Data\\Projects\\com.lveditor.draft into File Explorer. Each project is its own folder, and the caption file is draft_content.json. On macOS the same drafts live in ~/Movies/CapCut/User Data/Projects/com.lveditor.draft, and the caption file is often named draft_info.json.',
					'Mobile projects stay on the phone. Open or sync the project in CapCut desktop, then copy the desktop JSON. Do not drop draft_meta_info.json. It lists the project name and media, not the caption cues.',
				],
				code: {
					label: 'Fields this parser reads',
					source: `materials.texts[].id
materials.texts[].content  ->  JSON string with "text", or a plain string
tracks[].segments[].material_id
tracks[].segments[].target_timerange.start      (microseconds)
tracks[].segments[].target_timerange.duration   (microseconds)
`,
				},
				links: [
					{
						href: '/short-video-caption-splitter/',
						label: 'Split the exported captions to 16 characters',
					},
					{
						href: '/premiere-pro-srt-import/',
						label: 'Premiere-safe SRT rules if the next editor is Premiere',
					},
				],
			},
		],
		faqs: [
			{
				question: 'CapCut asks me to upgrade before I can export SRT. Can this page read the project instead?',
				answer:
					'Only when the project file is still plain JSON. Drop draft_content.json or macOS draft_info.json on this page and download SRT locally. Encrypted CapCut or Jianying 6.0+ files and template-based drafts cannot be read here.',
			},
			{
				question: 'The file is named .json but the converter says it is encrypted. What happened?',
				answer:
					'The name does not prove the contents are JSON. Newer and template drafts are binary or encoded blobs. The parser stops when the text does not start with a JSON object or array. It does not attempt to decrypt them.',
			},
			{
				question: 'Why is a title in materials.texts missing from the SRT?',
				answer:
					'Text is exported only when a timeline segment references that material id and has a target_timerange. Library text that never landed on a track stays out of the subtitle file.',
			},
		],
	},
	{
		slug: 'gpt-4o-transcribe-diarize-srt',
		path: '/gpt-4o-transcribe-diarize-srt/',
		navLabel: 'GPT-4o Diarize',
		h1: 'gpt-4o-transcribe-diarize JSON to SRT',
		seoTitle: 'gpt-4o-transcribe-diarize SRT | diarized_json Speaker Subtitles',
		metaDescription:
			'Turn OpenAI gpt-4o-transcribe-diarize diarized_json segments with speaker, start, and end into SRT subtitles in your browser.',
		primaryKeyword: 'gpt-4o-transcribe-diarize srt',
		heroSummary:
			'gpt-4o-transcribe returns JSON text, not an SRT file. gpt-4o-transcribe-diarize adds speaker segments when you request diarized_json. OpenAI has scheduled removal of hosted whisper-1, which could ask for response_format srt, on 2027-02-26. Convert the diarized segments here.',
		defaultSampleId: 'openai-diarized-json',
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
			'The recognized diarized_json object has a segments array. Each segment needs speaker, text, start, and end in float seconds. Official responses also set id to seg_0, seg_1, and so on, and type to transcript.text.segment.',
			'This shape has no words array. Cues that exceed the line width split by character count across the segment start and end. Speaker prefixes are on for this preset, and a new cue starts when the speaker changes.',
			'A segment list with speaker, start, end, and text but without seg_ ids still converts. The status line then says WhisperX Diarized JSON, because those fields overlap WhisperX segments that have no word timings.',
			'A body that is only {"text": "..."} has no timestamps. It cannot become a timed SRT. Request diarized_json, or verbose_json from a model that still returns segments.',
		],
		guides: [
			{
				id: 'shape',
				kicker: 'Exact input shape',
				heading: 'diarized_json segments this page labels as OpenAI',
				paragraphs: [
					'OpenAI documents diarized_json as segments with speaker, start, and end. Save the transcription response and drop it in the box above. The loaded sample uses two speakers, agent and caller, and three seg_ ids. Speaker prefixes are included in the SRT.',
					'whisper-1 could return SRT directly. OpenAI scheduled that hosted model, along with gpt-4o-transcribe and gpt-4o-transcribe-diarize, for removal on 2027-02-26. Until then, diarized_json is the timestamped file this page turns into subtitles. A text-only JSON response is not enough.',
				],
				code: {
					label: 'diarized_json object',
					source: `{
  "task": "transcribe",
  "duration": 14.86,
  "text": "Full transcript string for reference.",
  "segments": [
    {
      "id": "seg_0",
      "type": "transcript.text.segment",
      "speaker": "agent",
      "text": "Thanks for calling the studio line.",
      "start": 0.42,
      "end": 2.86
    }
  ]
}
`,
				},
				links: [
					{
						href: '/whisperx-diarized-json-to-srt/',
						label: 'WhisperX speaker preset for files that include words',
					},
					{
						href: '/whisper-verbose-json-to-srt/',
						label: 'verbose_json preset for word timestamps',
					},
				],
			},
			{
				id: 'request',
				kicker: 'API request',
				heading: 'Ask for diarized_json, then convert locally',
				paragraphs: [
					'Set model to gpt-4o-transcribe-diarize and response_format to diarized_json. Audio longer than 30 seconds needs chunking_strategy set to auto. Known speaker names are optional and show up as the speaker string on each segment.',
					'The transcript stays in your browser after you paste it. Do not send the JSON back through this site. There is no upload endpoint.',
				],
				code: {
					label: 'Request fields that matter',
					source: `model = "gpt-4o-transcribe-diarize"
response_format = "diarized_json"
chunking_strategy = "auto"
# optional: known_speaker_names and known_speaker_references
`,
				},
			},
		],
		faqs: [
			{
				question: 'Why is there no SRT option on gpt-4o-transcribe?',
				answer:
					'OpenAI documents JSON responses for gpt-4o-transcribe. The diarize model adds speaker, start, and end when response_format is diarized_json. Hosted whisper-1 is the model that accepted response_format srt, and OpenAI scheduled its removal for 2027-02-26.',
			},
			{
				question: 'What if my segments have speaker, start, and end but no seg_ id?',
				answer:
					'They still convert. Without id values such as seg_0 or type transcript.text.segment, the detector treats the file as WhisperX-style diarized segments. Add those fields when you want the status line to say OpenAI diarized_json.',
			},
			{
				question: 'Can I build an SRT from the text field alone?',
				answer:
					'No. A single text string has no cue boundaries. You need segment start and end. If the response omitted segments, call the API again with diarized_json and chunking_strategy auto.',
			},
		],
	},
	{
		slug: 'deepgram-json-to-srt',
		path: '/deepgram-json-to-srt/',
		navLabel: 'Deepgram JSON',
		h1: 'Deepgram JSON to SRT with Speaker Labels',
		seoTitle: 'Deepgram JSON to SRT | Utterances and Speaker Labels',
		metaDescription:
			'Convert Deepgram utterances JSON with numeric speaker labels into SRT or VTT subtitles locally. No parser rebuild and no upload.',
		primaryKeyword: 'deepgram json to srt',
		heroSummary:
			'Deepgram pre-recorded JSON already parses here. This page loads a two-speaker utterances sample so you can export speaker-labeled SRT from results.utterances without running the transcription again.',
		defaultSampleId: 'deepgram-utterances',
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
			'Request utterances=true and diarize=true. Each results.utterances item has start, end, and transcript in float seconds, an integer speaker, an id, and a words array.',
			'Word objects prefer punctuated_word over word, so capitalization and the trailing period survive. Integer speakers become Speaker 0 and Speaker 1.',
			'When utterances exist, they win over results.channels[0].alternatives[0].words. The sample plants the channel word "Ignored" to show that the SRT does not use it.',
			'The same Deepgram parser already powers the main converter. This page does not replace it. The words-only sample remains in the dialect menu for responses that omitted utterances.',
		],
		guides: [
			{
				id: 'utterances',
				kicker: 'Utterance sample',
				heading: 'One speaker turn, then the next speaker',
				paragraphs: [
					'The JSON in the input box is an original two-utterance payload. Speaker 0 says "Deepgram utterances group one speaker turn." After a pause, Speaker 1 continues. Speaker prefixes are on, so the SRT shows [Speaker 0] and [Speaker 1].',
					'Search the output for "Ignored". That word exists only on the channel alternative. If the utterance path is active, it stays out of the subtitle file. That is the check that this page is using utterances rather than a flat word list.',
				],
				bullets: [
					'start and end on an utterance are float seconds, not milliseconds.',
					'speaker is an integer. The prefix is Speaker N, not SPEAKER_00.',
					'A words array inside the utterance supplies per-word line breaks. Without words, the transcript string is split by character count.',
				],
				links: [
					{
						href: '/whisperx-diarized-json-to-srt/',
						label: 'WhisperX preset for SPEAKER_00 labels',
					},
					{ href: '/', label: 'Main converter with the words-only Deepgram sample' },
				],
			},
			{
				id: 'flags',
				kicker: 'Request flags',
				heading: 'Fields to keep when you save the Deepgram response',
				paragraphs: [
					'Save the JSON body from the pre-recorded API. You do not need the audio URL or the API key in the file. metadata.duration is optional. The parser reads results.utterances first, then paragraphs, then channel words.',
					'Smart formatting belongs in the request, before you save. punctuated_word is what the cue text uses when both word and punctuated_word are present.',
				],
				code: {
					label: 'Query flags that produce this shape',
					source: `utterances=true
diarize=true
smart_format=true
# results.utterances[].speaker
# results.utterances[].transcript
# results.utterances[].words[].punctuated_word
`,
				},
			},
		],
		faqs: [
			{
				question: 'Do I need a new Deepgram setting to use this page?',
				answer:
					'No. If the saved JSON already has results.utterances or channel words, drop it in. utterances=true plus diarize=true is what produces the speaker-labeled sample shown here. The parser is the one already used on the home page.',
			},
			{
				question: 'Why does the SRT say Speaker 0 instead of a name?',
				answer:
					'Deepgram diarization returns integers. The converter prints Speaker plus that integer. Rename speakers in the JSON, or edit the output, if you want real names. String speakers such as SPEAKER_00 are the WhisperX shape, not this one.',
			},
			{
				question: 'My file has channel words but no utterances. Will it still convert?',
				answer:
					'Yes. Choose the Deepgram Nova words sample in the dialect menu to see that path, or paste your own words array. Utterances are preferred only when that array is present and non-empty.',
			},
		],
	},
];

export const LONG_TAIL_WORKFLOW_CARDS: WorkflowLinkCard[] = [
	{
		slug: 'faster-whisper-srt',
		path: '/faster-whisper-srt/',
		badge: 'faster-whisper',
		anchorText: 'faster-whisper segments JSON to SRT',
		presetConfig: '.srt | segments + words',
		summary:
			'Save faster-whisper segments and word timings as JSON, then reflow line breaks and CPS before export.',
	},
	{
		slug: 'premiere-pro-srt-import',
		path: '/premiere-pro-srt-import/',
		badge: 'Premiere import',
		anchorText: 'Premiere Pro SRT generic error, clean re-export',
		presetConfig: '.srt | UTF-8, comma ms',
		summary:
			'Rebuild a Premiere-safe SRT from transcript JSON: no BOM, comma milliseconds, one blank line between cues.',
	},
	{
		slug: 'capcut-json-to-srt',
		path: '/capcut-json-to-srt/',
		badge: 'Plain draft JSON',
		anchorText: 'CapCut draft_content.json to SRT',
		presetConfig: '.srt | microsecond ranges',
		summary:
			'Read caption text from a plain CapCut or Jianying draft. Encrypted 6.0+ and template files are refused.',
	},
	{
		slug: 'gpt-4o-transcribe-diarize-srt',
		path: '/gpt-4o-transcribe-diarize-srt/',
		badge: 'diarized_json',
		anchorText: 'gpt-4o-transcribe-diarize JSON to SRT',
		presetConfig: '.srt | speaker segments',
		summary:
			'Convert diarized_json segments with speaker, start, and end after whisper-1 SRT output goes away.',
	},
	{
		slug: 'deepgram-json-to-srt',
		path: '/deepgram-json-to-srt/',
		badge: 'Utterances',
		anchorText: 'Deepgram utterances JSON to speaker SRT',
		presetConfig: '.srt | Speaker N prefixes',
		summary:
			'Export the existing Deepgram parser from a two-speaker utterances sample. Channel-only words stay unused.',
	},
];
