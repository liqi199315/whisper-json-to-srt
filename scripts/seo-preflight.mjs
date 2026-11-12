import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_SITE_ORIGIN = 'https://jsontosrt.com';

function resolveSiteOrigin(originOverride) {
	return (originOverride || process.env.PUBLIC_SITE_URL || DEFAULT_SITE_ORIGIN).replace(/\/$/, '');
}

const ROUTE_DEFINITIONS = [
	{
		route: '/',
		file: 'index.html',
		kind: 'tool',
		requiredAllSchemas: ['WebApplication', 'FAQPage'],
	},
	{
		route: '/whisper-verbose-json-to-srt/',
		file: 'whisper-verbose-json-to-srt/index.html',
		kind: 'tool',
		requiredAllSchemas: ['WebApplication', 'FAQPage'],
	},
	{
		route: '/whisper-json-to-vtt/',
		file: 'whisper-json-to-vtt/index.html',
		kind: 'tool',
		requiredAllSchemas: ['WebApplication', 'FAQPage'],
	},
	{
		route: '/whisperx-diarized-json-to-srt/',
		file: 'whisperx-diarized-json-to-srt/index.html',
		kind: 'tool',
		requiredAllSchemas: ['WebApplication', 'FAQPage'],
	},
	{
		route: '/whisper-cpp-json-to-srt/',
		file: 'whisper-cpp-json-to-srt/index.html',
		kind: 'tool',
		requiredAllSchemas: ['WebApplication', 'FAQPage'],
	},
	{
		route: '/short-video-caption-splitter/',
		file: 'short-video-caption-splitter/index.html',
		kind: 'tool',
		requiredAllSchemas: ['WebApplication', 'FAQPage'],
	},
	{
		route: '/about/',
		file: 'about/index.html',
		kind: 'trust',
		requiredAnySchemas: ['Organization', 'BreadcrumbList', 'WebApplication'],
	},
	{
		route: '/privacy/',
		file: 'privacy/index.html',
		kind: 'trust',
		requiredAnySchemas: ['Organization', 'BreadcrumbList', 'WebApplication'],
	},
	{
		route: '/terms/',
		file: 'terms/index.html',
		kind: 'trust',
		requiredAnySchemas: ['Organization', 'BreadcrumbList', 'WebApplication'],
	},
];

function buildContentRoutes(siteOrigin) {
	return ROUTE_DEFINITIONS.map((definition) => ({
		...definition,
		canonical: `${siteOrigin}${definition.route}`,
	}));
}

export const CONTENT_ROUTES = buildContentRoutes(resolveSiteOrigin());

export const EXTRA_REQUIRED_FILES = [
	'404.html',
	'sitemap-index.xml',
	'robots.txt',
	'llms.txt',
	'_headers',
	'og-image.svg',
	'og-image.png',
	'github-social-preview.png',
	'site.webmanifest',
	'indexnow-key.txt',
	'a8f4c2e91b7d40639e5a12c8d4f07b31.txt',
];

const LONG_DASH_PATTERN = /[\u2013\u2014]|&(?:mdash|ndash|#8211|#8212|#x2013|#x2014);/i;
const FILLER_LATIN_PATTERN = new RegExp(`lor${'em'}\\s+ip${'sum'}`, 'i');
const OPEN_BRACE_PAIR = '{'.repeat(2);
const CLOSE_BRACE_PAIR = '}'.repeat(2);
const MARKER_TO_DO = `TO${'DO'}`;
const MARKER_FIX_ME = `FIX${'ME'}`;

function isExistingFile(filePath) {
	try {
		return existsSync(filePath) && statSync(filePath).isFile();
	} catch {
		return false;
	}
}

function walkHtmlFiles(dirPath, rootDir = dirPath, acc = []) {
	if (!existsSync(dirPath)) {
		return acc;
	}
	for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
		const fullPath = path.join(dirPath, entry.name);
		if (entry.isDirectory()) {
			walkHtmlFiles(fullPath, rootDir, acc);
		} else if (entry.isFile() && entry.name.endsWith('.html')) {
			acc.push(path.relative(rootDir, fullPath).split(path.sep).join('/'));
		}
	}
	return acc.sort();
}

