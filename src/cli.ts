import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { convertAsrJson } from './lib/subtitle-engine';
import type { CueFormatOptions, OutputFormat } from './lib/types';

export const CLI_VERSION = '0.1.0';

export const HELP_TEXT = `json-to-srt - Convert Whisper and ASR JSON transcripts into subtitles

USAGE:
  json-to-srt [options]
  json-to-srt --input transcript.json --format srt --output transcript.srt
  cat transcript.json | json-to-srt --format vtt > transcript.vtt

OPTIONS:
  -i, --input <file>        Input JSON file path (reads from stdin if omitted or "-")
  -o, --output <file>       Output subtitle file path (writes to stdout if omitted)
  -f, --format <format>     Output format: srt, vtt, txt, csv (default: srt)
      --max-chars <n>       Max characters per line (default: 42)
      --max-lines <1|2>     Max lines per cue (default: 2)
      --offset-ms <n>       Timestamp offset shift in milliseconds (default: 0)
      --speaker             Include [SPEAKER_XX] prefixes in cues
      --no-speaker          Omit speaker prefixes (default)
  -h, --help                Show this help message
  -v, --version             Show version number

BROWSER APP:
  Prefer a visual interface or zero-upload browser conversion?
  Visit https://jsontosrt.com for instant client-side conversion with live preview.
`;

export interface ParsedCliArgs {
	help: boolean;
	version: boolean;
	input?: string;
	output?: string;
	format: OutputFormat;
	maxChars: number;
	maxLines: 1 | 2;
	offsetMs: number;
	speaker: boolean;
}

export function parseCliArgs(args: string[]): ParsedCliArgs {
	const parsed: ParsedCliArgs = {
		help: false,
		version: false,
		format: 'srt',
		maxChars: 42,
		maxLines: 2,
		offsetMs: 0,
		speaker: false,
	};

	let i = 0;
	while (i < args.length) {
		const arg = args[i];

		if (arg === '-h' || arg === '--help') {
			parsed.help = true;
			i += 1;
			continue;
		}

		if (arg === '-v' || arg === '--version') {
			parsed.version = true;
			i += 1;
			continue;
		}

		if (arg === '--speaker') {
			parsed.speaker = true;
			i += 1;
			continue;
		}

		if (arg === '--no-speaker') {
			parsed.speaker = false;
			i += 1;
			continue;
		}

		if (arg === '-i' || arg === '--input') {
			if (i + 1 >= args.length) {
				throw new Error('Option "--input" requires a file path argument.');
			}
			parsed.input = args[i + 1];
			i += 2;
			continue;
		}
		if (arg.startsWith('--input=')) {
			parsed.input = arg.slice('--input='.length);
			i += 1;
			continue;
		}

		if (arg === '-o' || arg === '--output') {
			if (i + 1 >= args.length) {
				throw new Error('Option "--output" requires a file path argument.');
			}
			parsed.output = args[i + 1];
			i += 2;
			continue;
		}
		if (arg.startsWith('--output=')) {
			parsed.output = arg.slice('--output='.length);
			i += 1;
			continue;
		}

		if (arg === '-f' || arg === '--format') {
			if (i + 1 >= args.length) {
				throw new Error('Option "--format" requires a format argument (srt, vtt, txt, csv).');
			}
			const val = args[i + 1].toLowerCase();
			if (val !== 'srt' && val !== 'vtt' && val !== 'txt' && val !== 'csv') {
				throw new Error(`Invalid format "${val}". Allowed formats: srt, vtt, txt, csv.`);
			}
			parsed.format = val;
			i += 2;
			continue;
		}
		if (arg.startsWith('--format=')) {
			const val = arg.slice('--format='.length).toLowerCase();
			if (val !== 'srt' && val !== 'vtt' && val !== 'txt' && val !== 'csv') {
				throw new Error(`Invalid format "${val}". Allowed formats: srt, vtt, txt, csv.`);
			}
			parsed.format = val;
			i += 1;
			continue;
		}

		if (arg === '--max-chars') {
			if (i + 1 >= args.length) {
				throw new Error('Option "--max-chars" requires an integer argument.');
			}
			const val = parseInt(args[i + 1], 10);
			if (Number.isNaN(val) || val < 1) {
				throw new Error(`Invalid --max-chars value "${args[i + 1]}". Must be a positive integer.`);
			}
			parsed.maxChars = val;
			i += 2;
			continue;
		}
		if (arg.startsWith('--max-chars=')) {
			const rawVal = arg.slice('--max-chars='.length);
			const val = parseInt(rawVal, 10);
			if (Number.isNaN(val) || val < 1) {
				throw new Error(`Invalid --max-chars value "${rawVal}". Must be a positive integer.`);
			}
			parsed.maxChars = val;
			i += 1;
			continue;
		}

		if (arg === '--max-lines') {
			if (i + 1 >= args.length) {
				throw new Error('Option "--max-lines" requires an integer argument (1 or 2).');
			}
			const val = parseInt(args[i + 1], 10);
			if (val !== 1 && val !== 2) {
				throw new Error(`Invalid --max-lines value "${args[i + 1]}". Must be 1 or 2.`);
			}
			parsed.maxLines = val;
			i += 2;
			continue;
		}
		if (arg.startsWith('--max-lines=')) {
			const rawVal = arg.slice('--max-lines='.length);
			const val = parseInt(rawVal, 10);
			if (val !== 1 && val !== 2) {
				throw new Error(`Invalid --max-lines value "${rawVal}". Must be 1 or 2.`);
			}
			parsed.maxLines = val;
			i += 1;
			continue;
		}

		if (arg === '--offset-ms') {
			if (i + 1 >= args.length) {
				throw new Error('Option "--offset-ms" requires an integer argument.');
			}
			const val = parseInt(args[i + 1], 10);
			if (Number.isNaN(val)) {
				throw new Error(`Invalid --offset-ms value "${args[i + 1]}". Must be an integer.`);
			}
			parsed.offsetMs = val;
			i += 2;
			continue;
		}
		if (arg.startsWith('--offset-ms=')) {
			const rawVal = arg.slice('--offset-ms='.length);
			const val = parseInt(rawVal, 10);
			if (Number.isNaN(val)) {
				throw new Error(`Invalid --offset-ms value "${rawVal}". Must be an integer.`);
			}
			parsed.offsetMs = val;
			i += 1;
			continue;
		}

		if (!arg.startsWith('-') && !parsed.input) {
			parsed.input = arg;
			i += 1;
			continue;
		}

		throw new Error(`Unknown option: ${arg}`);
	}

	return parsed;
}

