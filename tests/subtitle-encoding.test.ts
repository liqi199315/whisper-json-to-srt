import { describe, expect, it } from 'vitest';
import {
	SUPPORTED_ENCODINGS,
	analyzeSubtitleEncoding,
	buildEncodingSampleBytes,
	decodeSubtitleBytes,
	exportFixedSubtitleText,
	runQcOnDecodedSubtitle,
} from '../src/lib/subtitle-encoding';

const GBK_ZH =
	'310a30303a30303a30302c303030202d2d3e2030303a30303a30322c3430300ab4f3bcd2bac3a3acbbb6d3adcad5bfb4b1bec6dabddac4bfa1a30a0a320a30303a30303a30322c323030202d2d3e2030303a30303a30342c3830300abdf1ccecced2c3c7c1c4d2bbc1c4d7d6c4bbb1e0c2ebd0deb8b4a1a30a0a330a30303a30303a30352c303030202d2d3e2030303a30303a30372c3530300ab8d0d0bbb9dbbfb4a3acc7ebb6a9d4c4c6b5b5c0a1a30a';
const CP1251_RU =
	'310a30303a30303a30302c303030202d2d3e2030303a30303a30322c3530300acff0e8e2e5f22c20e4f0f3e7fcff2120d1e5e3eee4edff20ecfb20f0e0e7e1e5f0b8ec20eaeee4e8f0eee2eaf320f1f3e1f2e8f2f0eee22e0a0a320a30303a30303a30332c303030202d2d3e2030303a30303a30352c3530300ad4e0e9eb20eef2eaf0fbebf1ff20f120eaf0e0eaeee7ffe1f0e0ece82c20edee20fdf2ee20ebe5e3eaee20e8f1eff0e0e2e8f2fc2e0a0a330a30303a30303a30362c303030202d2d3e2030303a30303a30382c3030300ad1efe0f1e8e1ee20e7e020eff0eef1eceef2f020e820efeee4efe8f1eaf32e0a';
const SHIFT_JIS_JA =
	'310a30303a30303a30302c303030202d2d3e2030303a30303a30322c3530300a82b182f182c982bf82cd81418e9a968b82cc95b68e9a89bb82af82f092bc82b582dc82b582e582a481420a0a320a30303a30303a30332c303030202d2d3e2030303a30303a30352c3530300a93fa967b8cea82cc837483408343838b82cd8356837483674a495382c595db91b682b382ea82e982b182c682aa82a082e882dc82b781420a0a330a30303a30303a30362c303030202d2d3e2030303a30303a30382c3030300a82b28e8b92ae82a082e882aa82c682a482b282b482a282dc82b582bd81420a';
const CP1252_FR =
	'310a30303a30303a30302c303030202d2d3e2030303a30303a30322c3530300a426f6e6a6f757220e020746f75732c20766f69636920756e206669636869657220617665632064657320616363656e7473206672616ee76169732e0a0a320a30303a30303a30332c303030202d2d3e2030303a30303a30352c3530300a4c6120766964e96f206573742064e96ae0207072ea74652c206d616973206c657320736f75732d74697472657320736f6e74206d616c20656e636f64e9732e0a0a330a30303a30303a30362c303030202d2d3e2030303a30303a30382c3030300a4d6572636920642761766f697220726567617264e92063657474652064e96d6f6e7374726174696f6e2e0a';
const CP1252_ES =
	'310a30303a30303a30302c303030202d2d3e2030303a30303a30322c3430300a486f6c612c20bf7175e92074616c3f2045737465206172636869766f207469656e65206163656e746f732065737061f16f6c65732e0a0a320a30303a30303a30332c303030202d2d3e2030303a30303a30352c3530300a4c612067726162616369f36e20657374e1206c697374612c207065726f206c6f732073756274ed74756c6f7320657374e16e206d616c20636f646966696361646f732e0a0a330a30303a30303a30362c303030202d2d3e2030303a30303a30382c3030300a4772616369617320706f722076657220657374612064656d6f737472616369f36e2e0a';
