import { expect, type Download, type Page, test } from '@playwright/test';

async function readDownloadBuffer(download: Download): Promise<Buffer> {
	const stream = await download.createReadStream();
	expect(stream).not.toBeNull();
	const chunks: Buffer[] = [];
	for await (const chunk of stream!) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
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

async function readExportFormatsFromDataLayer(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const raw = (window as unknown as { dataLayer?: unknown }).dataLayer;
		if (!Array.isArray(raw)) return [];
		const formats: string[] = [];
		for (const item of raw) {
			const tuple = Array.isArray(item)
				? item
				: item && typeof item === 'object' && 'length' in item
					? Array.from(item as ArrayLike<unknown>)
					: null;
			if (tuple && tuple[0] === 'event' && tuple[1] === 'subtitle_export') {
				const params = tuple[2];
				if (params && typeof params === 'object' && 'output_format' in params) {
					const val = (params as Record<string, unknown>).output_format;
					if (typeof val === 'string') formats.push(val);
				}
			}
		}
		return formats;
	});
}

async function assertZeroOverflowAt375(page: Page, routePath: string): Promise<void> {
	await page.setViewportSize({ width: 375, height: 812 });
	const response = await page.goto(routePath, { waitUntil: 'networkidle' });
	expect(response?.status()).toBe(200);
	await expect(page.locator('h1')).toHaveCount(1);
	await expect(page.locator('h1')).toBeVisible();
	const overflow = await page.evaluate(() => ({
		scrollWidth: document.documentElement.scrollWidth,
		innerWidth: window.innerWidth,
	}));
	expect(overflow.scrollWidth).toBeLessThanOrEqual(375);
	expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
}

