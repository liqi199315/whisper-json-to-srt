import { expect, type Locator, type Page, test } from '@playwright/test';

async function readOutputText(locator: Locator): Promise<string> {
	return locator.evaluate((el) => {
		if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
			return el.value;
		}
		return el.textContent ?? '';
	});
}

function extractCueTextLines(srtText: string): string[] {
	return srtText
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !/^\d+$/.test(line) && !line.includes('-->'));
}

function isExternalNetworkRequest(rawUrl: string): boolean {
	if (rawUrl.startsWith('data:') || rawUrl.startsWith('about:')) {
		return false;
	}
	if (rawUrl.startsWith('blob:')) {
		const inner = rawUrl.slice('blob:'.length);
		try {
			const parsedInner = new URL(inner);
			return parsedInner.hostname !== '127.0.0.1' && parsedInner.hostname !== 'localhost';
		} catch {
			return false;
		}
	}
	try {
		const parsed = new URL(rawUrl);
		return parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost';
	} catch {
		return true;
	}
}

interface DataLayerSnapshot {
	isArray: boolean;
	hasConfig: boolean;
	subtitleExportFormats: string[];
}

async function readDataLayerSnapshot(page: Page): Promise<DataLayerSnapshot> {
	return page.evaluate(() => {
		const raw = (window as unknown as { dataLayer?: unknown }).dataLayer;
		if (!Array.isArray(raw)) {
			return {
				isArray: false,
				hasConfig: false,
				subtitleExportFormats: [],
			};
		}

		let hasConfig = false;
		const subtitleExportFormats: string[] = [];

		for (const item of raw) {
			const tuple = Array.isArray(item)
				? item
				: item && typeof item === 'object' && 'length' in item
					? Array.from(item as ArrayLike<unknown>)
					: null;

			if (tuple) {
				if (tuple[0] === 'config') {
					hasConfig = true;
				}
				if (tuple[0] === 'event' && tuple[1] === 'subtitle_export') {
					const params = tuple[2];
					if (params && typeof params === 'object' && 'output_format' in params) {
						const formatVal = (params as Record<string, unknown>).output_format;
						if (typeof formatVal === 'string' && formatVal.length > 0) {
							subtitleExportFormats.push(formatVal);
						}
					}
				}
				continue;
			}

			if (item && typeof item === 'object') {
				const record = item as Record<string, unknown>;
				if (record.event === 'config' || record['0'] === 'config' || 'config' in record) {
					hasConfig = true;
				}
				if (record.event === 'subtitle_export') {
					const formatVal = record.output_format;
					if (typeof formatVal === 'string' && formatVal.length > 0) {
						subtitleExportFormats.push(formatVal);
					}
				}
			}
		}

		return {
			isArray: true,
			hasConfig,
			subtitleExportFormats,
		};
	});
}

function buildLargeOpenAiVerboseJsonBuffer(minBytes = 2_700_000): Buffer {
	const segments: Array<{
		id: number;
		seek: number;
		start: number;
		end: number;
		text: string;
		tokens: number[];
		temperature: number;
		avg_logprob: number;
		compression_ratio: number;
		no_speech_prob: number;
		words: Array<{ word: string; start: number; end: number }>;
	}> = [];

	const baseWords = [
		'EpisodeBenchmark',
		'audio',
		'transcript',
		'segment',
		'verified',
		'locally',
		'inside',
		'browser',
	];

	const segmentCount = 4000;
	for (let i = 0; i < segmentCount; i += 1) {
		const segStart = Number((i * 2.0).toFixed(2));
		const segEnd = Number((segStart + 1.84).toFixed(2));
		const words = baseWords.map((token, idx) => {
			const wordStart = Number((segStart + idx * 0.22).toFixed(2));
			const wordEnd = Number((wordStart + 0.2).toFixed(2));
			return {
				word: idx === 0 && i === 0 ? token : idx === 0 ? 'Podcast' : token,
				start: wordStart,
				end: wordEnd,
			};
		});
		const sentence = words.map((entry) => entry.word).join(' ');
		segments.push({
			id: i,
			seek: i * 200,
			start: segStart,
			end: segEnd,
			text: ` ${sentence}.`,
			tokens: [50364, 412, 889, 1024, 1532, 2048, 3072, 4096, 50456],
			temperature: 0,
			avg_logprob: -0.17,
			compression_ratio: 1.42,
			no_speech_prob: 0.01,
			words,
		});
	}

	const payload = {
		task: 'transcribe',
		language: 'english',
		duration: Number((segmentCount * 2.0).toFixed(2)),
		text: segments.map((s) => s.text.trim()).join(' '),
		segments,
	};

	const buffer = Buffer.from(JSON.stringify(payload), 'utf8');
	if (buffer.byteLength <= minBytes) {
		throw new Error(`Generated fixture (${buffer.byteLength} bytes) is smaller than ${minBytes}`);
	}
	return buffer;
}