const CP1250_PL =
	'310a30303a30303a30302c303030202d2d3e2030303a30303a30322c3430300a437a659ce62c20647a699c20706f6b61bf656d792c206a616b206e617072617769e6206b6f646f77616e6965206e61706973f3772e0a0a320a30303a30303a30332c303030202d2d3e2030303a30303a30352c3530300a506c696b206279b3207a61706973616e792077207ab3796d206b6f646f77616e69752c20616c6520b36174776f20746f207a6d69656e69e62e0a0a330a30303a30303a30362c303030202d2d3e2030303a30303a30382c3030300a447a69ea6b756aea207a61206f62656a727a656e6965206920737562736b727970636aea2e0a';
const CP1256_AR =
	'310a30303a30303a30302c303030202d2d3e2030303a30303a30322c3430300ae3d1cdc8c720c8dfe320dded20e5d0c720c7e1dad1d620dae420cad1e3edd220c7e1cad1cce3c92e0a0a320a30303a30303a30332c303030202d2d3e2030303a30303a30352c3530300ac7e1e3e1dd20e3cddde6d920c8cad1e3edd220cec7d8c620e6ede3dfe420c5d5e1c7cde520c8d3e5e6e1c92e0a0a330a30303a30303a30362c303030202d2d3e2030303a30303a30382c3030300ad4dfd1c720e1dfe320dae1ec20c7e1e3d4c7e5cfc920e6c7e1c7d4cad1c7df2e0a';
const BIG5_TW =
	'310a30303a30303a30302c303030202d2d3e2030303a30303a30322c3430300aa46aae61a66ea141c577aaefa6acacdda5bbb4c1b860a5d8a1430a0a320a30303a30303a30332c303030202d2d3e2030303a30303a30352c3530300aa4b5a4d1a7daadccb2e1b2e1a672b9f5bd73bd58add7b45fa1430a0a330a30303a30303a30362c303030202d2d3e2030303a30303a30382c3030300ab750c1c2c65bacdda141bdd0ad71be5cc057b944a1430a';
const EUC_KR_KO =
	'310a30303a30303a30302c303030202d2d3e2030303a30303a30322c3430300abec8b3e7c7cfbcbcbfe42e20c0dab8b720c0cec4dab5f920bab9b1b8b8a620bdc3c0dbc7cfb0dabdc0b4cfb4d92e0a0a320a30303a30303a30332c303030202d2d3e2030303a30303a30352c3530300abfc0b4c3c0ba20b1fac1f820b1dbc0dab8a620b0edc4a1b4c220b9e6b9fdc0bb20c0ccbedfb1e2c7d5b4cfb4d92e0a0a330a30303a30303a30362c303030202d2d3e2030303a30303a30382c3030300abdc3c3bbc7d820c1d6bcc5bcad20b0a8bbe7c7d5b4cfb4d92e0a';

