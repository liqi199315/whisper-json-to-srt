import { analyzeCues, buildQcReport, type TimelineQcReport } from './timeline-qc';
import type { SubtitleCue } from './types';

export type SubtitleEncodingId =
	| 'utf-8'
	| 'utf-16le'
	| 'utf-16be'
	| 'windows-1251'
	| 'windows-1252'
	| 'windows-1250'
	| 'windows-1256'
	| 'gb18030'
	| 'big5'
	| 'shift_jis'
	| 'euc-kr';

export interface EncodingOptionMeta {
	id: SubtitleEncodingId;
	label: string;
	region: string;
}

export const SUPPORTED_ENCODINGS: EncodingOptionMeta[] = [
	{ id: 'utf-8', label: 'UTF-8', region: 'Universal' },
	{ id: 'utf-16le', label: 'UTF-16 LE', region: 'Universal' },
	{ id: 'utf-16be', label: 'UTF-16 BE', region: 'Universal' },
	{ id: 'windows-1251', label: 'Windows-1251 (Cyrillic)', region: 'Russia and Eastern Europe' },
	{ id: 'windows-1252', label: 'Windows-1252 (Western European)', region: 'Western Europe and the Americas' },
	{ id: 'windows-1250', label: 'Windows-1250 (Central European)', region: 'Central Europe' },
	{ id: 'windows-1256', label: 'Windows-1256 (Arabic)', region: 'Middle East' },
	{ id: 'gb18030', label: 'GB18030 / GBK (Simplified Chinese)', region: 'China and Singapore' },
	{ id: 'big5', label: 'Big5 (Traditional Chinese)', region: 'Taiwan and Hong Kong' },
	{ id: 'shift_jis', label: 'Shift-JIS (Japanese)', region: 'Japan' },
	{ id: 'euc-kr', label: 'EUC-KR (Korean)', region: 'South Korea' },
];

export interface PreviewCuePair {
	index: number;
	timestamp: string;
	mojibakeText: string;
	decodedText: string;
}

export interface EncodingCandidate {
	encoding: SubtitleEncodingId;
	label: string;
	region: string;
	score: number;
	replacementCount: number;
	replacementRatio: number;
	decodedText: string;
	previewCues: PreviewCuePair[];
	isRecommended: boolean;
	reason: string;
	bomDetected: boolean;
}

export interface EncodingAnalysisResult {
	byteLength: number;
	bomEncoding: SubtitleEncodingId | null;
	recommendedEncoding: SubtitleEncodingId;
	rawMojibakePreview: string;
	candidates: EncodingCandidate[];
}

export interface ExportEncodingOptions {
	bom: boolean;
	lineEnding: 'lf' | 'crlf';
}

export interface ExportEncodingResult {
	text: string;
	bytes: Uint8Array;
	byteLength: number;
	bom: boolean;
	lineEnding: 'lf' | 'crlf';
}

interface ParsedCueBlock {
	index: number;
	startSec: number;
	endSec: number;
	timestamp: string;
	lines: string[];
}

interface TextMetrics {
	length: number;
	replacementCount: number;
	controlCount: number;
	puaCount: number;
	cjkCount: number;
	cjkPunctCount: number;
	commonSimplifiedCount: number;
	commonTraditionalCount: number;
	hiraganaCount: number;
	katakanaCount: number;
	halfwidthKatakanaCount: number;
	hangulCount: number;
	commonHangulCount: number;
	latinLetterCount: number;
	cyrillicCount: number;
	cyrillicUpperCount: number;
	arabicCount: number;
	garbageSymbolCount: number;
	centralLetterCount: number;
	westLetterCount: number;
	rareCjkCount: number;
	cyrillicWordLetters: number;
	arabicWordLetters: number;
	latinWordCount: number;
	accentedWordCount: number;
	soupWordCount: number;
}

interface CandidateScore {
	score: number;
	reason: string;
}

const UTF8_BOM = [0xef, 0xbb, 0xbf];
const UTF16LE_BOM = [0xff, 0xfe];
const UTF16BE_BOM = [0xfe, 0xff];
const PREVIEW_LIMIT = 10;

const WEST_LETTERS = 'àèìòùâêîôûëïüÿœæãõñçÀÈÌÒÙÂÊÎÔÛËÏÜŸŒÆÃÕÑÇ';
const CENTRAL_LETTERS = 'čěřůąęłńśźżćťďňľĺŕČĚŘŮĄĘŁŃŚŹŻĆŤĎŇĽĹŔ';
const GARBAGE_SYMBOLS = '¤¦§¨ª¬®¯°±²³´µ¶·¸¹º¼½¾¿';

