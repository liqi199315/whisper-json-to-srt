#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ID = 'whisperjsontosrt';
const DEFAULT_SITE_URL = 'https://jsontosrt.com';
const EXPECTED_WORKSPACE_REPO = '30_products/whisper-json-to-srt';
const SITEMAP_FILE = 'sitemap-0.xml';
const RELEASE_FILE = 'release.json';
const SCHEMA_VERSION = 1;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.resolve(projectRoot, process.argv[2] || 'dist');
const sharedScript = path.resolve(
	projectRoot,
	'../../40_shared/scripts/indie-release-manifest.mjs',
);

function canUseSharedWorkspaceManifest() {
	if (!existsSync(sharedScript)) {
		return false;
	}
	try {
		const workspaceRoot = path.resolve(path.dirname(sharedScript), '../..');
		const expectedRepoDir = path.resolve(workspaceRoot, EXPECTED_WORKSPACE_REPO);
		if (!existsSync(expectedRepoDir)) {
			return false;
		}
		return realpathSync(projectRoot) === realpathSync(expectedRepoDir);
	} catch {
		return false;
	}
}

function normalizeRoute(value) {
	const raw = String(value || '').trim();
	if (!raw) return raw;
	try {
		const url = new URL(raw);
		let pathname = url.pathname || '/';
		if (!pathname.endsWith('/')) pathname = `${pathname}/`;
		return `${url.origin}${pathname}`;
	} catch {
		return raw;
	}
}

function parseSitemapUrls(xml) {
	const urls = [];
	const pattern = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
	for (const match of String(xml).matchAll(pattern)) {
		urls.push(normalizeRoute(match[1]));
	}
	return [...new Set(urls)].sort();
}

function routeHtmlPath(targetDist, siteUrl, route) {
	const pathname = new URL(route, siteUrl).pathname;
	const relFile = pathname.endsWith('/')
		? `${pathname}index.html`
		: pathname.endsWith('.html')
			? pathname
			: `${pathname}/index.html`;
	return path.join(targetDist, relFile.replace(/^\/+/, ''));
}

function runGit(cwd, args) {
	return spawnSync('git', args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
}

function gitOrThrow(cwd, args, message) {
	const result = runGit(cwd, args);
	if (result.status !== 0) {
		const detail = String(result.stderr || result.stdout || '').trim();
		throw new Error(detail ? `${message}: ${detail}` : message);
	}
	return String(result.stdout || '').trim();
}

function parsePorcelainPath(line) {
	const body = /^.. /.test(line) ? line.slice(3) : line;
	const parts = body.split(' -> ');
	return parts[parts.length - 1].replace(/^"|"$/g, '');
}

function readGitSource(repoDir) {
	const toplevel = gitOrThrow(repoDir, ['rev-parse', '--show-toplevel'], 'git rev-parse failed');
	const commit = gitOrThrow(toplevel, ['rev-parse', 'HEAD'], 'git rev-parse HEAD failed');
	const branch = gitOrThrow(
		toplevel,
		['rev-parse', '--abbrev-ref', 'HEAD'],
		'git branch lookup failed',
	);
	const upstreamResult = runGit(toplevel, [
		'rev-parse',
		'--abbrev-ref',
		'--symbolic-full-name',
		'@{upstream}',
	]);
	const upstream =
		upstreamResult.status === 0 ? String(upstreamResult.stdout || '').trim() || null : null;
	let ahead = 0;
	let behind = 0;
	if (upstream) {
		const counts = gitOrThrow(
			toplevel,
			['rev-list', '--left-right', '--count', `${upstream}...HEAD`],
			'git ahead/behind lookup failed',
		);
		const [behindText, aheadText] = counts.split(/\s+/);
		behind = Number.parseInt(behindText, 10) || 0;
		ahead = Number.parseInt(aheadText, 10) || 0;
	}
	const statusResult = runGit(toplevel, ['status', '--porcelain']);
	if (statusResult.status !== 0) {
		const detail = String(statusResult.stderr || statusResult.stdout || '').trim();
		throw new Error(detail ? `git status failed: ${detail}` : 'git status failed');
	}
	const dirtyPaths = String(statusResult.stdout || '')
		.replace(/\n$/, '')
		.split(/\n/)
		.filter((line) => line.length > 0)
		.map(parsePorcelainPath)
		.sort();

	return {
		commit,
		branch,
		upstream,
		ahead,
		behind,
		dirtyPaths,
	};
}

if (canUseSharedWorkspaceManifest()) {
	const delegated = spawnSync(
		process.execPath,
		[sharedScript, '--project', PROJECT_ID, '--dist', distDir, '--write'],
		{
			cwd: projectRoot,
			stdio: 'inherit',
		},
	);
	process.exit(delegated.status ?? 1);
}

if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
	throw new Error(`Missing dist directory: ${distDir}`);
}

const sitemapPath = path.join(distDir, SITEMAP_FILE);
if (!existsSync(sitemapPath)) {
	throw new Error(`Missing ${SITEMAP_FILE} in ${distDir}. Refusing to invent routes.`);
}

const siteUrl = (process.env.PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, '');
const sitemapXml = readFileSync(sitemapPath, 'utf8');
const routes = parseSitemapUrls(sitemapXml);
if (routes.length === 0) {
	throw new Error(`${SITEMAP_FILE} has no <loc> URLs.`);
}

const configuredMeasurementId = (process.env.PUBLIC_GA4_MEASUREMENT_ID || '').trim();
if (configuredMeasurementId.length > 0) {
	const missing = routes.filter((route) => {
		const htmlPath = routeHtmlPath(distDir, siteUrl, route);
		return !existsSync(htmlPath) || !readFileSync(htmlPath, 'utf8').includes(configuredMeasurementId);
	});
	if (missing.length > 0) {
		const shown = missing.slice(0, 3).join(', ');
		const more = missing.length > 3 ? `, and ${missing.length - 3} more` : '';
		throw new Error(
			`GA4 measurement ID ${configuredMeasurementId} is missing from ${missing.length} built route(s): ${shown}${more}.`,
		);
	}
}

const source = readGitSource(projectRoot);
const manifest = {
	schemaVersion: SCHEMA_VERSION,
	project: PROJECT_ID,
	siteUrl,
	measurementId: configuredMeasurementId || 'G-PENDING000',
	builtAt: new Date().toISOString(),
	source,
	routes,
	routeCount: routes.length,
	sitemapSha256: createHash('sha256').update(sitemapXml).digest('hex'),
};

const outPath = path.join(distDir, RELEASE_FILE);
writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
const relOut = path.relative(projectRoot, outPath) || outPath;
console.log(
	`${manifest.project} wrote ${relOut}: ${manifest.routeCount} routes, commit ${manifest.source.commit.slice(0, 12)}`,
);
