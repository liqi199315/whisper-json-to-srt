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
	{
		slug: 'assemblyai-json-to-srt',
		path: '/assemblyai-json-to-srt/',
		navLabel: 'AssemblyAI',
		h1: 'AssemblyAI JSON to SRT Converter',
		seoTitle: 'AssemblyAI JSON to SRT | Utterances and Word Timings to Subtitles',
		metaDescription:
			'Convert AssemblyAI utterances and word-level JSON transcripts into SRT, VTT, or CSV subtitles locally in your browser with speaker labels.',
		primaryKeyword: 'assemblyai json to srt',
		heroSummary:
			'Turn AssemblyAI transcription responses into broadcast-ready SubRip SRT, WebVTT, plain text, or CSV subtitle tracks. Parses integer millisecond utterance and word timestamps locally in browser RAM with automatic speaker diarization prefixes.',
		defaultSampleId: 'assemblyai-utterances',
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
			'Parses AssemblyAI utterances[] arrays with integer millisecond start and end values, normalizing them to second-based timestamps.',
			'Preserves speaker labels (such as "A" and "B") and maps them to [Speaker A] prefixes when speaker formatting is enabled.',
			'Falls back to top-level words[] array when utterance diarization is not requested in the transcription job.',
			'Processes multi-hour transcript files entirely in browser memory without sending customer dialogue over the network.',
		],
		guides: [
			{
				id: 'assemblyai-sdk-export',
				kicker: 'Python SDK Integration',
				heading: 'Generating timed transcripts with AssemblyAI Python SDK',
				paragraphs: [
					'AssemblyAI provides speech-to-text models that output structured word and utterance blocks. When speaker labels are enabled, AssemblyAI groups words into conversational turns with integer millisecond timestamps.',
					'Saving this JSON payload allows you to export SubRip subtitles with balanced line breaks and speaker prefixes without re-running cloud transcription jobs.',
				],
				code: {
					label: 'transcribe_assemblyai.py',
					source: `import assemblyai as aai
import json

aai.settings.api_key = "your_assemblyai_api_key"

config = aai.TranscriptionConfig(
    speaker_labels=True,
    punctuate=True,
    format_text=True,
)

transcriber = aai.Transcriber()
transcript = transcriber.transcribe("interview.mp3", config=config)

# Save the full utterances payload
payload = {
    "audio_duration": transcript.audio_duration,
    "utterances": [
        {
            "speaker": u.speaker,
            "start": u.start,
            "end": u.end,
            "text": u.text,
            "words": [
                {
                    "text": w.text,
                    "start": w.start,
                    "end": w.end,
                    "confidence": w.confidence,
                    "speaker": w.speaker,
                }
                for w in u.words
            ],
        }
        for u in (transcript.utterances or [])
    ],
}

with open("assemblyai_transcript.json", "w", encoding="utf-8") as f:
    json.dump(payload, f, indent=2)
`,
				},
			},
			{
				id: 'milliseconds-normalization',
				kicker: 'Timestamp Math',
				heading: 'Normalizing integer milliseconds to broadcast SubRip timestamps',
				paragraphs: [
					'AssemblyAI reports start and end times as integer milliseconds (e.g., 1240 ms). Standard SubRip format requires hours, minutes, seconds, and comma-separated milliseconds (00:00:01,240).',
					'Our client-side engine converts milliseconds to seconds dynamically, wraps long sentences at natural word boundaries, and verifies reading speed to prevent congested caption cues.',
				],
				bullets: [
					'Speaker boundary protection: Dialogue turns automatically start a new subtitle cue on speaker change.',
					'Confidence filtering: Preserves high-confidence word alignment while filtering dropped acoustic tokens.',
					'Universal format export: Instant download as SubRip (.srt), WebVTT (.vtt), plain text (.txt), or CSV (.csv).',
				],
				links: [
					{
						href: '/deepgram-json-to-srt/',
						label: 'Deepgram Nova utterances preset',
					},
					{
						href: '/whisperx-diarized-json-to-srt/',
						label: 'WhisperX diarized subtitle converter',
					},
				],
			},
		],
		faqs: [
			{
				question: 'How does this tool handle AssemblyAI integer milliseconds?',
				answer:
					'The parser automatically detects integer millisecond values in utterances and words arrays, dividing them by 1000 to compute exact fractional seconds without floating-point precision loss.',
			},
			{
				question: 'Can I convert AssemblyAI transcripts that do not include speaker diarization?',
				answer:
					'Yes. If your JSON payload omits the utterances array and only includes the words array, the engine groups words into 42-character broadcast lines with pause-based cue splitting.',
			},
			{
				question: 'Are my audio recordings or AssemblyAI JSON transcripts sent to external servers?',
				answer:
					'No. Every conversion runs 100% locally in browser RAM using JavaScript File.text() and Blob APIs. Zero transcript bytes leave your device.',
			},
			{
				question: 'What video editors accept the exported SRT files?',
				answer:
					'The generated SRT files use UTF-8 encoding without BOM, comma millisecond separators, and blank-line cue separators, ensuring seamless import into Premiere Pro, DaVinci Resolve, Final Cut Pro, and CapCut.',
			},
		],
	},
	{
		slug: 'broadcast-subtitle-qc-standards',
		path: '/broadcast-subtitle-qc-standards/',
		navLabel: 'Broadcast QC Guide',
		h1: 'Broadcast Subtitle QC Standards and Timing Guidelines',
		seoTitle: 'Broadcast Subtitle QC Standards | Netflix BBC CPL and CPS Guide',
		metaDescription:
			'Learn broadcast subtitle quality control standards: CPL limits, reading speed CPS thresholds, minimum cue duration, and automated timing QC checks.',
		primaryKeyword: 'broadcast subtitle qc standards',
		heroSummary:
			'Master broadcast and streaming subtitle quality control standards. Compare Netflix, BBC, and EBU specifications for line length, reading speeds, and shot change margins, and validate your ASR subtitle files with automated client-side timeline QC.',
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
			'Evaluates subtitle cues against international broadcast standards: 37 to 42 characters per line and maximum 2 lines per cue.',
			'Calculates real-time reading speed metrics (CPS) to ensure caption text remains comfortable for general audiences.',
			'Flags overlapping timestamps, zero-duration cues, and non-chronological cue orders before export.',
			'Automates timeline quality checks directly in your browser with downloadable QC diagnostic reports.',
		],
		guides: [
			{
				id: 'cpl-and-cps-specifications',
				kicker: 'International Specifications',
				heading: 'Comparing Netflix, BBC, and EBU subtitle delivery standards',
				paragraphs: [
					'Major streaming platforms and television broadcasters enforce strict technical parameters on subtitle deliverables. Exceeding character limits or reading speed thresholds leads to automated quality control rejections at ingest.',
					'Netflix mandates a maximum of 37 characters per line (CPL) for English dialogue, with a maximum reading speed of 17 characters per second (CPS) for adults and 13 CPS for children programming. The BBC guidelines permit up to 42 CPL, with recommended pacing between 160 and 180 words per minute.',
				],
				code: {
					label: 'broadcast_standards_summary.txt',
					source: `# International Broadcast Subtitle Specifications Summary
Netflix English:
- Maximum characters per line (CPL): 37
- Maximum lines per subtitle cue: 2
- Reading speed limit: 17 CPS (adults) / 13 CPS (children)
- Minimum duration: 20 frames (approx 0.833s at 24 fps)
- Maximum duration: 7 seconds
- Shot changes: Maintain 2 to 3 frames gap across scene cuts

BBC Subtitle Standards:
- Maximum characters per line (CPL): 42
- Maximum lines per subtitle cue: 2
- Reading speed limit: 180 words per minute (approx 20 CPS)
- Minimum duration: 1 second
- Alignment: Centered or left-aligned on lower third
`,
				},
			},
			{
				id: 'automated-timeline-qc',
				kicker: 'Automated Ingest QC',
				heading: 'Preventing subtitle ingestion errors with client-side timeline QC',
				paragraphs: [
					'Automatic speech recognition models frequently emit timing anomalies such as zero-duration cues, negative timestamps, reversed start-end ranges, and overlapping cues. Ingest systems in DaVinci Resolve, Premiere Pro, and broadcast QC platforms reject files with these defects.',
					'This tool integrates an automated timeline QC engine that flags invalid timestamps, non-finite values, and cue overlaps in real time. You can review issue summaries directly in the browser and download a diagnostic .qc.txt report alongside clean SRT files.',
				],
				bullets: [
					'Overlapping cues: Detects when cue N starts before cue N-1 finishes, preventing video editor timeline collisions.',
					'Reading speed warning: Highlights cues where rapid speech exceeds 22 characters per second.',
					'Safe timecode clamping: Automatically clamps negative timecode offsets to 00:00:00,000 to keep tracks valid.',
				],
				links: [
					{
						href: '/premiere-pro-srt-import/',
						label: 'Premiere Pro import troubleshooting',
					},
					{
						href: '/davinci-resolve-subtitle-import-error/',
						label: 'DaVinci Resolve timeline sync fix',
					},
				],
			},
		],
		faqs: [
			{
				question: 'What is the difference between CPL and CPS in subtitling?',
				answer:
					'CPL stands for Characters Per Line, representing horizontal text width (typically 37 to 42 characters). CPS stands for Characters Per Second, representing viewer reading speed (typically 15 to 20 characters per second). Both must be satisfied for broadcast compliance.',
			},
			{
				question: 'Why do broadcast platforms reject subtitles that cross shot changes?',
				answer:
					'When a subtitle cue appears right before a visual camera cut and lingers into the next shot, viewers reflexively re-read the cue. Guidelines require either cutting the cue before the shot change or snapping it across the cut with at least 2 frames gap.',
			},
			{
				question: 'How does JsonToSrt help pass automated broadcast QC?',
				answer:
					'The built-in timeline QC engine identifies issue codes including overlap, zero-duration, reversed-range, and unrepresentable-time, ensuring exported subtitles conform to industry delivery rules.',
			},
			{
				question: 'What is the minimum recommended subtitle cue duration?',
				answer:
					'Most broadcasters require a minimum duration of 20 frames (approx 0.833 seconds at 24 fps) or 1.0 second, even for short single-word utterances like "Yes" or "No", allowing viewers time to perceive and process the text.',
			},
		],
	},
	{
		slug: 'elevenlabs-scribe-json-to-srt',
		path: '/elevenlabs-scribe-json-to-srt/',
		navLabel: 'ElevenLabs Scribe',
		h1: 'ElevenLabs Scribe JSON to SRT Converter',
		seoTitle: 'ElevenLabs Scribe JSON to SRT | Word Timestamps to Subtitles',
		metaDescription:
			'Convert ElevenLabs Scribe speech-to-text JSON transcripts with word-level timestamps to SRT and VTT subtitles locally in your browser.',
		primaryKeyword: 'elevenlabs scribe json to srt',
		heroSummary:
			'Transform ElevenLabs Scribe speech-to-text JSON files into broadcast-safe SubRip SRT and WebVTT caption tracks. Uses word-level start and end timestamps to reflow text into readable subtitle blocks for vertical reels and long-form video.',
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
			'Extracts word-level timestamps from ElevenLabs Scribe speech-to-text API outputs.',
			'Wraps word sequences on word boundaries up to 42 characters per line for horizontal video or 16 characters for vertical video.',
			'Preserves precise speech timing while eliminating single-syllable visual clutter.',
			'Runs 100% locally in browser memory without transmitting transcript contents over external networks.',
		],
		guides: [
			{
				id: 'elevenlabs-scribe-api',
				kicker: 'Scribe Speech-to-Text',
				heading: 'Requesting word-level transcripts with ElevenLabs Scribe',
				paragraphs: [
					'ElevenLabs Scribe provides speech-to-text transcription with word-level alignment, supporting content creators who pair realistic voice synthesis with accurate video subtitles.',
					'Scribe returns timed word objects with floating-point start and end seconds. Saving this raw output enables dynamic re-chunking into standard broadcast subtitles or single-line vertical captions without repeating transcription calls.',
				],
				code: {
					label: 'call_elevenlabs_scribe.py',
					source: `import requests
import json

api_key = "your_elevenlabs_api_key"
url = "https://api.elevenlabs.io/v1/speech-to-text"

headers = {"xi-api-key": api_key}
files = {"file": open("voiceover.mp3", "rb")}
data = {"model_id": "scribe_v1", "timestamps_granularity": "word"}

response = requests.post(url, headers=headers, files=files, data=data)
result = response.json()

with open("scribe_transcript.json", "w", encoding="utf-8") as f:
    json.dump(result, f, indent=2)

print("Saved scribe_transcript.json for local subtitle conversion.")
`,
				},
			},
			{
				id: 'social-caption-reflow',
				kicker: 'Caption Pacing',
				heading: 'Reflowing Scribe timestamps for high-retention social captions',
				paragraphs: [
					'Raw speech-to-text output often runs as a single continuous transcript stream. When imported directly into video editors, long text blocks obscure facial expressions and overwhelm viewers.',
					'This workbench allows you to select custom line widths from 16 to 42 characters and configure pause thresholds. Word tokens are partitioned dynamically, snapping caption cues to spoken vocal emphasis.',
				],
				bullets: [
					'Vertical safe zones: Switch to 16 characters per line for TikTok and Instagram Reels formatting.',
					'Desktop broadcast mode: Switch to 42 characters across 2 lines for YouTube, Vimeo, and corporate video.',
					'Zero privacy risk: All JSON parsing and file downloads happen locally in your browser memory.',
				],
				links: [
					{
						href: '/short-video-caption-splitter/',
						label: '16-character single-line caption preset',
					},
					{
						href: '/whisper-verbose-json-to-srt/',
						label: 'OpenAI Whisper verbose_json converter',
					},
				],
			},
		],
		faqs: [
			{
				question: 'How do I convert ElevenLabs Scribe word timestamps into SRT subtitles?',
				answer:
					'Save the JSON response returned by ElevenLabs Scribe containing word start and end floats. Drop the file into this converter, select your preferred line length (16 or 42 characters), and click Download SRT.',
			},
			{
				question: 'Can I export WebVTT for web video players instead of SRT?',
				answer:
					'Yes. Select WebVTT from the output format dropdown to export compliant .vtt caption files with dot-millisecond timestamps and the mandatory WEBVTT file header.',
			},
			{
				question: 'Does this converter require an ElevenLabs API key?',
				answer:
					'No. This tool runs entirely in your browser as a client-side utility. You only need your already-saved Scribe JSON transcript file.',
			},
			{
				question: 'How are punctuation marks handled in the exported subtitles?',
				answer:
					'Punctuation marks returned alongside Scribe word tokens are automatically merged onto preceding words, preventing awkward line breaks or isolated punctuation cues.',
			},
		],
	},
	{
		slug: 'aws-transcribe-json-to-srt',
		path: '/aws-transcribe-json-to-srt/',
		navLabel: 'AWS Transcribe',
		h1: 'AWS Transcribe JSON to SRT Converter',
		seoTitle: 'AWS Transcribe JSON to SRT | Results Items to Subtitles',
		metaDescription:
			'Convert Amazon AWS Transcribe JSON output into clean SRT, VTT, or TXT subtitle files locally in your browser with punctuation alignment.',
		primaryKeyword: 'aws transcribe json to srt',
		heroSummary:
			'Convert Amazon Transcribe JSON job files into clean SubRip SRT, WebVTT, or CSV subtitles. Resolves AWS separate punctuation items, normalizes word timing offsets, and formats balanced subtitle lines with zero file size restrictions.',
		defaultSampleId: 'assemblyai-utterances',
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
			'Interprets Amazon Transcribe results.items[] lists containing pronunciation and punctuation entries.',
			'Attaches un-timed punctuation items to preceding words so commas and periods never trigger orphaned subtitle lines.',
			'Converts string-encoded seconds into precise numerical timestamp offsets.',
			'Processes large multi-megabyte enterprise transcription payloads in browser memory with zero server round-trips.',
		],
		guides: [
			{
				id: 'aws-transcribe-items-structure',
				kicker: 'Cloud ASR Architecture',
				heading: 'Understanding Amazon Transcribe JSON schema and item types',
				paragraphs: [
					'Amazon Transcribe outputs a comprehensive JSON structure where transcript words and punctuation marks are separated into distinct objects inside the results.items[] array.',
					'Pronunciation items carry start_time and end_time strings along with confidence ratings, while punctuation items carry only the punctuation symbol without timestamps. A standard JSON parser must attach punctuation items to the preceding word before calculating line wraps.',
				],
				code: {
					label: 'convert_aws_transcribe.py',
					source: `import json

# Normalize AWS Transcribe results.items into structured timed segments
def normalize_aws_transcribe(aws_json_path, output_json_path):
    with open(aws_json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    items = data["results"]["items"]
    words = []
    
    for item in items:
        if item["type"] == "pronunciation":
            words.append({
                "word": item["alternatives"][0]["content"],
                "start": float(item["start_time"]),
                "end": float(item["end_time"]),
            })
        elif item["type"] == "punctuation" and words:
            # Attach punctuation to preceding word
            words[-1]["word"] += item["alternatives"][0]["content"]
    
    payload = {"words": words}
    with open(output_json_path, "w", encoding="utf-8") as out:
        json.dump(payload, out, indent=2)

normalize_aws_transcribe("aws_job_output.json", "normalized_for_srt.json")
`,
				},
			},
			{
				id: 'punctuation-and-channel-handling',
				kicker: 'Audio Channels and Diarization',
				heading: 'Handling multi-channel recordings and speaker labels in AWS Transcribe',
				paragraphs: [
					'In contact center recordings and dual-channel podcast audio, Amazon Transcribe records speaker channels separately. Channel identification flags and speaker diarization segments are stored in results.channel_labels or results.speaker_labels.',
					'Our client-side tool handles multi-megabyte enterprise AWS Transcribe files without cloud queues or file size limits, wrapping dialogue into compliant subtitle tracks ready for NLE timelines.',
				],
				bullets: [
					'Clean punctuation binding: Eliminates orphaned commas or question marks on fresh subtitle lines.',
					'Broadcast line wrapping: Wraps dialogue at natural word boundaries up to 42 characters per line.',
					'Complete privacy: Converts corporate conference and call center audio transcripts offline in browser RAM.',
				],
				links: [
					{
						href: '/assemblyai-json-to-srt/',
						label: 'AssemblyAI utterances JSON converter',
					},
					{
						href: '/broadcast-subtitle-qc-standards/',
						label: 'Broadcast subtitle QC standards guide',
					},
				],
			},
		],
		faqs: [
			{
				question: 'Why does AWS Transcribe separate punctuation from words?',
				answer:
					'Amazon Transcribe models punctuation as distinct token events rather than word suffixes. This allows acoustic confidence scores to apply strictly to spoken vocabulary while punctuation represents syntactic prediction.',
			},
			{
				question: 'Can I convert AWS Transcribe files larger than 10 MB?',
				answer:
					'Yes. Because conversion executes locally in browser JavaScript using File.text() and Blob streams, multi-hour enterprise transcripts convert in milliseconds without upload limits.',
			},
			{
				question: 'How do I export WebVTT for web players from AWS Transcribe JSON?',
				answer:
					'Select WebVTT from the output format menu. The engine serializes clean dot-millisecond timestamps and the required WEBVTT file header for HTML5 video playback.',
			},
			{
				question: 'Are my AWS Transcribe files sent to any third-party server?',
				answer:
					'No. All data processing occurs strictly in your local browser tab. Zero transcript contents or account metadata are transmitted over external networks.',
			},
		],
	},
	{
		slug: 'davinci-resolve-subtitle-import-error',
		path: '/davinci-resolve-subtitle-import-error/',
		navLabel: 'DaVinci Resolve Fix',
		h1: 'Fix DaVinci Resolve Subtitle Import Errors and Sync Issues',
		seoTitle: 'DaVinci Resolve Subtitle Import Error | SRT Sync & Overlap Fix',
		metaDescription:
			'Troubleshoot DaVinci Resolve SRT subtitle import errors: fix timecode mismatch, cue overlap rejection, and non-dropframe frame rate drift.',
		primaryKeyword: 'davinci resolve subtitle import error',
		heroSummary:
			'Fix common DaVinci Resolve subtitle import errors, non-showing SRT tracks, timecode drift, and cue overlap rejections. Re-export clean, frame-accurate SubRip subtitles from raw transcription JSON directly in your browser.',
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
			'Generates clean SubRip formatting strictly adhering to DaVinci Resolve subtitle track parser requirements.',
			'Enforces non-overlapping cue boundaries to prevent timeline track import rejection.',
			'Applies millisecond offset adjustments to compensate for 23.976 fps versus 24.0 fps project frame rate drift.',
			'Outputs UTF-8 text without byte order marks (BOM) to eliminate character rendering glitches.',
		],
		guides: [
			{
				id: 'davinci-import-rejection-causes',
				kicker: 'Timeline Ingestion Troubleshooting',
				heading: 'Why DaVinci Resolve rejects or misaligns imported SRT files',
				paragraphs: [
					'DaVinci Resolve features a dedicated Subtitle Track on its Edit and Cut pages. However, its internal subtitle parser is substantially stricter than consumer media players like VLC.',
					'The three most frequent causes of DaVinci Resolve subtitle failures are: overlapping cue timestamps on a single track, frame rate timecode drift between 23.976 fps and 24.0 fps timelines, and hidden UTF-8 BOM characters that cause Resolve to skip the first subtitle cue.',
				],
				code: {
					label: 'davinci_resolve_timeline_checklist.txt',
					source: `# DaVinci Resolve Subtitle Troubleshooting Checklist
1. Cue Overlaps:
   Resolve does not allow two subtitle cues to share the same millisecond range on a single track.
   Ensure end time of cue N is less than or equal to start time of cue N+1.

2. Frame Rate Matching:
   Check Project Settings -> Master Settings -> Timeline Frame Rate.
   If video is 23.976 fps, ensure audio and transcription offsets are not calculated at 29.97 fps drop-frame.

3. File Encoding:
   File must be UTF-8 without BOM.
   Timestamps must use comma separator: 00:00:01,500 --> 00:00:04,200.
   Cue numbers must be sequential positive integers starting at 1.
`,
				},
			},
			{
				id: 'resolving-overlap-and-framerate-drift',
				kicker: 'Automated Repair',
				heading: 'Fixing overlaps and sync offsets with JsonToSrt timeline QC',
				paragraphs: [
					'When ASR tools produce overlapping cue timings, importing into DaVinci Resolve results in red warning banners or dropped lines. Our tool automatically inspects cue boundaries and flags overlaps before you export.',
					'Furthermore, if audio begins a few frames ahead of your video cut, you can adjust the Sync Offset slider to shift all subtitle cues forward or backward in 50 ms increments with instant visual verification.',
				],
				bullets: [
					'Zero BOM UTF-8: Re-exports clean subtitle files guaranteed free of invisible byte order marks.',
					'Frame-accurate offsets: Compensate for head leader audio padding or slate countdowns.',
					'Single blank line separator: Guarantees strict SubRip standard compliance for NLE timeline parsers.',
				],
				links: [
					{
						href: '/premiere-pro-srt-import/',
						label: 'Premiere Pro SRT import troubleshooting guide',
					},
					{
						href: '/broadcast-subtitle-qc-standards/',
						label: 'Broadcast subtitle QC standards guide',
					},
				],
			},
		],
		faqs: [
			{
				question: 'Why does DaVinci Resolve fail to import my SRT subtitle file?',
				answer:
					'Resolve rejects subtitle files that contain overlapping timestamps on the same track, missing blank lines between cues, or non-UTF-8 character encoding. Converting your raw transcript JSON here guarantees clean, valid SRT syntax.',
			},
			{
				question: 'How do I fix subtitles that slowly drift out of sync in DaVinci Resolve?',
				answer:
					'Sync drift usually occurs when your timeline frame rate (e.g., 23.976 fps) does not match the source recording frame rate (e.g., 24.0 or 29.97 fps). Ensure your project settings match the source footage, or apply a uniform millisecond offset.',
			},
			{
				question: 'Can I style DaVinci Resolve subtitles after importing the SRT?',
				answer:
					'Yes. Once the SRT is on the subtitle track, open the Inspector panel in Resolve to customize font family, size, stroke outline, drop shadow, and background box across the entire track simultaneously.',
			},
			{
				question: 'Does this tool support multiple subtitle tracks for different languages in Resolve?',
				answer:
					'Yes. You can convert multiple JSON files into separate SRT files and import each onto its own dedicated subtitle track in DaVinci Resolve.',
			},
		],
	},
	{
		slug: 'whisper-hallucination-timestamp-desync',
		path: '/whisper-hallucination-timestamp-desync/',
		navLabel: 'Whisper Hallucination',
		h1: 'Whisper Hallucination and Timestamp Desync Troubleshooting',
		seoTitle: 'Whisper Hallucination Timestamp Desync | Fix Audio Drift and Loops',
		metaDescription:
			'Troubleshoot Whisper subtitle hallucination loops and timestamp desync: diagnose silent repetition, attention collapse, and repair drifted cues.',
		primaryKeyword: 'whisper hallucination timestamp desync',
		heroSummary:
			'Diagnose and fix Whisper subtitle timestamp desynchronization, repetitive hallucination loops, and silent drift. Understand decoder attention degradation and use automated timeline QC to isolate and repair damaged subtitle cues.',
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
			'Detects common Whisper failure modes including repetitive text loops and runaway timestamp offsets.',
			'Identifies anomalous cue durations and unrepresentable timing values using client-side timeline QC.',
			'Enables visual inspection of suspect segments before exporting finalized SubRip or WebVTT files.',
			'Provides recommended Whisper inference parameter configurations to suppress hallucinations at the source.',
		],
		guides: [
			{
				id: 'whisper-hallucination-mechanisms',
				kicker: 'Decoder Failure Modes',
				heading: 'Why Whisper hallucinates and gets trapped in repetition loops',
				paragraphs: [
					'OpenAI Whisper uses an autoregressive sequence-to-sequence transformer architecture. During prolonged audio silence, low-volume background noise, or background music passages, the acoustic encoder supplies weak conditioning tokens to the text decoder.',
					'Under these conditions, the decoder attention mechanism often collapses, repeating the same phrase (such as "Thank you for watching" or "Subtitles by...") dozens of times while timestamp counters advance uncontrollably into the future.',
				],
				code: {
					label: 'whisper_anti_hallucination_params.py',
					source: `import whisper

model = whisper.load_model("medium")

# Recommended hyperparameters to suppress silent hallucinations and repetition loops
result = model.transcribe(
    "difficult_audio.mp3",
    word_timestamps=True,
    condition_on_previous_text=False,  # Prevents error cascading across 30s windows
    compression_ratio_threshold=2.4,   # Detects and discards repetitive text loops
    no_speech_threshold=0.6,           # Skips silent segments cleanly
    logprob_threshold=-1.0,            # Filters low-confidence transcript segments
    temperature=(0.0, 0.2, 0.4, 0.6),  # Falls back to higher temperature if stuck
)
`,
				},
			},
			{
				id: 'pruning-hallucinated-cues',
				kicker: 'Quality Control and Repair',
				heading: 'Isolating and pruning damaged cues with client-side timeline QC',
				paragraphs: [
					'When an audio recording already contains hallucination loops, re-running expensive cloud transcription is not always feasible. Our built-in timeline QC engine identifies anomalous cue durations, timestamp inversions, and cue overlaps instantly.',
					'You can inspect flagged cues in the timeline QC summary, remove repetitive sentences directly in the editable text pane, and export clean, broadcast-ready subtitles with verified reading speed.',
				],
				bullets: [
					'Condition on previous text: Disabling this parameter in Whisper prevents repetitive hallucinations from spreading across audio chunks.',
					'Compression ratio threshold: Whisper automatically flags segments where zlib compression indicates severe repetition.',
					'Timeline QC validation: Check issue codes to guarantee zero corrupted timestamps before video publishing.',
				],
				links: [
					{
						href: '/broadcast-subtitle-qc-standards/',
						label: 'Broadcast subtitle QC standards guide',
					},
					{
						href: '/faster-whisper-srt/',
						label: 'faster-whisper JSON guide and export',
					},
				],
			},
		],
		faqs: [
			{
				question: 'What causes Whisper to repeat the same phrase repeatedly in subtitles?',
				answer:
					'Autoregressive language models hallucinate when acoustic audio signals are ambiguous or silent. Setting condition_on_previous_text=False stops previous hallucinated tokens from biasing subsequent audio windows.',
			},
			{
				question: 'Why do Whisper timestamps suddenly jump forward by several minutes?',
				answer:
					'When Whisper fails to align speech within a 30-second window, it may skip timestamps to the end of the window. Inspecting the JSON in our converter reveals whether word timestamps or segment timestamps drifted.',
			},
			{
				question: 'How do I remove hallucinated cues without re-transcribing the whole file?',
				answer:
					'Paste your transcript JSON into this converter, locate the flagged cues using the Timeline QC panel, delete or edit the corrupted text lines in the editor, and click Download SRT.',
			},
			{
				question: 'Does temperature fallback help prevent Whisper hallucinations?',
				answer:
					'Yes. Passing a tuple of temperatures like (0.0, 0.2, 0.4, 0.6) allows Whisper to increase randomness when repetition or low average log probabilities are detected, helping it break out of silent loops.',
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
	{
		slug: 'assemblyai-json-to-srt',
		path: '/assemblyai-json-to-srt/',
		badge: 'AssemblyAI',
		anchorText: 'AssemblyAI utterances JSON to SRT',
		presetConfig: '.srt | ms utterances',
		summary:
			'Convert AssemblyAI integer millisecond utterance and word JSON transcripts into clean speaker-prefixed subtitles.',
	},
	{
		slug: 'broadcast-subtitle-qc-standards',
		path: '/broadcast-subtitle-qc-standards/',
		badge: 'QC Standards',
		anchorText: 'Broadcast subtitle QC standards guide',
		presetConfig: '.srt | Netflix & BBC specs',
		summary:
			'Learn broadcast quality standards: CPL limits, reading speed CPS thresholds, and automated timeline QC checks.',
	},
	{
		slug: 'elevenlabs-scribe-json-to-srt',
		path: '/elevenlabs-scribe-json-to-srt/',
		badge: 'ElevenLabs Scribe',
		anchorText: 'ElevenLabs Scribe word JSON to SRT',
		presetConfig: '.srt | word timestamps',
		summary:
			'Convert ElevenLabs Scribe speech-to-text JSON transcripts with word-level alignment into clean subtitles.',
	},
	{
		slug: 'aws-transcribe-json-to-srt',
		path: '/aws-transcribe-json-to-srt/',
		badge: 'AWS Transcribe',
		anchorText: 'AWS Transcribe results items to SRT',
		presetConfig: '.srt | punctuation binding',
		summary:
			'Convert Amazon AWS Transcribe JSON items into formatted SubRip subtitles with automated punctuation alignment.',
	},
	{
		slug: 'davinci-resolve-subtitle-import-error',
		path: '/davinci-resolve-subtitle-import-error/',
		badge: 'DaVinci Resolve',
		anchorText: 'Fix DaVinci Resolve subtitle import errors',
		presetConfig: '.srt | zero overlaps',
		summary:
			'Resolve DaVinci Resolve subtitle import errors, frame rate timecode drift, and cue overlap rejections.',
	},
	{
		slug: 'whisper-hallucination-timestamp-desync',
		path: '/whisper-hallucination-timestamp-desync/',
		badge: 'Whisper QC Fix',
		anchorText: 'Whisper hallucination and drift troubleshooting',
		presetConfig: '.srt | loop pruning',
		summary:
			'Diagnose and fix Whisper subtitle timestamp desynchronization, silent loops, and corrupted cue intervals.',
	},
];