function parseAttributes(attrSource) {
	const attrs = {};
	const attrRegex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
	let match;
	while ((match = attrRegex.exec(attrSource)) !== null) {
		const key = match[1].toLowerCase();
		const value = match[2] ?? match[3] ?? match[4] ?? '';
		attrs[key] = value;
	}
	return attrs;
}

function decodeBasicEntities(value) {
	return value
		.replace(/&quot;/g, '"')
		.replace(/&#34;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
}

function stripTags(html) {
	return decodeBasicEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function stripScriptsStylesAndComments(html) {
	return html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi);
}

function extractHeadSection(html) {
	const headMatch = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
	const raw = headMatch ? headMatch[1] : html;
	return stripScriptsStylesAndComments(raw).replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '');
}

function collectSchemaTypes(node, types) {
	if (Array.isArray(node)) {
		for (const item of node) {
			collectSchemaTypes(item, types);
		}
		return;
	}
	if (node && typeof node === 'object') {
		const rawType = node['@type'];
		if (typeof rawType === 'string') {
			types.add(rawType);
		} else if (Array.isArray(rawType)) {
			for (const entry of rawType) {
				if (typeof entry === 'string') {
					types.add(entry);
				}
			}
		}
		for (const value of Object.values(node)) {
			collectSchemaTypes(value, types);
		}
	}
}

function collectJsonStrings(node, strings) {
	if (typeof node === 'string') {
		strings.push(node);
		return;
	}
	if (Array.isArray(node)) {
		for (const item of node) {
			collectJsonStrings(item, strings);
		}
		return;
	}
	if (node && typeof node === 'object') {
		for (const [key, value] of Object.entries(node)) {
			strings.push(key);
			collectJsonStrings(value, strings);
		}
	}
}

function checkForbiddenText(text, label, errors, checkBraces = true) {
	if (checkBraces && text.includes(OPEN_BRACE_PAIR)) {
		errors.push(`${label}: contains forbidden placeholder token "${OPEN_BRACE_PAIR}"`);
	}
	if (checkBraces && text.includes(CLOSE_BRACE_PAIR)) {
		errors.push(`${label}: contains forbidden placeholder token "${CLOSE_BRACE_PAIR}"`);
	}
	if (text.includes(MARKER_TO_DO)) {
		errors.push(`${label}: contains forbidden token "${MARKER_TO_DO}"`);
	}
	if (text.includes(MARKER_FIX_ME)) {
		errors.push(`${label}: contains forbidden token "${MARKER_FIX_ME}"`);
	}
	if (FILLER_LATIN_PATTERN.test(text)) {
		errors.push(`${label}: contains forbidden Latin filler copy`);
	}
	if (LONG_DASH_PATTERN.test(text)) {
		errors.push(`${label}: contains forbidden em-dash or en-dash character`);
	}
}

function inspectHtmlForbiddenTokens(rawHtml, relFile, errors) {
	checkForbiddenText(rawHtml, relFile, errors, false);

	const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
	let scriptMatch;
	while ((scriptMatch = scriptRegex.exec(rawHtml)) !== null) {
		const attrs = parseAttributes(scriptMatch[1]);
		if ((attrs.type ?? '').toLowerCase() === 'application/ld+json') {
			try {
				const parsed = JSON.parse(scriptMatch[2].trim());
				const jsonStrings = [];
				collectJsonStrings(parsed, jsonStrings);
				for (const str of jsonStrings) {
					checkForbiddenText(str, `${relFile} (JSON-LD)`, errors, true);
				}
			} catch {
				checkForbiddenText(scriptMatch[2], `${relFile} (raw JSON-LD)`, errors, true);
			}
		}
	}

	let markupOnly = stripScriptsStylesAndComments(rawHtml);
	markupOnly = markupOnly.replace(
		/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi,
		(fullMatch, attrPart, innerText) => {
			const decoded = decodeBasicEntities(innerText).trim();
			if (decoded.startsWith('{') || decoded.startsWith('[')) {
				try {
					const parsed = JSON.parse(decoded);
					const jsonStrings = [];
					collectJsonStrings(parsed, jsonStrings);
					for (const str of jsonStrings) {
						checkForbiddenText(str, `${relFile} (textarea JSON)`, errors, true);
					}
					return `<textarea${attrPart}></textarea>`;
				} catch {
					return fullMatch;
				}
			}
			return fullMatch;
		},
	);

	checkForbiddenText(markupOnly, relFile, errors, true);
}