const COMMON_SIMPLIFIED = new Set(
	'的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问意建月公无系军很情者最立代想已通并提直题程展五果料象员革位入常文总次品式活设及管特件长求老头基资边流路级少图山统接知较将组见计别她手角期根论运农指几九区强放决西被做必战先回则任取据处队南给色光门即保治北造百规热领七海口东导器压志世金增争济阶油思术极交受联什认六共权收证改清己美再采转更单风切打白教速花带安场身车例真务具万每目至达走积示议声报斗完类八离华名确才科张信马节话米整空元况今集温传土许步群广石记需段研界拉林律叫且究观越织装影算低持音众书布复容儿须际商非验连断深难近矿千周委素技备半办青省列习响约支般史感劳便团往酸历市克何除消构府称太准精值号率族维划选标写存候毛亲快效斯院查江型眼王按格养易置派层片始却专状育厂京识适属圆包火住调满县局照参红细引听该铁价严龙飞',
);

const COMMON_TRADITIONAL = new Set(
	'的一是在不了有和人這中大為上個國我以要他時來用們生到作地於出就分對成會可主發年動同工也能下過子說產種面而方後多定行學法所民得經十三之進著等部度家電力裡如水化高自二理起小物現實加量都兩體製機當使點從業本去把性好應開它合還因由其些然前外天政四日那社義事平形相全表間樣與關各重新線內數正心反你明看原又麼利比或但質氣第向道命此變條只沒結解問意建月公無系軍很情者最立代想已通並提直題程展五果料象員革位入常文總次品式活設及管特件長求老頭基資邊流路級少圖山統接知較將組見計別她手角期根論運農指幾九區強放決西被乾做必戰先回則任取據處隊南給色光門即保治北造百規熱領七海口東導器壓志世金增爭濟階油思術極交受聯什認六共權收證改清己美再採轉更單風切打白教速花帶安場身車例真務具萬每目至達走積示議聲報鬥完類八離華名確才科張信馬節話米整空元況今集溫傳土許步群廣石記需段研界拉林律叫且究觀越織裝影算低持音眾書布復容兒須際商非驗連斷深難近礦千周委素技備半辦青省列習響約支般史感勞便團往酸歷市克何除消構府稱太準精值號率族維劃選標寫存候毛親快效斯院查江型眼王按格養易置派層片始卻專狀育廠京識適屬圓包火住調滿縣局照參紅細引聽該鐵價嚴龍飛',
);

const COMMON_HANGUL = new Set(
	'가각간갈감갑강개거건걸검것게겨격견결겸경계고곡곤곧공과관광괜교구국군굴궁권귀규그극근글금급기긴길김까께꼭꽃끝나난날남내냉너넌널네년노녹논놀농누눈느는늘능니다단달닭담답당대더덕덜데도독돈돌동되된될두둘뒤드든들등디따때또똑뛰뜨라란람랑래러런럼레려력련령로록론루르를름리린립마만많말맑맞망매맥먼멀메며면명모목몸못무문물뭐미민바박반받발밝방배백버번벌법베변별보복본볼봄봉부북분불붙비빠빨뻑사산살삼상새생서석선설성세소속손솔송수숙순술숨스슬습시식신실싶아악안알암애야약양어억언얼엄업없에여역연열염영예오옥온올와완왕외요용우운울움웃원월위유육윤율으은을음응의이익인일임입있자작잔잘잠장재저적전절점접정제조족존종좋주죽준줄중즈즉지직진질집짐차착찬찰참창찾채책처천철첫청체초촌총최추축출충취측층치친칠침카칼커컴케코콘콤크큰클키타탁탄탈탐탕태터털테토통퇴투트특티파판팔패퍼펼편평포폭표푸품풍프피필하학한할함합항해핵했행향허험현혈형혜호혹혼홍화확환황회획효후훈훌훨휘휴흐흔흘흥희히힘',
);

