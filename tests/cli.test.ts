import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SAMPLE_PAYLOADS } from '../src/lib/sample-payloads';

const execFileAsync = promisify(execFile);
const CLI_PATH = path.resolve(__dirname, '../bin/json-to-srt.mjs');
const TMP_DIR = path.resolve(__dirname, '../.tmp-test-cli');

describe('json-to-srt CLI (bin/json-to-srt.mjs)', () => {
	beforeAll(() => {
		if (!existsSync(TMP_DIR)) {
			mkdirSync(TMP_DIR, { recursive: true });
		}
	});

	afterAll(() => {
		if (existsSync(TMP_DIR)) {
			rmSync(TMP_DIR, { recursive: true, force: true });
		}
	});

	it('prints help message with --help and includes browser app footer', async () => {
		const { stdout, stderr } = await execFileAsync('node', [CLI_PATH, '--help']);
		expect(stderr).toBe('');
		expect(stdout).toContain('json-to-srt - Convert Whisper and ASR JSON transcripts into subtitles');
		expect(stdout).toContain('--input');
		expect(stdout).toContain('--format');
		expect(stdout).toContain('https://jsontosrt.com');
	});

	it('prints version with -v and --version', async () => {
		const { stdout: stdoutLong } = await execFileAsync('node', [CLI_PATH, '--version']);
		expect(stdoutLong.trim()).toBe('json-to-srt v0.1.0');

		const { stdout: stdoutShort } = await execFileAsync('node', [CLI_PATH, '-v']);
		expect(stdoutShort.trim()).toBe('json-to-srt v0.1.0');
	});

	it('converts an input file to SRT via --input', async () => {
		const inputJsonPath = path.join(TMP_DIR, 'sample.json');
		writeFileSync(inputJsonPath, SAMPLE_PAYLOADS['openai-verbose-json'].json, 'utf8');

		const { stdout, stderr } = await execFileAsync('node', [
			CLI_PATH,
			'--input',
			inputJsonPath,
			'--format',
			'srt',
		]);

		expect(stderr).toBe('');
		expect(stdout).toContain('00:00:');
		expect(stdout).toContain('-->');
		expect(stdout).toContain('1\n');
	});

	it('converts to WebVTT format via --format vtt', async () => {
		const inputJsonPath = path.join(TMP_DIR, 'sample.json');
		writeFileSync(inputJsonPath, SAMPLE_PAYLOADS['openai-verbose-json'].json, 'utf8');

		const { stdout } = await execFileAsync('node', [
			CLI_PATH,
			'--input',
			inputJsonPath,
			'--format',
			'vtt',
		]);

		expect(stdout.startsWith('WEBVTT')).toBe(true);
		expect(stdout).toContain('00:00:');
		expect(stdout).toContain('-->');
	});

	it('converts to plain text and CSV formats', async () => {
		const inputJsonPath = path.join(TMP_DIR, 'sample.json');
		writeFileSync(inputJsonPath, SAMPLE_PAYLOADS['openai-verbose-json'].json, 'utf8');

		const { stdout: txtOut } = await execFileAsync('node', [
			CLI_PATH,
			'--input',
			inputJsonPath,
			'--format',
			'txt',
		]);
		expect(txtOut).not.toContain('-->');
		expect(txtOut.length).toBeGreaterThan(20);

		const { stdout: csvOut } = await execFileAsync('node', [
			CLI_PATH,
			'--input',
			inputJsonPath,
			'--format',
			'csv',
		]);
		expect(csvOut.startsWith('index,start,end,speaker,text')).toBe(true);
	});

	it('writes output to a file using --output', async () => {
		const inputJsonPath = path.join(TMP_DIR, 'input-file.json');
		const outputSrtPath = path.join(TMP_DIR, 'output-file.srt');
		writeFileSync(inputJsonPath, SAMPLE_PAYLOADS['openai-verbose-json'].json, 'utf8');

		const { stdout, stderr } = await execFileAsync('node', [
			CLI_PATH,
			'-i',
			inputJsonPath,
			'-o',
			outputSrtPath,
		]);

		expect(stdout).toBe('');
		expect(stderr).toBe('');
		expect(existsSync(outputSrtPath)).toBe(true);

		const content = readFileSync(outputSrtPath, 'utf8');
		expect(content).toContain('-->');
		expect(content).toContain('00:00:');
	});

	it('supports piped input from stdin', async () => {
		const child = execFile('node', [CLI_PATH, '--format', 'srt']);
		let stdout = '';
		let stderr = '';

		child.stdout?.on('data', (d) => {
			stdout += d;
		});
		child.stderr?.on('data', (d) => {
			stderr += d;
		});

		child.stdin?.write(SAMPLE_PAYLOADS['openai-verbose-json'].json);
		child.stdin?.end();

		const exitCode = await new Promise<number>((resolve) => {
			child.on('close', resolve);
		});

		expect(exitCode).toBe(0);
		expect(stderr).toBe('');
		expect(stdout).toContain('-->');
	});

	it('applies --max-chars and --max-lines formatting options', async () => {
		const inputJsonPath = path.join(TMP_DIR, 'sample.json');
		writeFileSync(inputJsonPath, SAMPLE_PAYLOADS['openai-verbose-json'].json, 'utf8');

		const { stdout } = await execFileAsync('node', [
			CLI_PATH,
			'--input',
			inputJsonPath,
			'--max-chars',
			'16',
			'--max-lines',
			'1',
		]);

		expect(stdout).toContain('-->');
		// Lines should be split more frequently
		const lines = stdout.split('\n');
		const cueTextLines = lines.filter((l) => l && !l.includes('-->') && !/^\d+$/.test(l));
		for (const line of cueTextLines) {
			expect(line.length).toBeLessThanOrEqual(30);
		}
	});

	it('applies millisecond timestamp offset with --offset-ms', async () => {
		const inputJsonPath = path.join(TMP_DIR, 'sample.json');
		writeFileSync(inputJsonPath, SAMPLE_PAYLOADS['openai-verbose-json'].json, 'utf8');

		const { stdout: baseline } = await execFileAsync('node', [
			CLI_PATH,
			'--input',
			inputJsonPath,
		]);

		const { stdout: shifted } = await execFileAsync('node', [
			CLI_PATH,
			'--input',
			inputJsonPath,
			'--offset-ms',
			'5000',
		]);

		expect(baseline).not.toBe(shifted);
		expect(shifted).toContain('00:00:05');
	});

	it('formats speaker labels with --speaker and omits with --no-speaker', async () => {
		const inputJsonPath = path.join(TMP_DIR, 'whisperx.json');
		writeFileSync(inputJsonPath, SAMPLE_PAYLOADS['whisperx-diarized'].json, 'utf8');

		const { stdout: withSpeaker } = await execFileAsync('node', [
			CLI_PATH,
			'--input',
			inputJsonPath,
			'--speaker',
		]);
		expect(withSpeaker).toContain('[SPEAKER_');

		const { stdout: withoutSpeaker } = await execFileAsync('node', [
			CLI_PATH,
			'--input',
			inputJsonPath,
			'--no-speaker',
		]);
		expect(withoutSpeaker).not.toContain('[SPEAKER_');
	});

	it('handles errors gracefully with non-zero exit code', async () => {
		// Non-existent file
		try {
			await execFileAsync('node', [CLI_PATH, '--input', 'non-existent-file-xyz.json']);
			expect.fail('Should have thrown an error');
		} catch (err: unknown) {
			const error = err as { code: number; stderr: string };
			expect(error.code).toBe(1);
			expect(error.stderr).toContain('Error: Input file not found');
		}

		// Invalid format
		try {
			await execFileAsync('node', [CLI_PATH, '--format', 'invalid-format']);
			expect.fail('Should have thrown an error');
		} catch (err: unknown) {
			const error = err as { code: number; stderr: string };
			expect(error.code).toBe(1);
			expect(error.stderr).toContain('Invalid format');
		}

		// Invalid JSON
		const badJsonPath = path.join(TMP_DIR, 'bad.json');
		writeFileSync(badJsonPath, '{ invalid json', 'utf8');
		try {
			await execFileAsync('node', [CLI_PATH, '--input', badJsonPath]);
			expect.fail('Should have thrown an error');
		} catch (err: unknown) {
			const error = err as { code: number; stderr: string };
			expect(error.code).toBe(1);
			expect(error.stderr).toContain('Error:');
		}
	});
});