test.describe('Whisper JSON to SRT converter journeys', () => {
	test('loads home route with valid SRT and switches output to WebVTT', async ({ page }) => {
		await page.goto('/');

		const statusBanner = page.getByTestId('status-banner');
		const subtitleOutput = page.getByTestId('subtitle-output');

		await expect(statusBanner).toHaveAttribute('data-status', 'ok');
		await expect.poll(() => readOutputText(subtitleOutput)).toContain('-->');

		const initialSrt = await readOutputText(subtitleOutput);
		expect(initialSrt.trim().length).toBeGreaterThan(0);

		await page.getByTestId('format-select').selectOption('vtt');
		await expect
			.poll(async () => (await readOutputText(subtitleOutput)).startsWith('WEBVTT'))
			.toBe(true);
	});

	test('applies 16-char single-line preset on /short-video-caption-splitter/', async ({ page }) => {
		await page.goto('/short-video-caption-splitter/');

		await expect(page.getByTestId('status-banner')).toHaveAttribute('data-status', 'ok');
		await expect(page.getByTestId('max-chars-input')).toHaveValue('16');
		await expect(page.getByTestId('max-lines-select')).toHaveValue('1');

		const subtitleOutput = page.getByTestId('subtitle-output');
		await expect.poll(() => readOutputText(subtitleOutput)).toContain('-->');

		const srtText = await readOutputText(subtitleOutput);
		const cueLines = extractCueTextLines(srtText);
		expect(cueLines.length).toBeGreaterThan(0);

		for (const line of cueLines) {
			const isSingleLongWord = !/\s/.test(line);
			expect(
				line.length <= 16 || isSingleLongWord,
				`Cue line "${line}" has length ${line.length} (> 16) and contains spaces`,
			).toBe(true);
		}
	});

	test('converts and downloads a >2.5 MB OpenAI verbose_json upload with zero paywall cap', async ({
		page,
	}) => {
		await page.goto('/');
		await expect(page.getByTestId('status-banner')).toHaveAttribute('data-status', 'ok');

		const buffer = buildLargeOpenAiVerboseJsonBuffer();
		expect(buffer.byteLength).toBeGreaterThan(2.5 * 1024 * 1024);

		await page.getByTestId('file-upload').setInputFiles({
			name: 'podcast-1hr.json',
			mimeType: 'application/json',
			buffer,
		});

		const subtitleOutput = page.getByTestId('subtitle-output');
		await expect
			.poll(() => readOutputText(subtitleOutput), { timeout: 15000 })
			.toContain('EpisodeBenchmark');
		await expect(page.getByTestId('status-banner')).toHaveAttribute('data-status', 'ok');

		const downloadPromise = page.waitForEvent('download');
		await page.getByTestId('download-output-btn').click();
		const download = await downloadPromise;

		expect(download.suggestedFilename()).toMatch(/\.srt$/i);
		const stream = await download.createReadStream();
		expect(stream).not.toBeNull();

		const chunks: Buffer[] = [];
		for await (const chunk of stream!) {
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		}
		const downloadedSrt = Buffer.concat(chunks).toString('utf8');
		expect(downloadedSrt.trim().length).toBeGreaterThan(0);
		expect(downloadedSrt).toContain('-->');
		expect(downloadedSrt).toContain('EpisodeBenchmark');
	});

	test('surfaces actionable error on malformed JSON and recovers on load-sample-btn', async ({
		page,
	}) => {
		await page.goto('/');

		const statusBanner = page.getByTestId('status-banner');
		const subtitleOutput = page.getByTestId('subtitle-output');
		await expect(statusBanner).toHaveAttribute('data-status', 'ok');

		await page.getByTestId('json-input').fill('{ "segments": [ broken_json');
		await expect(statusBanner).toHaveAttribute('data-status', 'error');

		const errorText = ((await statusBanner.textContent()) ?? '').trim();
		expect(errorText.length).toBeGreaterThan(8);
		expect(errorText).toMatch(/json|parse|invalid|syntax|unexpected|format/i);

		await page.getByTestId('load-sample-btn').click();
		await expect(statusBanner).toHaveAttribute('data-status', 'ok');
		await expect.poll(() => readOutputText(subtitleOutput)).toContain('-->');
	});

	test('records GA4 config and subtitle_export in window.dataLayer with zero external network requests', async ({
		page,
	}) => {
		const externalRequests: string[] = [];
		page.on('request', (request) => {
			const url = request.url();
			if (isExternalNetworkRequest(url)) {
				externalRequests.push(url);
			}
		});

		await page.goto('/');
		await expect(page.getByTestId('status-banner')).toHaveAttribute('data-status', 'ok');
		await expect.poll(() => readOutputText(page.getByTestId('subtitle-output'))).toContain('-->');

		const downloadPromise = page.waitForEvent('download');
		await page.getByTestId('download-output-btn').click();
		await downloadPromise;

		await expect.poll(() => readDataLayerSnapshot(page)).toEqual({
			isArray: true,
			hasConfig: true,
			subtitleExportFormats: ['srt'],
		});

		expect(externalRequests).toEqual([]);
	});

	test('renders 375x812 mobile viewport with zero horizontal overflow and navigates footer trust pages', async ({
		page,
	}) => {
		await page.setViewportSize({ width: 375, height: 812 });

		const homeResponse = await page.goto('/');
		expect(homeResponse?.status()).toBe(200);
		await expect(page.getByTestId('status-banner')).toHaveAttribute('data-status', 'ok');

		const homeScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
		expect(homeScrollWidth).toBeLessThanOrEqual(375);

		const privacyLink = page.locator('footer a[href="/privacy/"]').first();
		await expect(privacyLink).toBeVisible();
		const [privacyResponse] = await Promise.all([
			page.waitForResponse(
				(res) =>
					new URL(res.url()).pathname === '/privacy/' &&
					res.request().resourceType() === 'document',
			),
			privacyLink.click(),
		]);
		expect(privacyResponse.status()).toBe(200);
		await expect(page).toHaveURL(/\/privacy\/$/);

		const privacyH1 = page.locator('h1').first();
		await expect(privacyH1).toBeVisible();
		expect(((await privacyH1.textContent()) ?? '').trim().length).toBeGreaterThan(0);
		const privacyScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
		expect(privacyScrollWidth).toBeLessThanOrEqual(375);

		const aboutLink = page.locator('footer a[href="/about/"]').first();
		await expect(aboutLink).toBeVisible();
		const [aboutResponse] = await Promise.all([
			page.waitForResponse(
				(res) =>
					new URL(res.url()).pathname === '/about/' &&
					res.request().resourceType() === 'document',
			),
			aboutLink.click(),
		]);
		expect(aboutResponse.status()).toBe(200);
		await expect(page).toHaveURL(/\/about\/$/);

		const aboutH1 = page.locator('h1').first();
		await expect(aboutH1).toBeVisible();
		expect(((await aboutH1.textContent()) ?? '').trim().length).toBeGreaterThan(0);
		const aboutScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
		expect(aboutScrollWidth).toBeLessThanOrEqual(375);
	});

	test('long-tail tool pages preload a sample, export SRT, and stay within 375px', async ({
		page,
	}) => {
		const routes: Array<{ path: string; status: RegExp; output: RegExp }> = [
			{
				path: '/faster-whisper-srt/',
				status: /OpenAI Whisper verbose_json/,
				output: /faster-whisper returns segments/,
			},
			{
				path: '/premiere-pro-srt-import/',
				status: /OpenAI Whisper verbose_json/,
				output: /José/,
			},
			{
				path: '/capcut-json-to-srt/',
				status: /CapCut draft JSON/,
				output: /Plain CapCut drafts keep caption text/,
			},
			{
				path: '/gpt-4o-transcribe-diarize-srt/',
				status: /OpenAI diarized_json/,
				output: /\[agent\]/,
			},
			{
				path: '/deepgram-json-to-srt/',
				status: /Deepgram Nova JSON/,
				output: /\[Speaker 0\]/,
			},
		];

		for (const route of routes) {
			const response = await page.goto(route.path);
			expect(response?.status()).toBe(200);
			await expect(page.locator('h1')).toBeVisible();
			await expect(page.getByTestId('status-banner')).toHaveAttribute('data-status', 'ok');
			await expect(page.getByTestId('status-banner')).toContainText(route.status);
			const output = await readOutputText(page.getByTestId('subtitle-output'));
			expect(output.charCodeAt(0)).not.toBe(0xfeff);
			expect(output).toMatch(/\d{2}:\d{2}:\d{2},\d{3} --> /);
			expect(output).not.toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/);
			expect(output).toMatch(route.output);
			expect(output).not.toContain('Ignored');
			const expected = await page.getByTestId('expected-srt').evaluate((el) => el.textContent ?? '');
			expect(expected.trim()).toBe(output.trim());

			await page.getByTestId('copy-output-btn').click();
			await expect.poll(() => readDataLayerSnapshot(page)).toMatchObject({
				isArray: true,
				subtitleExportFormats: ['srt'],
			});
		}

		await page.setViewportSize({ width: 375, height: 812 });
		for (const route of routes) {
			await page.goto(route.path);
			const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
			expect(scrollWidth).toBeLessThanOrEqual(375);
		}
	});
});