const SAMPLE_BYTES: Record<'gbk-zh' | 'cp1251-ru' | 'shift-jis-ja' | 'cp1252-fr', string> = {
	'gbk-zh':
		'310a30303a30303a30302c303030202d2d3e2030303a30303a30322c3430300ab4f3bcd2bac3a3acbbb6d3adcad5bfb4b1bec6dabddac4bfa1a30a0a320a30303a30303a30322c323030202d2d3e2030303a30303a30342c3830300abdf1ccecced2c3c7c1c4d2bbc1c4d7d6c4bbb1e0c2ebd0deb8b4a1a30a0a330a30303a30303a30352c303030202d2d3e2030303a30303a30372c3530300ab8d0d0bbb9dbbfb4a3acc7ebb6a9d4c4c6b5b5c0a1a30a',
	'cp1251-ru':
		'310a30303a30303a30302c303030202d2d3e2030303a30303a30322c3530300acff0e8e2e5f22c20e4f0f3e7fcff2120d1e5e3eee4edff20ecfb20f0e0e7e1e5f0b8ec20eaeee4e8f0eee2eaf320f1f3e1f2e8f2f0eee22e0a0a320a30303a30303a30332c303030202d2d3e2030303a30303a30352c3530300ad4e0e9eb20eef2eaf0fbebf1ff20f120eaf0e0eaeee7ffe1f0e0ece82c20edee20fdf2ee20ebe5e3eaee20e8f1eff0e0e2e8f2fc2e0a0a330a30303a30303a30362c303030202d2d3e2030303a30303a30382c3030300ad1efe0f1e8e1ee20e7e020eff0eef1eceef2f020e820efeee4efe8f1eaf32e0a',
	'shift-jis-ja':
		'310a30303a30303a30302c303030202d2d3e2030303a30303a30322c3530300a82b182f182c982bf82cd81418e9a968b82cc95b68e9a89bb82af82f092bc82b582dc82b582e582a481420a0a320a30303a30303a30332c303030202d2d3e2030303a30303a30352c3530300a93fa967b8cea82cc837483408343838b82cd8356837483674a495382c595db91b682b382ea82e982b182c682aa82a082e882dc82b781420a0a330a30303a30303a30362c303030202d2d3e2030303a30303a30382c3030300a82b28e8b92ae82a082e882aa82c682a482b282b482a282dc82b582bd81420a',
	'cp1252-fr':
		'310a30303a30303a30302c303030202d2d3e2030303a30303a30322c3530300a426f6e6a6f757220e020746f75732c20766f69636920756e206669636869657220617665632064657320616363656e7473206672616ee76169732e0a0a320a30303a30303a30332c303030202d2d3e2030303a30303a30352c3530300a4c6120766964e96f206573742064e96ae0207072ea74652c206d616973206c657320736f75732d74697472657320736f6e74206d616c20656e636f64e9732e0a0a330a30303a30303a30362c303030202d2d3e2030303a30303a30382c3030300a4d6572636920642761766f697220726567617264e92063657474652064e96d6f6e7374726174696f6e2e0a',
};

function toUint8Array(input: ArrayBuffer | Uint8Array): Uint8Array {
	if (input instanceof Uint8Array) {
		return input.byteOffset === 0 && input.byteLength === input.buffer.byteLength
			? input
			: new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
	}
	return new Uint8Array(input);
}