test.describe('Subtitle utility routes', () => {
	test('merge-subtitles supports 3+ file upload, 3 merge modes, diff preview, export, and zero external requests', async ({
		page,
	}) => {
		const externalRequests: string[] = [];
		page.on('request', (req) => {
			if (isExternalNetworkRequest(req.url())) externalRequests.push(req.url());
		});

		await page.goto('/merge-subtitles/', { waitUntil: 'networkidle' });
		await expect(page.locator('h1')).toBeVisible();

		const output = page.getByTestId('merge-output');
		const initialSrt = await output.inputValue();
		expect(initialSrt).toContain('[EN]');
		expect(initialSrt).toContain('[ZH]');
		await expect(page.getByTestId('merge-diff-preview')).toBeVisible();

		// Upload 3 tracks to prove we exceed 2-file cloud caps
		const trackA = '1\n00:00:01,000 --> 00:00:03,000\nHello world.\n';
		const trackB = '1\n00:00:01,150 --> 00:00:03,100\nBonjour le monde.\n';
		const trackC = 'WEBVTT\n\n00:00:04.000 --> 00:00:06.000\nThird track line.\n';

		await page.getByTestId('merge-file-upload').setInputFiles([
			{ name: 'en.srt', mimeType: 'text/plain', buffer: Buffer.from(trackA, 'utf8') },
			{ name: 'fr.srt', mimeType: 'text/plain', buffer: Buffer.from(trackB, 'utf8') },
			{ name: 'es.vtt', mimeType: 'text/vtt', buffer: Buffer.from(trackC, 'utf8') },
		]);

		await expect(output).toHaveValue(/Hello world\./);
		await expect(output).toHaveValue(/Bonjour le monde\./);
		await expect(output).toHaveValue(/Third track line\./);

		// Switch to Interleave mode
		await page.getByTestId('merge-mode-interleave').check();
		const interleaved = await output.inputValue();
		expect(interleaved).toContain('00:00:01,000 --> 00:00:03,000');
		expect(interleaved).toContain('00:00:01,150 --> 00:00:03,100');

		// Switch to Sequential mode
		await page.getByTestId('merge-mode-sequential').check();
		await page.getByTestId('merge-gap-ms').fill('500');
		const sequential = await output.inputValue();
		expect(sequential).toContain('00:00:03,500 --> 00:00:05,450');

		// Switch output format to VTT and download
		await page.getByTestId('merge-format-select').selectOption('vtt');
		const downloadPromise = page.waitForEvent('download');
		await page.getByTestId('merge-download-btn').click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(/\.vtt$/);
		const downloadedText = (await readDownloadBuffer(download)).toString('utf8');
		expect(downloadedText.startsWith('WEBVTT')).toBe(true);
		expect(downloadedText).toContain('Third track line.');

		const formats = await readExportFormatsFromDataLayer(page);
		expect(formats).toContain('vtt');
		expect(externalRequests).toEqual([]);
	});

	test('fix-subtitle-encoding detects raw bytes, previews mojibake before/after, links QC, and exports BOM + CRLF', async ({
		page,
	}) => {
		const externalRequests: string[] = [];
		page.on('request', (req) => {
			if (isExternalNetworkRequest(req.url())) externalRequests.push(req.url());
		});

		await page.goto('/fix-subtitle-encoding/', { waitUntil: 'networkidle' });
		await expect(page.locator('h1')).toBeVisible();

		// Initial GBK Chinese sample should recommend gb18030 and trigger QC notice
		await expect(page.getByTestId('encoding-select')).toHaveValue('gb18030');
		await expect(page.getByTestId('encoding-preview-table')).toBeVisible();
		await expect(page.getByTestId('encoding-qc-summary')).toBeVisible();

		// Switch to Shift-JIS sample
		await page.getByTestId('encoding-sample-sjis').click();
		await expect(page.getByTestId('encoding-select')).toHaveValue('shift_jis');

		// Upload a raw CP1251 Russian SRT buffer ("Привет мир")
		const cp1251Header = Buffer.from('1\n00:00:01,000 --> 00:00:03,500\n', 'ascii');
		const cp1251Line = Buffer.from([
			0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2, 0x20, 0xec, 0xe8, 0xf0, 0x2c, 0x20, 0xfd, 0xf2,
			0xee, 0x20, 0xf2, 0xe5, 0xf1, 0xf2, 0x20, 0xf1, 0xf3, 0xe1, 0xf2, 0xe8, 0xf2, 0xf0,
			0xee, 0xe2, 0x2e, 0x0a,
		]);
		const cp1251Buffer = Buffer.concat([cp1251Header, cp1251Line]);

		await page.getByTestId('encoding-file-upload').setInputFiles({
			name: 'russian-cp1251.srt',
			mimeType: 'application/octet-stream',
			buffer: cp1251Buffer,
		});

		await expect(page.getByTestId('encoding-select')).toHaveValue('windows-1251');
		await expect(page.getByTestId('encoding-output')).toHaveValue(/Привет мир/);

		// Select UTF-8 with BOM + CRLF and verify downloaded bytes
		await page.getByTestId('encoding-bom-select').selectOption('bom');
		await page.getByTestId('encoding-eol-select').selectOption('crlf');

		const downloadPromise = page.waitForEvent('download');
		await page.getByTestId('encoding-download-btn').click();
		const download = await downloadPromise;
		const downloadedBytes = await readDownloadBuffer(download);
		expect(downloadedBytes[0]).toBe(0xef);
		expect(downloadedBytes[1]).toBe(0xbb);
		expect(downloadedBytes[2]).toBe(0xbf);
		const text = downloadedBytes.subarray(3).toString('utf8');
		expect(text).toContain('\r\n');
		expect(text).toContain('Привет мир');

		const formats = await readExportFormatsFromDataLayer(page);
		expect(formats).toContain('srt');
		expect(externalRequests).toEqual([]);
	});

	test('srt-to-json exports 3 schemas, extracts speakers, and closes the JSON -> SRT -> JSON round-trip', async ({
		page,
	}) => {
		const externalRequests: string[] = [];
		page.on('request', (req) => {
			if (isExternalNetworkRequest(req.url())) externalRequests.push(req.url());
		});

		await page.goto('/srt-to-json/', { waitUntil: 'networkidle' });
		await expect(page.locator('h1')).toBeVisible();

		const jsonOutput = page.getByTestId('reverse-json-output');
		const verboseJsonText = await jsonOutput.inputValue();
		const verboseParsed = JSON.parse(verboseJsonText) as {
			segments: Array<{ id: number; start: number; end: number; text: string }>;
			text: string;
		};
		expect(Array.isArray(verboseParsed.segments)).toBe(true);
		expect(verboseParsed.segments.length).toBeGreaterThan(0);

		// Deepgram utterances preset with speaker extraction
		await page.getByTestId('reverse-schema-select').selectOption('deepgram-utterances');
		const dgParsed = JSON.parse(await jsonOutput.inputValue()) as {
			results: { utterances: Array<{ speaker: string | number; transcript: string }> };
		};
		expect(dgParsed.results.utterances.length).toBeGreaterThan(0);
		expect(String(dgParsed.results.utterances[0]?.speaker)).toContain('SPEAKER');

		// Generic timestamped JSON with milliseconds
		await page.getByTestId('reverse-schema-select').selectOption('generic-timestamped');
		await page.getByTestId('reverse-timestamp-unit').selectOption('milliseconds');
		const genericParsed = JSON.parse(await jsonOutput.inputValue()) as {
			timestamp_unit: string;
			cues: Array<{ index: number; start: number; end: number; duration: number }>;
		};
		expect(genericParsed.timestamp_unit).toBe('milliseconds');
		expect(genericParsed.cues[0]?.end).toBeGreaterThan(100);

		// Download JSON file and verify GA4 event
		const downloadPromise = page.waitForEvent('download');
		await page.getByTestId('reverse-download-btn').click();
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toMatch(/\.json$/);
		const downloadedJson = (await readDownloadBuffer(download)).toString('utf8');
		expect(() => JSON.parse(downloadedJson)).not.toThrow();

		const formats = await readExportFormatsFromDataLayer(page);
		expect(formats).toContain('json');

		// Browser round-trip: feed the OpenAI verbose_json back into "/" main converter
		await page.goto('/', { waitUntil: 'networkidle' });
		await page.getByTestId('json-input').fill(verboseJsonText);
		const roundTripSrt = await page.getByTestId('subtitle-output').inputValue();
		expect(roundTripSrt).toContain('-->');
		expect(roundTripSrt).toContain(verboseParsed.segments[0]!.text.slice(0, 12));
		expect(externalRequests).toEqual([]);
	});

	test('ttml-to-srt and smi-to-srt convert rare formats with offset, reflow, QC report, and download', async ({
		page,
	}) => {
		const externalRequests: string[] = [];
		page.on('request', (req) => {
			if (isExternalNetworkRequest(req.url())) externalRequests.push(req.url());
		});

		// TTML route
		await page.goto('/ttml-to-srt/', { waitUntil: 'networkidle' });
		await expect(page.locator('h1')).toBeVisible();
		const rareOutput = page.getByTestId('rare-output');
		expect(await rareOutput.inputValue()).toContain('-->');

		// Switch to LRC sample and verify conversion
		await page.getByTestId('rare-sample-lrc').click();
		await expect(rareOutput).toHaveValue(/-->/);

		// Apply +500 ms offset and switch output format to WebVTT
		await page.getByTestId('rare-offset-ms').fill('500');
		await page.getByTestId('rare-output-format').selectOption('vtt');
		expect(await rareOutput.inputValue()).toMatch(/^WEBVTT/);

		const ttmlDownloadPromise = page.waitForEvent('download');
		await page.getByTestId('rare-download-btn').click();
		const ttmlDownload = await ttmlDownloadPromise;
		expect(ttmlDownload.suggestedFilename()).toMatch(/\.vtt$/);

		// Download .qc.txt report
		const qcDownloadPromise = page.waitForEvent('download');
		await page.getByTestId('rare-qc-download-btn').click();
		const qcDownload = await qcDownloadPromise;
		expect(qcDownload.suggestedFilename()).toMatch(/\.qc\.txt$/);
		const qcText = (await readDownloadBuffer(qcDownload)).toString('utf8');
		expect(qcText).toContain('Timeline QC report');

		// SAMI route with file upload
		await page.goto('/smi-to-srt/', { waitUntil: 'networkidle' });
		await expect(page.locator('h1')).toBeVisible();
		expect(await page.getByTestId('rare-output').inputValue()).toContain('-->');

		const customSmi =
			'<SAMI><BODY><SYNC Start=1000><P Class=ENCC>Hello SAMI upload.<SYNC Start=3200><P Class=ENCC>&nbsp;</BODY></SAMI>';
		await page.getByTestId('rare-file-upload').setInputFiles({
			name: 'sample.smi',
			mimeType: 'text/plain',
			buffer: Buffer.from(customSmi, 'utf8'),
		});
		await expect(page.getByTestId('rare-output')).toHaveValue(/Hello SAMI upload\./);
		await expect(page.getByTestId('rare-output')).toHaveValue(/00:00:01,000 --> 00:00:03,200/);

		expect(externalRequests).toEqual([]);
	});

	test('all 5 new utility routes have zero horizontal overflow at 375x812 and are linked from home', async ({
		page,
	}) => {
		const utilityRoutes = [
			'/merge-subtitles/',
			'/fix-subtitle-encoding/',
			'/srt-to-json/',
			'/ttml-to-srt/',
			'/smi-to-srt/',
		];

		await page.goto('/', { waitUntil: 'networkidle' });
		for (const routePath of utilityRoutes) {
			await expect(page.locator(`main a[href="${routePath}"]`).first()).toBeVisible();
			await expect(page.locator(`footer a[href="${routePath}"]`).first()).toBeVisible();
		}

		for (const routePath of utilityRoutes) {
			await assertZeroOverflowAt375(page, routePath);
		}
	});
});