export async function readStdin(): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
	}
	return Buffer.concat(chunks).toString('utf8');
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
	let options: ParsedCliArgs;
	try {
		options = parseCliArgs(argv);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		process.stderr.write(`Error: ${message}\n\n`);
		process.stderr.write(HELP_TEXT);
		return 1;
	}

	if (options.help) {
		process.stdout.write(HELP_TEXT);
		return 0;
	}

	if (options.version) {
		process.stdout.write(`json-to-srt v${CLI_VERSION}\n`);
		return 0;
	}

	let jsonText = '';
	if (options.input && options.input !== '-') {
		if (!existsSync(options.input)) {
			process.stderr.write(`Error: Input file not found: ${options.input}\n`);
			return 1;
		}
		try {
			jsonText = readFileSync(options.input, 'utf8');
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			process.stderr.write(`Error reading file ${options.input}: ${message}\n`);
			return 1;
		}
	} else {
		if (process.stdin.isTTY) {
			process.stderr.write('Error: No input file specified and stdin is empty.\n\n');
			process.stderr.write(HELP_TEXT);
			return 1;
		}
		jsonText = await readStdin();
	}

	if (!jsonText.trim()) {
		process.stderr.write('Error: Input transcript JSON is empty.\n');
		return 1;
	}

	const cueOptions: CueFormatOptions = {
		format: options.format,
		maxCharsPerLine: options.maxChars,
		maxLinesPerCue: options.maxLines,
		maxCueDurationSec: 6,
		pauseSplitGapSec: 0.6,
		offsetMs: options.offsetMs,
		includeSpeakerPrefix: options.speaker,
	};

	const result = convertAsrJson(jsonText, cueOptions);
	if (!result.ok) {
		process.stderr.write(`Error: ${result.error}\n`);
		return 1;
	}

	const formattedOutput = result.output.endsWith('\n') ? result.output : `${result.output}\n`;

	if (options.output) {
		try {
			writeFileSync(options.output, formattedOutput, 'utf8');
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			process.stderr.write(`Error writing output file ${options.output}: ${message}\n`);
			return 1;
		}
	} else {
		process.stdout.write(formattedOutput);
	}

	return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().then((code) => {
		if (code !== 0) {
			process.exit(code);
		}
	});
}