function hexToBytes(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

function decodeText(bytes: Uint8Array, encoding: SubtitleEncodingId): string {
	const text = new TextDecoder(encoding, { fatal: false }).decode(bytes);
	return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function detectBom(bytes: Uint8Array): SubtitleEncodingId | null {
	if (bytes.length >= UTF8_BOM.length && UTF8_BOM.every((byte, i) => bytes[i] === byte)) {
		return 'utf-8';
	}
	if (bytes.length >= 2 && bytes[0] === UTF16LE_BOM[0] && bytes[1] === UTF16LE_BOM[1]) {
		return 'utf-16le';
	}
	if (bytes.length >= 2 && bytes[0] === UTF16BE_BOM[0] && bytes[1] === UTF16BE_BOM[1]) {
		return 'utf-16be';
	}
	return null;
}

function isConvertibleUtf8(bytes: Uint8Array): boolean {
	try {
		new TextDecoder('utf-8', { fatal: true }).decode(bytes);
		return true;
	} catch {
		return false;
	}
}

function hasHighBytes(bytes: Uint8Array): boolean {
	for (const byte of bytes) {
		if (byte >= 0x80) return true;
	}
	return false;
}

function hasNulBytes(bytes: Uint8Array): boolean {
	for (const byte of bytes) {
		if (byte === 0x00) return true;
	}
	return false;
}

function detectUtf16Pattern(bytes: Uint8Array): SubtitleEncodingId | null {
	const pairs = Math.floor(Math.min(bytes.length, 4096) / 2);
	if (pairs < 4) return null;
	let evenNul = 0;
	let oddNul = 0;
	for (let i = 0; i < pairs; i++) {
		if (bytes[i * 2] === 0x00) evenNul += 1;
		if (bytes[i * 2 + 1] === 0x00) oddNul += 1;
	}
	const evenRatio = evenNul / pairs;
	const oddRatio = oddNul / pairs;
	if (oddRatio >= 0.35 && evenRatio <= 0.1) return 'utf-16le';
	if (evenRatio >= 0.35 && oddRatio <= 0.1) return 'utf-16be';
	return null;
}

const TIMESTAMP_SOURCE = String.raw`(?:\d{1,3}:)?\d{1,2}:\d{1,2}[,.]\d{1,3}`;
const CUE_TIMING_RE = new RegExp(`^\\s*(${TIMESTAMP_SOURCE})\\s*-->\\s*(${TIMESTAMP_SOURCE})(?:\\s+.*)?$`);
const TIMESTAMP_RE = /^(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?$/;

function parseTimestampSeconds(value: string): number | null {
	const match = value.trim().match(TIMESTAMP_RE);
	if (!match) return null;
	const hours = match[1] ? Number(match[1]) : 0;
	const minutes = Number(match[2]);
	const seconds = Number(match[3]);
	const millis = match[4] ? Number(match[4].padEnd(3, '0')) : 0;
	const total = hours * 3600 + minutes * 60 + seconds + millis / 1000;
	return Number.isFinite(total) ? total : null;
}

function stripCueMarkup(line: string): string {
	return line
		.replace(/<[^>]*>/g, '')
		.replace(/\{\\[^}]*\}/g, '')
		.trim();
}

function parseCueBlocks(text: string): ParsedCueBlock[] {
	const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
	const blocks = normalized.split(/\n{2,}/);
	const cues: ParsedCueBlock[] = [];
	let fallbackIndex = 0;

	for (const block of blocks) {
		const lines = block.split('\n').filter((line) => line.trim().length > 0);
		if (lines.length === 0) continue;
		const first = lines[0] ?? '';
		if (/^(WEBVTT\b|NOTE\b|STYLE\b|REGION\b)/.test(first)) continue;

		let timingAt = -1;
		let startText = '';
		let endText = '';
		for (let i = 0; i < lines.length; i++) {
			const match = (lines[i] ?? '').match(CUE_TIMING_RE);
			if (match) {
				timingAt = i;
				startText = match[1] ?? '';
				endText = match[2] ?? '';
				break;
			}
		}
		if (timingAt < 0) continue;

		const startSec = parseTimestampSeconds(startText);
		const endSec = parseTimestampSeconds(endText);
		if (startSec === null || endSec === null) continue;

		let index = 0;
		for (let i = 0; i < timingAt; i++) {
			const candidate = (lines[i] ?? '').trim();
			if (/^\d+$/.test(candidate)) {
				index = Number(candidate);
				break;
			}
		}
		fallbackIndex += 1;
		if (index <= 0) index = fallbackIndex;

		const textLines = lines.slice(timingAt + 1).map(stripCueMarkup).filter((line) => line.length > 0);
		cues.push({
			index,
			startSec,
			endSec,
			timestamp: `${startText} --> ${endText}`,
			lines: textLines,
		});
	}
	return cues;
}

function toSubtitleCues(cues: ParsedCueBlock[]): SubtitleCue[] {
	return cues.map((cue) => ({
		index: cue.index,
		startSec: cue.startSec,
		endSec: cue.endSec,
		lines: cue.lines,
	}));
}

function buildPreviewPairs(
	rawCues: ParsedCueBlock[],
	decodedCues: ParsedCueBlock[],
	limit = PREVIEW_LIMIT,
): PreviewCuePair[] {
	const total = Math.min(limit, Math.max(rawCues.length, decodedCues.length));
	const pairs: PreviewCuePair[] = [];
	for (let i = 0; i < total; i++) {
		const decoded = decodedCues[i];
		if (!decoded) continue;
		const raw = rawCues[i];
		pairs.push({
			index: decoded.index,
			timestamp: decoded.timestamp,
			mojibakeText: raw ? raw.lines.join('\n') : decoded.lines.join('\n'),
			decodedText: decoded.lines.join('\n'),
		});
	}
	return pairs;
}

function isControlCode(code: number): boolean {
	if (code === 0x09 || code === 0x0a || code === 0x0d) return false;
	return code < 0x20 || (code >= 0x7f && code <= 0x9f);
}

function computeMetrics(text: string): TextMetrics {
	const metrics: TextMetrics = {
		length: text.length,
		replacementCount: 0,
		controlCount: 0,
		puaCount: 0,
		cjkCount: 0,
		cjkPunctCount: 0,
		rareCjkCount: 0,
		commonSimplifiedCount: 0,
		commonTraditionalCount: 0,
		hiraganaCount: 0,
		katakanaCount: 0,
		halfwidthKatakanaCount: 0,
		hangulCount: 0,
		commonHangulCount: 0,
		latinLetterCount: 0,
		cyrillicCount: 0,
		cyrillicUpperCount: 0,
		arabicCount: 0,
		garbageSymbolCount: 0,
		centralLetterCount: 0,
		westLetterCount: 0,
		cyrillicWordLetters: 0,
		arabicWordLetters: 0,
		latinWordCount: 0,
		accentedWordCount: 0,
		soupWordCount: 0,
	};

	for (const char of text) {
		const code = char.codePointAt(0) ?? 0;
		if (code === 0xfffd) metrics.replacementCount += 1;
		else if (isControlCode(code)) metrics.controlCount += 1;

		if (code >= 0xe000 && code <= 0xf8ff) metrics.puaCount += 1;

		if (code >= 0x4e00 && code <= 0x9fff) {
			metrics.cjkCount += 1;
			if (COMMON_SIMPLIFIED.has(char)) metrics.commonSimplifiedCount += 1;
			if (COMMON_TRADITIONAL.has(char)) metrics.commonTraditionalCount += 1;
		} else if (code >= 0x3000 && code <= 0x303f) {
			metrics.cjkPunctCount += 1;
		} else if ((code >= 0x3400 && code <= 0x4dbf) || (code >= 0xf900 && code <= 0xfaff)) {
			metrics.rareCjkCount += 1;
		}

		if (code >= 0x3040 && code <= 0x309f) metrics.hiraganaCount += 1;
		if (code >= 0x30a0 && code <= 0x30ff) metrics.katakanaCount += 1;
		if (code >= 0xff66 && code <= 0xff9d) metrics.halfwidthKatakanaCount += 1;

		if (code >= 0xac00 && code <= 0xd7af) {
			metrics.hangulCount += 1;
			if (COMMON_HANGUL.has(char)) metrics.commonHangulCount += 1;
		}

		if (code >= 0x0400 && code <= 0x04ff) {
			metrics.cyrillicCount += 1;
			if ((code >= 0x0410 && code <= 0x042f) || code === 0x0401) {
				metrics.cyrillicUpperCount += 1;
			}
		}

		if (code >= 0x0600 && code <= 0x06ff) metrics.arabicCount += 1;
		if (GARBAGE_SYMBOLS.includes(char)) metrics.garbageSymbolCount += 1;
		if (CENTRAL_LETTERS.includes(char)) metrics.centralLetterCount += 1;
		if (WEST_LETTERS.includes(char)) metrics.westLetterCount += 1;

		if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
			metrics.latinLetterCount += 1;
		} else if (code >= 0x00c0 && code <= 0x024f) {
			metrics.latinLetterCount += 1;
		}
	}

	const words = text.match(/[\p{L}\p{M}]+/gu) ?? [];
	for (const word of words) {
		const chars = Array.from(word);
		let cyrillic = 0;
		let arabic = 0;
		let ascii = 0;
		let accented = 0;
		for (const char of chars) {
			const code = char.codePointAt(0) ?? 0;
			if (code >= 0x0400 && code <= 0x04ff) cyrillic += 1;
			else if (code >= 0x0600 && code <= 0x06ff) arabic += 1;
			else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) ascii += 1;
			else if (code >= 0x00c0 && code <= 0x024f) accented += 1;
		}
		if (cyrillic >= 2 && cyrillic === chars.length) metrics.cyrillicWordLetters += cyrillic;
		if (arabic >= 2 && arabic === chars.length) metrics.arabicWordLetters += arabic;
		if (chars.length >= 2 && cyrillic === 0 && arabic === 0) {
			metrics.latinWordCount += 1;
			if (accented > 0 && ascii / chars.length >= 0.5) metrics.accentedWordCount += 1;
			if (accented > 0 && ascii / chars.length < 0.3) metrics.soupWordCount += 1;
		}
	}

	return metrics;
}

