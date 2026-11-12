import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const svgPath = path.join(projectRoot, 'public', 'og-image.svg');
const ogPngPath = path.join(projectRoot, 'public', 'og-image.png');
const ghPngPath = path.join(projectRoot, 'public', 'github-social-preview.png');

async function render() {
	const svgContent = readFileSync(svgPath, 'utf8');
	const base64Svg = Buffer.from(svgContent, 'utf8').toString('base64');
	const dataUri = `data:image/svg+xml;base64,${base64Svg}`;

	const browser = await chromium.launch({ headless: true });

	try {
		// 1. Render 1200x630 og-image.png
		const pageOg = await browser.newPage({
			viewport: { width: 1200, height: 630 },
			deviceScaleFactor: 1,
		});
		await pageOg.setContent(`
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="utf-8" />
				<style>
					* { margin: 0; padding: 0; box-sizing: border-box; }
					html, body {
						width: 1200px;
						height: 630px;
						overflow: hidden;
						background: #0f172a;
					}
					img {
						width: 1200px;
						height: 630px;
						display: block;
					}
				</style>
			</head>
			<body>
				<img src="${dataUri}" alt="JSON to SRT social preview" />
			</body>
			</html>
		`);
		await pageOg.screenshot({
			path: ogPngPath,
			type: 'png',
			clip: { x: 0, y: 0, width: 1200, height: 630 },
		});
		await pageOg.close();
		console.log(`Rendered ${ogPngPath} (1200x630)`);

		// 2. Render 1280x640 github-social-preview.png
		const pageGh = await browser.newPage({
			viewport: { width: 1280, height: 640 },
			deviceScaleFactor: 1,
		});
		await pageGh.setContent(`
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="utf-8" />
				<style>
					* { margin: 0; padding: 0; box-sizing: border-box; }
					html, body {
						width: 1280px;
						height: 640px;
						overflow: hidden;
						background: #0f172a;
						display: flex;
						align-items: center;
						justify-content: center;
					}
					img {
						width: 1200px;
						height: 630px;
						display: block;
					}
				</style>
			</head>
			<body>
				<img src="${dataUri}" alt="JSON to SRT GitHub social preview" />
			</body>
			</html>
		`);
		await pageGh.screenshot({
			path: ghPngPath,
			type: 'png',
			clip: { x: 0, y: 0, width: 1280, height: 640 },
		});
		await pageGh.close();
		console.log(`Rendered ${ghPngPath} (1280x640)`);
	} finally {
		await browser.close();
	}
}

render().catch((err) => {
	console.error('Failed to render social cards:', err);
	process.exit(1);
});