function hexToBytes(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

function utf16Bytes(text: string, little: boolean, bom: boolean): Uint8Array {
	const units: number[] = [];
	for (const char of text) {
		const code = char.codePointAt(0) ?? 0;
		if (code > 0xffff) continue;
		units.push(code);
	}
	const bytes = new Uint8Array((bom ? 2 : 0) + units.length * 2);
	let offset = 0;
	if (bom) {
		bytes[0] = little ? 0xff : 0xfe;
		bytes[1] = little ? 0xfe : 0xff;
		offset = 2;
	}
	for (const unit of units) {
		bytes[offset++] = little ? unit & 0xff : unit >> 8;
		bytes[offset++] = little ? unit >> 8 : unit & 0xff;
	}
	return bytes;
}

function utf8WithBom(text: string): Uint8Array {
	const body = new TextEncoder().encode(text);
	const bytes = new Uint8Array(body.length + 3);
	bytes.set([0xef, 0xbb, 0xbf], 0);
	bytes.set(body, 3);
	return bytes;
}

const ASCII_SRT = `1
00:00:00,000 --> 00:00:02,000
Hello world.

2
00:00:02,500 --> 00:00:04,000
This file has no extended characters.
`;

const CLEAN_VTT = `WEBVTT

00:00:01.000 --> 00:00:02.500
Hello from VTT.

00:00:03.000 --> 00:00:04.500
Second cue.
`;

function recommendedOf(bytes: Uint8Array): string {
	return analyzeSubtitleEncoding(bytes).recommendedEncoding;
}

describe('encoding catalogue', () => {
	it('lists all eleven supported encodings with stable metadata', () => {
		expect(SUPPORTED_ENCODINGS).toHaveLength(11);
		expect(SUPPORTED_ENCODINGS.map((item) => item.id)).toEqual([
			'utf-8',
			'utf-16le',
			'utf-16be',
			'windows-1251',
			'windows-1252',
			'windows-1250',
			'windows-1256',
			'gb18030',
			'big5',
			'shift_jis',
			'euc-kr',
		]);
		const gb = SUPPORTED_ENCODINGS.find((item) => item.id === 'gb18030');
		expect(gb?.label).toBe('GB18030 / GBK (Simplified Chinese)');
		for (const item of SUPPORTED_ENCODINGS) {
			expect(item.label.length).toBeGreaterThan(0);
			expect(item.region.length).toBeGreaterThan(0);
		}
	});
});

describe('UTF-8 detection', () => {
	it('treats pure ASCII as UTF-8 with a top score', () => {
		const bytes = new TextEncoder().encode(ASCII_SRT);
		const result = analyzeSubtitleEncoding(bytes);
		expect(result.bomEncoding).toBeNull();
		expect(result.recommendedEncoding).toBe('utf-8');
		const utf8 = result.candidates.find((item) => item.encoding === 'utf-8');
		expect(utf8?.score).toBe(100);
		expect(utf8?.reason).toContain('pure ASCII');
		expect(utf8?.isRecommended).toBe(true);
	});

	it('keeps strict UTF-8 with non-ASCII text in front', () => {
		const bytes = new TextEncoder().encode(
			'1\n00:00:00,000 --> 00:00:02,000\nCrème brûlée is déjà prêt.\n',
		);
		const result = analyzeSubtitleEncoding(bytes);
		expect(result.recommendedEncoding).toBe('utf-8');
		const utf8 = result.candidates[0];
		expect(utf8?.encoding).toBe('utf-8');
		expect(utf8?.replacementCount).toBe(0);
	});

	it('detects a UTF-8 byte order mark and strips it from decoded text', () => {
		const source = '1\n00:00:00,000 --> 00:00:02,000\nVoilà déjà编码\n';
		const bytes = utf8WithBom(source);
		const result = analyzeSubtitleEncoding(bytes);
		expect(result.bomEncoding).toBe('utf-8');
		expect(result.recommendedEncoding).toBe('utf-8');
		const bomCandidate = result.candidates.find((item) => item.encoding === 'utf-8');
		expect(bomCandidate?.bomDetected).toBe(true);
		expect(bomCandidate?.decodedText.startsWith('\uFEFF')).toBe(false);
		expect(decodeSubtitleBytes(bytes, 'utf-8').text).toBe(source);
	});

	it('marks the UTF-8 candidate with replacement characters on non-UTF-8 bytes', () => {
		const result = analyzeSubtitleEncoding(hexToBytes(GBK_ZH));
		const utf8 = result.candidates.find((item) => item.encoding === 'utf-8');
		expect(utf8?.replacementCount).toBeGreaterThan(0);
		expect(utf8?.replacementRatio).toBeGreaterThan(0);
	});
});

describe('UTF-16 detection', () => {
	it('detects UTF-16 LE from alternating NUL bytes without a BOM', () => {
		const bytes = utf16Bytes(ASCII_SRT, true, false);
		const result = analyzeSubtitleEncoding(bytes);
		expect(result.bomEncoding).toBeNull();
		expect(result.recommendedEncoding).toBe('utf-16le');
		expect(decodeSubtitleBytes(bytes, 'utf-16le').text).toBe(ASCII_SRT);
	});

	it('detects UTF-16 BE from alternating NUL bytes without a BOM', () => {
		const bytes = utf16Bytes(ASCII_SRT, false, false);
		const result = analyzeSubtitleEncoding(bytes);
		expect(result.recommendedEncoding).toBe('utf-16be');
		expect(decodeSubtitleBytes(bytes, 'utf-16be').text).toBe(ASCII_SRT);
	});

	it('honours UTF-16 LE and BE byte order marks', () => {
		const le = analyzeSubtitleEncoding(utf16Bytes(ASCII_SRT, true, true));
		expect(le.bomEncoding).toBe('utf-16le');
		expect(le.recommendedEncoding).toBe('utf-16le');
		const be = analyzeSubtitleEncoding(utf16Bytes(ASCII_SRT, false, true));
		expect(be.bomEncoding).toBe('utf-16be');
		expect(be.recommendedEncoding).toBe('utf-16be');
	});

	it('does not classify single-byte text as UTF-16', () => {
		const result = analyzeSubtitleEncoding(hexToBytes(CP1251_RU));
		const le = result.candidates.find((item) => item.encoding === 'utf-16le');
		const be = result.candidates.find((item) => item.encoding === 'utf-16be');
		expect(le?.reason).toContain('No UTF-16 byte pattern');
		expect(be?.score ?? 0).toBeLessThan(70);
		expect(result.recommendedEncoding).toBe('windows-1251');
	});
});

describe('legacy code page detection', () => {
	const cases: Array<{ name: string; hex: string; expected: string; snippet: string }> = [
		{ name: 'GBK Simplified Chinese', hex: GBK_ZH, expected: 'gb18030', snippet: '大家好' },
		{ name: 'Big5 Traditional Chinese', hex: BIG5_TW, expected: 'big5', snippet: '大家好' },
		{ name: 'Windows-1251 Russian', hex: CP1251_RU, expected: 'windows-1251', snippet: 'Привет' },
		{ name: 'Shift-JIS Japanese', hex: SHIFT_JIS_JA, expected: 'shift_jis', snippet: 'こんにちは' },
		{ name: 'EUC-KR Korean', hex: EUC_KR_KO, expected: 'euc-kr', snippet: '안녕하세요' },
		{ name: 'Windows-1252 French', hex: CP1252_FR, expected: 'windows-1252', snippet: 'français' },
		{ name: 'Windows-1252 Spanish', hex: CP1252_ES, expected: 'windows-1252', snippet: 'españoles' },
		{ name: 'Windows-1250 Polish', hex: CP1250_PL, expected: 'windows-1250', snippet: 'Cześć' },
		{ name: 'Windows-1256 Arabic', hex: CP1256_AR, expected: 'windows-1256', snippet: 'مرحبا' },
	];

	for (const testCase of cases) {
		it(`recommends ${testCase.expected} for ${testCase.name}`, () => {
			const bytes = hexToBytes(testCase.hex);
			const result = analyzeSubtitleEncoding(bytes);
			expect(result.recommendedEncoding).toBe(testCase.expected);
			const decoded = decodeSubtitleBytes(bytes, result.recommendedEncoding);
			expect(decoded.text).toContain(testCase.snippet);
			expect(decoded.replacementCount).toBe(0);
			expect(decoded.replacementRatio).toBe(0);
			expect(result.candidates[0]?.encoding).toBe(testCase.expected);
		});
	}

	it('keeps Chinese encodings apart by common character density', () => {
		const simplified = analyzeSubtitleEncoding(hexToBytes(GBK_ZH));
		const big5Candidate = simplified.candidates.find((item) => item.encoding === 'big5');
		const gbCandidate = simplified.candidates.find((item) => item.encoding === 'gb18030');
		expect(gbCandidate?.score ?? 0).toBeGreaterThan(big5Candidate?.score ?? 0);

		const traditional = analyzeSubtitleEncoding(hexToBytes(BIG5_TW));
		const gbOnTraditional = traditional.candidates.find((item) => item.encoding === 'gb18030');
		const big5OnTraditional = traditional.candidates.find((item) => item.encoding === 'big5');
		expect(big5OnTraditional?.score ?? 0).toBeGreaterThan(gbOnTraditional?.score ?? 0);
	});

	it('keeps Arabic and Cyrillic apart through word structure', () => {
		const arabic = analyzeSubtitleEncoding(hexToBytes(CP1256_AR));
		const cyrillicCandidate = arabic.candidates.find((item) => item.encoding === 'windows-1251');
		expect(arabic.recommendedEncoding).toBe('windows-1256');
		expect(cyrillicCandidate?.isRecommended).toBe(false);

		const russian = analyzeSubtitleEncoding(hexToBytes(CP1251_RU));
		const arabicCandidate = russian.candidates.find((item) => item.encoding === 'windows-1256');
		expect(russian.recommendedEncoding).toBe('windows-1251');
		expect(arabicCandidate?.isRecommended).toBe(false);
	});
});

describe('mojibake preview', () => {
	it('shows a broken UTF-8 decode next to the repaired cue text', () => {
		const result = analyzeSubtitleEncoding(hexToBytes(GBK_ZH));
		expect(result.rawMojibakePreview.length).toBeGreaterThan(0);
		const gb = result.candidates.find((item) => item.encoding === 'gb18030');
		expect(gb?.previewCues.length).toBe(3);
		const first = gb?.previewCues[0];
		expect(first?.index).toBe(1);
		expect(first?.timestamp).toBe('00:00:00,000 --> 00:00:02,400');
		expect(first?.decodedText).toBe('大家好，欢迎收看本期节目。');
		expect(first?.mojibakeText).not.toBe(first?.decodedText);
	});

	it('caps preview pairs at ten cues', () => {
		const blocks: string[] = [];
		for (let i = 1; i <= 12; i++) {
			blocks.push(`${i}\n00:00:${String(i).padStart(2, '0')},000 --> 00:00:${String(i).padStart(2, '0')},500\nCue ${i}\n`);
		}
		const result = analyzeSubtitleEncoding(new TextEncoder().encode(blocks.join('\n')));
		const utf8 = result.candidates.find((item) => item.encoding === 'utf-8');
		expect(utf8?.previewCues.length).toBe(10);
		for (const candidate of result.candidates) {
			expect(candidate.previewCues.length).toBeLessThanOrEqual(10);
		}
	});
});

describe('timeline QC linkage', () => {
	it('reports the intentional overlap in the GBK sample', () => {
		const decoded = decodeSubtitleBytes(hexToBytes(GBK_ZH), 'gb18030');
		expect(decoded.qc.emittedCues).toBe(3);
		expect(decoded.qc.status).toBe('warning');
		const overlap = decoded.qc.issues.find((issue) => issue.code === 'overlap');
		expect(overlap?.index).toBe(2);
		expect(overlap?.relatedIndex).toBe(1);
	});

	it('keeps clean decoded samples clean', () => {
		for (const encoding of ['shift_jis', 'euc-kr', 'windows-1251', 'windows-1252'] as const) {
			const source = encoding === 'shift_jis' ? SHIFT_JIS_JA : encoding === 'euc-kr' ? EUC_KR_KO : encoding === 'windows-1251' ? CP1251_RU : CP1252_FR;
			const decoded = decodeSubtitleBytes(hexToBytes(source), encoding);
			expect(decoded.qc.status).toBe('clean');
		}
	});

	it('runs QC on VTT text and detects reversed and zero duration cues', () => {
		expect(runQcOnDecodedSubtitle(CLEAN_VTT).status).toBe('clean');
		const broken = `WEBVTT

00:00:05.000 --> 00:00:03.000
Reversed cue.

00:00:06.000 --> 00:00:06.000
Zero duration cue.
`;
		const report = runQcOnDecodedSubtitle(broken);
		expect(report.status).toBe('warning');
		expect(report.issues.some((issue) => issue.code === 'reversed-range')).toBe(true);
		expect(report.issues.some((issue) => issue.code === 'zero-duration')).toBe(true);
	});
});

describe('built-in sample bytes', () => {
	const presets = ['gbk-zh', 'cp1251-ru', 'shift-jis-ja', 'cp1252-fr'] as const;

	for (const preset of presets) {
		it(`round trips the ${preset} sample through analysis`, () => {
			const sample = buildEncodingSampleBytes(preset);
			const result = analyzeSubtitleEncoding(sample.bytes);
			expect(result.recommendedEncoding).toBe(sample.expectedEncoding);
			expect(sample.bytes).toBeInstanceOf(Uint8Array);
			expect(sample.filename.endsWith('.srt')).toBe(true);
			const decoded = decodeSubtitleBytes(sample.bytes, sample.expectedEncoding);
			expect(decoded.text).toContain('-->');
			expect(decoded.replacementCount).toBe(0);
		});
	}

	it('exposes the overlap only in the Chinese sample', () => {
		const zh = decodeSubtitleBytes(buildEncodingSampleBytes('gbk-zh').bytes, 'gb18030');
		expect(zh.qc.status).toBe('warning');
		for (const preset of ['cp1251-ru', 'shift-jis-ja', 'cp1252-fr'] as const) {
			const sample = buildEncodingSampleBytes(preset);
			const decoded = decodeSubtitleBytes(sample.bytes, sample.expectedEncoding);
			expect(decoded.qc.status).toBe('clean');
		}
	});
});

describe('export options', () => {
	const source = '\uFEFF1\r\n00:00:00,000 --> 00:00:01,000\r\nHello\r\nWorld\r\n';

	it('strips a leading byte order mark and normalises to LF', () => {
		const result = exportFixedSubtitleText(source, { bom: false, lineEnding: 'lf' });
		expect(result.text).toBe('1\n00:00:00,000 --> 00:00:01,000\nHello\nWorld\n');
		expect(result.byteLength).toBe(result.bytes.length);
		expect(Array.from(result.bytes.slice(0, 3))).toEqual([0x31, 0x0a, 0x30]);
		expect(result.bom).toBe(false);
	});

	it('writes CRLF line endings with an optional UTF-8 byte order mark', () => {
		const withBom = exportFixedSubtitleText(source, { bom: true, lineEnding: 'crlf' });
		expect(withBom.text.startsWith('\uFEFF')).toBe(true);
		expect(withBom.text).not.toContain('\n\n');
		expect(withBom.text.replace(/\r\n/g, '')).not.toContain('\n');
		expect(Array.from(withBom.bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
		expect(withBom.byteLength).toBe(withBom.bytes.length);
		expect(withBom.lineEnding).toBe('crlf');

		const crlfOnly = withBom.text.slice(1);
		expect(crlfOnly).toBe('1\r\n00:00:00,000 --> 00:00:01,000\r\nHello\r\nWorld\r\n');
		expect(new TextEncoder().encode(crlfOnly).length + 3).toBe(withBom.byteLength);
	});

	it('omits the byte order mark when asked', () => {
		const result = exportFixedSubtitleText(source, { bom: false, lineEnding: 'crlf' });
		expect(Array.from(result.bytes.slice(0, 3))).not.toEqual([0xef, 0xbb, 0xbf]);
		expect(result.text.charCodeAt(0)).toBe(0x31);
		expect(result.text).toContain('\r\n');
	});

	it('keeps non-ASCII repaired text intact in the exported bytes', () => {
		const repaired = '1\n00:00:00,000 --> 00:00:02,000\n大家好\n';
		const result = exportFixedSubtitleText(repaired, { bom: true, lineEnding: 'lf' });
		const decoded = new TextDecoder('utf-8').decode(result.bytes);
		expect(decoded.replace(/^\uFEFF/, '')).toBe(repaired);
	});
});

describe('byte input handling', () => {
	it('accepts ArrayBuffer input', () => {
		const bytes = hexToBytes(GBK_ZH);
		const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
		expect(recommendedOf(new Uint8Array(buffer))).toBe('gb18030');
		expect(analyzeSubtitleEncoding(buffer).recommendedEncoding).toBe('gb18030');
	});

	it('respects the byte offset of a subarray view', () => {
		const source = hexToBytes(GBK_ZH);
		const padded = new Uint8Array(source.length + 16);
		padded.fill(0x41, 0, 8);
		padded.set(source, 8);
		const view = padded.subarray(8, 8 + source.length);
		expect(analyzeSubtitleEncoding(view).recommendedEncoding).toBe('gb18030');
		expect(analyzeSubtitleEncoding(view).byteLength).toBe(source.length);
	});
});