function totalLetterCount(metrics: TextMetrics): number {
	return (
		metrics.latinLetterCount +
		metrics.cyrillicCount +
		metrics.arabicCount +
		metrics.cjkCount +
		metrics.hiraganaCount +
		metrics.katakanaCount +
		metrics.hangulCount
	);
}

function invalidPairRatio(bytes: Uint8Array, encoding: SubtitleEncodingId): number {
	let pairs = 0;
	let invalid = 0;
	let i = 0;

	while (i < bytes.length) {
		const byte = bytes[i] ?? 0;
		if (byte < 0x80) {
			i += 1;
			continue;
		}
		const next = bytes[i + 1];
		pairs += 1;
		let ok = false;

		if (encoding === 'big5') {
			ok =
				next !== undefined &&
				byte >= 0x81 &&
				byte <= 0xfe &&
				((next >= 0x40 && next <= 0x7e) || (next >= 0xa1 && next <= 0xfe));
		} else if (encoding === 'shift_jis') {
			if (byte >= 0xa1 && byte <= 0xdf) {
				i += 1;
				continue;
			}
			ok =
				next !== undefined &&
				byte >= 0x81 &&
				byte <= 0xef &&
				next >= 0x40 &&
				next <= 0xfc &&
				next !== 0x7f;
		} else if (encoding === 'euc-kr') {
			ok = next !== undefined && byte >= 0x81 && byte <= 0xfe && next >= 0x41 && next <= 0xfe;
		} else if (encoding === 'gb18030') {
			ok = next !== undefined && byte >= 0x81 && byte <= 0xfe && next >= 0x40 && next <= 0xfe && next !== 0x7f;
			if (!ok) {
				const second = bytes[i + 2];
				const third = bytes[i + 3];
				if (
					next !== undefined &&
					next >= 0x30 &&
					next <= 0x39 &&
					second !== undefined &&
					second >= 0x81 &&
					second <= 0xfe &&
					third !== undefined &&
					third >= 0x30 &&
					third <= 0x39
				) {
					ok = true;
					i += 4;
					continue;
				}
			}
		} else {
			return 0;
		}

		if (!ok) invalid += 1;
		i += 2;
	}

	return pairs > 0 ? invalid / pairs : 0;
}

