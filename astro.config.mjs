import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

const siteUrl = (process.env.PUBLIC_SITE_URL || 'https://jsontosrt.com').replace(/\/$/, '');

export default defineConfig({
	site: siteUrl,
	output: 'static',
	trailingSlash: 'always',
	integrations: [
		sitemap({
			filter: (page) => !page.endsWith('/404/'),
		}),
	],
	vite: {
		plugins: [tailwindcss()],
	},
	build: {
		format: 'directory',
	},
});