function resolveInternalHref(distDir, href) {
	const rawPath = href.split('#')[0].split('?')[0];
	let decodedPath;
	try {
		decodedPath = decodeURIComponent(rawPath);
	} catch {
		return null;
	}

	const normalizedRoot = path.resolve(distDir);
	const rel = decodedPath.replace(/^\/+/, '');
	const candidates =
		decodedPath === '' || decodedPath === '/'
			? [path.resolve(normalizedRoot, 'index.html')]
			: decodedPath.endsWith('/')
				? [path.resolve(normalizedRoot, rel, 'index.html')]
				: [
						path.resolve(normalizedRoot, rel),
						path.resolve(normalizedRoot, rel, 'index.html'),
						path.resolve(normalizedRoot, `${rel}.html`),
					];

	for (const candidate of candidates) {
		const relative = path.relative(normalizedRoot, candidate);
		if (relative.startsWith('..') || path.isAbsolute(relative)) {
			return null;
		}
		if (isExistingFile(candidate)) {
			return candidate;
		}
	}
	return null;
}

export function inspectDist(distDir, options = {}) {
	const errors = [];
	const activeOrigin = resolveSiteOrigin(options.siteOrigin);
	const contentRoutes = buildContentRoutes(activeOrigin);

	const requiredFiles = [
		...contentRoutes.map((entry) => entry.file),
		...EXTRA_REQUIRED_FILES,
	];

	for (const relFile of requiredFiles) {
		const absPath = path.join(distDir, relFile);
		if (!isExistingFile(absPath)) {
			errors.push(`Missing required built file: dist/${relFile}`);
		} else if (statSync(absPath).size === 0) {
			errors.push(`Built file is empty: dist/${relFile}`);
		}
	}

	const seenTitles = new Map();
	const seenDescriptions = new Map();

	for (const routeEntry of contentRoutes) {
		const absPath = path.join(distDir, routeEntry.file);
		if (!isExistingFile(absPath)) {
			continue;
		}
		const html = readFileSync(absPath, 'utf8');
		const head = extractHeadSection(html);

		const titleMatches = [...head.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)];
		if (titleMatches.length !== 1) {
			errors.push(`${routeEntry.file}: expected exactly 1 <title>, found ${titleMatches.length}`);
		} else {
			const titleText = stripTags(titleMatches[0][1]);
			if (!titleText) {
				errors.push(`${routeEntry.file}: <title> must not be empty`);
			} else if (seenTitles.has(titleText)) {
				errors.push(
					`${routeEntry.file}: duplicate <title> "${titleText}" (already used in ${seenTitles.get(titleText)})`,
				);
			} else {
				seenTitles.set(titleText, routeEntry.file);
			}
		}

		const metaTags = [...head.matchAll(/<meta\b([^>]*)>/gi)].map((m) => parseAttributes(m[1]));
		const descriptionMetas = metaTags.filter(
			(attrs) => (attrs.name ?? '').toLowerCase() === 'description',
		);
		if (descriptionMetas.length !== 1) {
			errors.push(
				`${routeEntry.file}: expected exactly 1 <meta name="description">, found ${descriptionMetas.length}`,
			);
		} else {
			const desc = decodeBasicEntities(descriptionMetas[0].content ?? '').trim();
			if (!desc) {
				errors.push(`${routeEntry.file}: <meta name="description"> content must not be empty`);
			} else if (seenDescriptions.has(desc)) {
				errors.push(
					`${routeEntry.file}: duplicate meta description (already used in ${seenDescriptions.get(desc)})`,
				);
			} else {
				seenDescriptions.set(desc, routeEntry.file);
			}
		}

		const ogImageMetas = metaTags.filter(
			(attrs) =>
				(attrs.property ?? '').toLowerCase() === 'og:image' ||
				(attrs.name ?? '').toLowerCase() === 'og:image',
		);
		if (ogImageMetas.length !== 1) {
			errors.push(
				`${routeEntry.file}: expected exactly 1 <meta property="og:image">, found ${ogImageMetas.length}`,
			);
		} else {
			const ogImageContent = decodeBasicEntities(ogImageMetas[0].content ?? '').trim();
			if (!ogImageContent) {
				errors.push(`${routeEntry.file}: <meta property="og:image"> content must not be empty`);
			} else if (!ogImageContent.endsWith('/og-image.png')) {
				errors.push(
					`${routeEntry.file}: <meta property="og:image"> must point to a PNG ending in "/og-image.png", got "${ogImageContent}"`,
				);
			}
		}

		const linkTags = [...head.matchAll(/<link\b([^>]*)>/gi)].map((m) => parseAttributes(m[1]));
		const canonicalLinks = linkTags.filter((attrs) =>
			(attrs.rel ?? '').toLowerCase().split(/\s+/).includes('canonical'),
		);
		if (canonicalLinks.length !== 1) {
			errors.push(
				`${routeEntry.file}: expected exactly 1 <link rel="canonical">, found ${canonicalLinks.length}`,
			);
		} else if (canonicalLinks[0].href !== routeEntry.canonical) {
			errors.push(
				`${routeEntry.file}: canonical href "${canonicalLinks[0].href ?? ''}" does not match expected "${routeEntry.canonical}"`,
			);
		}

		const bodyWithoutScripts = stripScriptsStylesAndComments(html);
		const h1Matches = [...bodyWithoutScripts.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
		if (h1Matches.length !== 1) {
			errors.push(`${routeEntry.file}: expected exactly 1 <h1>, found ${h1Matches.length}`);
		} else if (!stripTags(h1Matches[0][1])) {
			errors.push(`${routeEntry.file}: <h1> text must not be empty`);
		}

		const ldScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(
			(m) => (parseAttributes(m[1]).type ?? '').toLowerCase() === 'application/ld+json',
		);
		if (ldScripts.length === 0) {
			errors.push(`${routeEntry.file}: missing <script type="application/ld+json">`);
		} else {
			const schemaTypes = new Set();
			for (const block of ldScripts) {
				try {
					const parsed = JSON.parse(block[2].trim());
					collectSchemaTypes(parsed, schemaTypes);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					errors.push(`${routeEntry.file}: invalid JSON-LD (${message})`);
				}
			}

			if (Array.isArray(routeEntry.requiredAllSchemas)) {
				for (const requiredType of routeEntry.requiredAllSchemas) {
					if (!schemaTypes.has(requiredType)) {
						errors.push(`${routeEntry.file}: JSON-LD missing required @type "${requiredType}"`);
					}
				}
			}

			if (Array.isArray(routeEntry.requiredAnySchemas)) {
				const matchedAny = routeEntry.requiredAnySchemas.some((candidate) =>
					schemaTypes.has(candidate),
				);
				if (!matchedAny) {
					errors.push(
						`${routeEntry.file}: JSON-LD must include at least one @type from [${routeEntry.requiredAnySchemas.join(', ')}]`,
					);
				}
			}
		}
	}

	const htmlFiles = walkHtmlFiles(distDir);
	let internalLinksChecked = 0;

	for (const relFile of htmlFiles) {
		const absPath = path.join(distDir, relFile);
		const html = readFileSync(absPath, 'utf8');
		inspectHtmlForbiddenTokens(html, `dist/${relFile}`, errors);

		const cleanHtml = stripScriptsStylesAndComments(html);
		for (const anchorMatch of cleanHtml.matchAll(/<a\b([^>]*)>/gi)) {
			const attrs = parseAttributes(anchorMatch[1]);
			const href = attrs.href;
			if (typeof href !== 'string' || !href.startsWith('/')) {
				continue;
			}
			if (href.startsWith('//')) {
				errors.push(`dist/${relFile}: protocol-relative internal link "${href}" is forbidden`);
				continue;
			}
			internalLinksChecked += 1;
			if (!resolveInternalHref(distDir, href)) {
				errors.push(`dist/${relFile}: internal link "${href}" does not resolve to a file in dist/`);
			}
		}
	}

	const llmsPath = path.join(distDir, 'llms.txt');
	if (isExistingFile(llmsPath)) {
		const llmsText = readFileSync(llmsPath, 'utf8');
		checkForbiddenText(llmsText, 'dist/llms.txt', errors, true);
	}

	const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	const pngFiles = ['og-image.png', 'github-social-preview.png'];
	for (const pngFile of pngFiles) {
		const pngPath = path.join(distDir, pngFile);
		if (isExistingFile(pngPath)) {
			const stat = statSync(pngPath);
			if (stat.size <= 5120) {
				errors.push(`dist/${pngFile}: file size (${stat.size} bytes) must be > 5 KB`);
			}
			const buf = readFileSync(pngPath);
			if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_MAGIC)) {
				errors.push(`dist/${pngFile}: invalid PNG magic bytes header`);
			}
		}
	}

	const indexNowPath = path.join(distDir, 'indexnow-key.txt');
	if (isExistingFile(indexNowPath)) {
		const key = readFileSync(indexNowPath, 'utf8').trim();
		if (!key) {
			errors.push('dist/indexnow-key.txt: key must not be empty');
		} else {
			const keyFilePath = path.join(distDir, `${key}.txt`);
			if (!isExistingFile(keyFilePath)) {
				errors.push(`Missing dual IndexNow key file: dist/${key}.txt`);
			} else {
				const keyContent = readFileSync(keyFilePath, 'utf8').trim();
				if (keyContent !== key) {
					errors.push(
						`dist/${key}.txt content ("${keyContent}") does not match dist/indexnow-key.txt ("${key}")`,
					);
				}
			}
		}
	}

	const headersPath = path.join(distDir, '_headers');
	if (isExistingFile(headersPath)) {
		const headersText = readFileSync(headersPath, 'utf8');
		if (/^https?:\/\//m.test(headersText)) {
			errors.push('dist/_headers: host-prefixed https:// rules are ignored by Workers Static Assets; use wrangler.jsonc workers_dev: false instead');
		}
		if (!headersText.includes('Content-Security-Policy:')) {
			errors.push('dist/_headers: missing Content-Security-Policy header');
		}
		if (!headersText.includes('Strict-Transport-Security:')) {
			errors.push('dist/_headers: missing Strict-Transport-Security header');
		}
	}

	const wranglerPath = path.resolve(distDir, '..', 'wrangler.jsonc');
	if (isExistingFile(wranglerPath)) {
		const rawWrangler = readFileSync(wranglerPath, 'utf8').replace(/^\s*\/\/.*$/gm, '');
		const wranglerCfg = JSON.parse(rawWrangler);
		if (wranglerCfg.workers_dev !== false || wranglerCfg.preview_urls !== false) {
			errors.push('wrangler.jsonc: workers_dev and preview_urls must both be false once custom domain is active');
		}
	}

	return {
		ok: errors.length === 0,
		siteOrigin: activeOrigin,
		routesChecked: contentRoutes.length,
		requiredFilesChecked: requiredFiles.length,
		htmlFilesChecked: htmlFiles.length,
		internalLinksChecked,
		errors,
	};
}

const isDirectExecution =
	Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectExecution) {
	const defaultDist = fileURLToPath(new URL('../dist', import.meta.url));
	const targetDist = process.argv[2] ? path.resolve(process.argv[2]) : defaultDist;
	const summary = inspectDist(targetDist);
	if (!summary.ok) {
		console.error(JSON.stringify(summary, null, 2));
		process.exit(1);
	}
	console.log(
		JSON.stringify(
			{
				ok: true,
				siteOrigin: summary.siteOrigin,
				routesChecked: summary.routesChecked,
				requiredFilesChecked: summary.requiredFilesChecked,
				htmlFilesChecked: summary.htmlFilesChecked,
				internalLinksChecked: summary.internalLinksChecked,
			},
			null,
			2,
		),
	);
}