function scoreCandidate(
	encoding: SubtitleEncodingId,
	bytes: Uint8Array,
	metrics: TextMetrics,
	cues: ParsedCueBlock[],
	bomEncoding: SubtitleEncodingId | null,
	utf16Pattern: SubtitleEncodingId | null,
	utf8Valid: boolean,
): CandidateScore {
	const length = Math.max(1, metrics.length);
	let score = 60;

	score -= Math.min((metrics.replacementCount / length) * 260, 60);
	score -= Math.min(metrics.replacementCount * 3, 60);
	score -= Math.min((metrics.controlCount / length) * 200, 45);
	score -= Math.min((metrics.puaCount / length) * 300, 60);
	score -= Math.min((metrics.garbageSymbolCount / length) * 300, 45);
	score -= Math.min((metrics.halfwidthKatakanaCount / length) * 250, 45);
	score -= Math.min(metrics.rareCjkCount * 2, 12);
	score -= Math.min(invalidPairRatio(bytes, encoding) * 110, 45);
	score += cues.length > 0 ? Math.min(cues.length * 4, 12) : -25;

	const letters = Math.max(1, totalLetterCount(metrics));

	if (encoding === 'gb18030' || encoding === 'big5') {
		const cjkCoverage = (metrics.cjkCount + metrics.cjkPunctCount) / length;
		const commonCount =
			encoding === 'gb18030' ? metrics.commonSimplifiedCount : metrics.commonTraditionalCount;
		const commonRatio = metrics.cjkCount > 0 ? commonCount / metrics.cjkCount : 0;
		score += Math.min(cjkCoverage * 40, 20) + commonRatio * 45;
	}

	if (encoding === 'shift_jis') {
		score += Math.min((metrics.hiraganaCount / length) * 120, 32);
		score += Math.min((metrics.katakanaCount / length) * 70, 18);
		if (metrics.cjkCount > 5) score += 8;
	}

	if (encoding === 'euc-kr') {
		score += Math.min((metrics.hangulCount / length) * 70, 25);
		if (metrics.hangulCount > 0) {
			score += (metrics.commonHangulCount / metrics.hangulCount) * 45;
		}
	}

	if (encoding === 'windows-1251') {
		const coverage = metrics.cyrillicWordLetters / letters;
		if (coverage >= 0.25) score += Math.min(coverage * 80, 50);
		const upperRatio = metrics.cyrillicCount > 0 ? metrics.cyrillicUpperCount / metrics.cyrillicCount : 0;
		score -= Math.max(0, upperRatio - 0.2) * 100;
	}

	if (encoding === 'windows-1256') {
		const coverage = metrics.arabicWordLetters / letters;
		if (coverage >= 0.3) score += Math.min(coverage * 80, 50);
	}

	if (encoding === 'windows-1252' || encoding === 'windows-1250') {
		const accentWordRatio =
			metrics.latinWordCount > 0 ? metrics.accentedWordCount / metrics.latinWordCount : 0;
		score += Math.min(accentWordRatio * 50, 18);
		score -= Math.min(metrics.soupWordCount * 4, 20);
		const centralRatio = metrics.centralLetterCount / letters;
		const westRatio = metrics.westLetterCount / letters;
		if (encoding === 'windows-1252') {
			score += Math.min(westRatio * 250, 14) + 4;
			if (centralRatio > 0.03) score -= 8;
		} else {
			score += Math.min(westRatio * 250, 10);
			score += Math.min(Math.max(0, centralRatio - 0.01) * 350, 22);
		}
	}

	if (encoding === 'utf-16le' || encoding === 'utf-16be') {
		score += utf16Pattern === encoding ? 28 : -45;
		if (bomEncoding === encoding) score += 12;
	}

	if (encoding === 'utf-8' && metrics.controlCount > 0 && metrics.controlCount / length > 0.2) {
		score -= 15;
	}

	return {
		score,
		reason: describeCandidate(encoding, metrics, cues, bomEncoding, utf16Pattern, utf8Valid),
	};
}

