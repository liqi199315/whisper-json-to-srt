export type AnalyticsParamValue = string | number | boolean;
export type AnalyticsEventParams = Record<string, AnalyticsParamValue>;

type GtagEventFn = (
	command: 'event',
	eventName: string,
	params?: AnalyticsEventParams,
) => void;

type AnalyticsBrowserWindow = Window & {
	gtag?: GtagEventFn;
};

const BLOCKED_PARAM_KEYS = new Set([
	'body',
	'content',
	'contents',
	'file',
	'file_content',
	'file_contents',
	'file_name',
	'file_path',
	'filecontent',
	'filename',
	'filepath',
	'payload',
	'raw_json',
	'rawjson',
	'subtitle_text',
	'text',
	'transcript',
	'transcript_text',
]);

const FILENAME_VALUE_PATTERN = /[A-Za-z0-9_-]+\.(?:json|srt|vtt|txt|csv|mp3|mp4|wav|m4a)$/i;
const SENSITIVE_VALUE_PATTERN = /(?:@|:\/\/|\\|-->|(?:token|secret|password))/i;

function isSafeStringParam(value: string): boolean {
	const trimmed = value.trim();
	if (trimmed.length === 0 || trimmed.length > 120) {
		return false;
	}
	if (/[\r\n]/.test(trimmed)) {
		return false;
	}
	if (
		(trimmed.startsWith('{') && trimmed.endsWith('}')) ||
		(trimmed.startsWith('[') && trimmed.endsWith(']'))
	) {
		return false;
	}
	if (FILENAME_VALUE_PATTERN.test(trimmed) || SENSITIVE_VALUE_PATTERN.test(trimmed)) {
		return false;
	}
	return true;
}

export function sanitizeAnalyticsParams(
	params?: Record<string, string | number | boolean>,
): AnalyticsEventParams | undefined {
	if (!params) {
		return undefined;
	}

	const sanitized: AnalyticsEventParams = {};
	for (const [key, value] of Object.entries(params)) {
		const normalizedKey = key.trim().toLowerCase();
		if (!normalizedKey || BLOCKED_PARAM_KEYS.has(normalizedKey)) {
			continue;
		}
		if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key)) {
			continue;
		}
		if (typeof value === 'boolean') {
			sanitized[key] = value;
		} else if (typeof value === 'number' && Number.isFinite(value)) {
			sanitized[key] = value;
		} else if (typeof value === 'string' && isSafeStringParam(value)) {
			sanitized[key] = value.trim();
		}
	}
	return sanitized;
}

export function trackToolEvent(
	eventName: string,
	params?: Record<string, string | number | boolean>,
): void {
	if (typeof window === 'undefined') {
		return;
	}
	const safeEventName = eventName.trim();
	if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(safeEventName)) {
		return;
	}

	try {
		const browserWindow = window as AnalyticsBrowserWindow;
		const safeParams = sanitizeAnalyticsParams(params);
		if (safeParams !== undefined) {
			browserWindow.gtag?.('event', safeEventName, safeParams);
		} else {
			browserWindow.gtag?.('event', safeEventName);
		}
	} catch {
		return;
	}
}