function describeCandidate(
	encoding: SubtitleEncodingId,
	metrics: TextMetrics,
	cues: ParsedCueBlock[],
	bomEncoding: SubtitleEncodingId | null,
	utf16Pattern: SubtitleEncodingId | null,
	utf8Valid: boolean,
): string {
	if (bomEncoding === encoding) return 'A byte order mark at the start of the file confirms this encoding.';
	if (utf16Pattern === encoding) return 'Alternating NUL bytes match UTF-16 text with ASCII punctuation.';
	if ((encoding === 'utf-16le' || encoding === 'utf-16be') && utf16Pattern !== encoding) {
		return 'No UTF-16 byte pattern or byte order mark was found.';
	}
	if (metrics.replacementCount > 0) {
		return `${metrics.replacementCount} replacement characters appear, so this mapping loses text.`;
	}
	if (metrics.controlCount > 0) return 'Decoded text contains control characters that a subtitle should not include.';
	if (metrics.soupWordCount > 0) return 'Accented symbols appear in unreadable runs, which suggests the wrong code page.';
	if (cues.length === 0) return 'No SRT or VTT cue structure was readable with this encoding.';

	if (encoding === 'gb18030' && metrics.cjkCount > 0) {
		return 'CJK ideographs with common Simplified Chinese characters match GB18030.';
	}
	if (encoding === 'big5' && metrics.cjkCount > 0) {
		return 'Traditional Chinese ideographs with common characters match Big5.';
	}
	if (encoding === 'shift_jis' && (metrics.hiraganaCount > 0 || metrics.katakanaCount > 0)) {
		return 'Hiragana and katakana text matches Shift-JIS.';
	}
	if (encoding === 'euc-kr' && metrics.hangulCount > 0) {
		return 'Hangul syllables match EUC-KR.';
	}
	if (encoding === 'windows-1251' && metrics.cyrillicWordLetters > 0) {
		return 'Cyrillic word runs match Windows-1251.';
	}
	if (encoding === 'windows-1256' && metrics.arabicWordLetters > 0) {
		return 'Arabic word runs match Windows-1256.';
	}
	if (encoding === 'windows-1250' && metrics.centralLetterCount > 0) {
		return 'Central European letters match Windows-1250.';
	}
	if (encoding === 'windows-1252' && metrics.westLetterCount > 0) {
		return 'Western European accents match Windows-1252.';
	}
	if (encoding === 'utf-8') {
		return utf8Valid
			? 'Valid UTF-8 bytes, but the text shows no script-specific signal.'
			: 'Bytes did not pass strict UTF-8 validation.';
	}
	if (encoding === 'utf-16le' || encoding === 'utf-16be') {
		return 'No UTF-16 byte pattern or byte order mark was found.';
	}
	return 'No strong script signal, so the score reflects byte compatibility only.';
}

function previewMojibakeText(bytes: Uint8Array): string {
	const utf8 = decodeText(bytes, 'utf-8');
	const metrics = computeMetrics(utf8);
	const ratio = metrics.replacementCount / Math.max(1, metrics.length);
	return ratio > 0.2 ? decodeText(bytes, 'windows-1252') : utf8;
}

function displayScore(raw: number): number {
	if (!Number.isFinite(raw) || raw <= 0) return 0;
	const bounded = raw <= 100 ? raw : 100 - 8 * (1 - Math.exp(-(raw - 100) / 40));
	return Math.round(bounded * 10) / 10;
}

function summarizePreview(cues: ParsedCueBlock[], fallback: string): string {
	if (cues.length > 0) {
		return cues
			.slice(0, PREVIEW_LIMIT)
			.map((cue) => cue.lines.join(' ').trim())
			.filter((line) => line.length > 0)
			.join('\n');
	}
	return fallback
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.slice(0, PREVIEW_LIMIT)
		.join('\n');
}

export function analyzeSubtitleEncoding(input: ArrayBuffer | Uint8Array): EncodingAnalysisResult {
	const bytes = toUint8Array(input);
	const bomEncoding = detectBom(bytes);
	const utf16Pattern = detectUtf16Pattern(bytes);
	const rawText = previewMojibakeText(bytes);
	const rawCues = parseCueBlocks(rawText);
	const rawPreview = summarizePreview(rawCues, rawText);

	const strictUtf8 = isConvertibleUtf8(bytes);
	const pureAscii = !hasHighBytes(bytes) && !hasNulBytes(bytes);
	const utf8Priority = pureAscii || (strictUtf8 && !hasNulBytes(bytes));

	const scored: Array<{ candidate: EncodingCandidate; rawScore: number }> = SUPPORTED_ENCODINGS.map((meta) => {
		const decodedText = decodeText(bytes, meta.id);
		const metrics = computeMetrics(decodedText);
		const cues = parseCueBlocks(decodedText);
		const scoredCandidate = scoreCandidate(
			meta.id,
			bytes,
			metrics,
			cues,
			bomEncoding,
			utf16Pattern,
			strictUtf8,
		);
		const replacementRatio = metrics.replacementCount / Math.max(1, metrics.length);

		let score = scoredCandidate.score;
		let reason = scoredCandidate.reason;
		if (bomEncoding === meta.id) {
			score = Math.max(score, 100);
		} else if (bomEncoding) {
			score = Math.min(score, 96);
		} else if (utf16Pattern === meta.id) {
			score = Math.max(score, 100);
		} else if (utf16Pattern) {
			score = Math.min(score, 96);
		} else if (utf8Priority && meta.id === 'utf-8') {
			score = 100;
			reason = pureAscii
				? 'The file is pure ASCII, so UTF-8 matches every byte.'
				: 'Strict UTF-8 validation passed with non-ASCII characters.';
		} else if (utf8Priority) {
			score = Math.min(score, 96);
		}

		return {
			rawScore: score,
			candidate: {
				encoding: meta.id,
				label: meta.label,
				region: meta.region,
				score: displayScore(score),
				replacementCount: metrics.replacementCount,
				replacementRatio,
				decodedText,
				previewCues: buildPreviewPairs(rawCues, cues),
				isRecommended: false,
				reason,
				bomDetected: bomEncoding === meta.id,
			},
		};
	});

	scored.sort((a, b) => b.rawScore - a.rawScore);
	const candidates = scored.map((entry) => entry.candidate);
	const recommended = candidates[0];
	if (recommended) recommended.isRecommended = true;

	return {
		byteLength: bytes.length,
		bomEncoding,
		recommendedEncoding: recommended ? recommended.encoding : 'utf-8',
		rawMojibakePreview: rawPreview,
		candidates,
	};
}

export function decodeSubtitleBytes(
	input: ArrayBuffer | Uint8Array,
	encoding: SubtitleEncodingId,
): {
	text: string;
	replacementCount: number;
	replacementRatio: number;
	previewCues: PreviewCuePair[];
	qc: TimelineQcReport;
} {
	const bytes = toUint8Array(input);
	const text = decodeText(bytes, encoding);
	const metrics = computeMetrics(text);
	const decodedCues = parseCueBlocks(text);
	const rawCues = parseCueBlocks(previewMojibakeText(bytes));
	const replacementRatio = metrics.replacementCount / Math.max(1, metrics.length);

	return {
		text,
		replacementCount: metrics.replacementCount,
		replacementRatio,
		previewCues: buildPreviewPairs(rawCues, decodedCues),
		qc: runQcOnDecodedSubtitle(text),
	};
}

export function runQcOnDecodedSubtitle(text: string): TimelineQcReport {
	const cues = toSubtitleCues(parseCueBlocks(text));
	return buildQcReport({
		issues: analyzeCues(cues),
		checkedSegments: cues.length,
		emittedCues: cues.length,
		omittedSegments: 0,
		omittedCues: 0,
	});
}

export function exportFixedSubtitleText(
	text: string,
	options: ExportEncodingOptions,
): ExportEncodingResult {
	const stripped = text.replace(/^\uFEFF/, '');
	const lf = stripped.replace(/\r\n?/g, '\n');
	const normalized = options.lineEnding === 'crlf' ? lf.replace(/\n/g, '\r\n') : lf;
	const payload = options.bom ? `\uFEFF${normalized}` : normalized;
	const bytes = new TextEncoder().encode(payload);
	return {
		text: payload,
		bytes,
		byteLength: bytes.length,
		bom: options.bom,
		lineEnding: options.lineEnding,
	};
}

export function buildEncodingSampleBytes(preset: 'gbk-zh' | 'cp1251-ru' | 'shift-jis-ja' | 'cp1252-fr'): {
	filename: string;
	expectedEncoding: SubtitleEncodingId;
	description: string;
	bytes: Uint8Array;
} {
	const table = {
		'gbk-zh': {
			filename: 'sample-gbk-zh.srt',
			expectedEncoding: 'gb18030' as SubtitleEncodingId,
			description: 'Simplified Chinese SRT in GBK with a 0.2 s overlap between cues 1 and 2.',
		},
		'cp1251-ru': {
			filename: 'sample-cp1251-ru.srt',
			expectedEncoding: 'windows-1251' as SubtitleEncodingId,
			description: 'Russian SRT in Windows-1251 with clean cue timing.',
		},
		'shift-jis-ja': {
			filename: 'sample-shift-jis-ja.srt',
			expectedEncoding: 'shift_jis' as SubtitleEncodingId,
			description: 'Japanese SRT in Shift-JIS with clean cue timing.',
		},
		'cp1252-fr': {
			filename: 'sample-cp1252-fr.srt',
			expectedEncoding: 'windows-1252' as SubtitleEncodingId,
			description: 'French SRT in Windows-1252 with clean cue timing.',
		},
	};
	const entry = table[preset];
	return { ...entry, bytes: hexToBytes(SAMPLE_BYTES[preset]) };
}
