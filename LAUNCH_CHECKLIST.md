# Production Launch Checklist (`jsontosrt.com`)

Step-by-step copy-paste runbook. Email Routing, Bing Webmaster Tools, the shared analytics registry, and the report checks were completed on 2026-11-12 (see the live launch record). Remaining `[人工]` work is community launch posts from `LAUNCH_KIT.md` and an optional GitHub visibility change.

- **Repository path:** `/Users/dake/Projects/aiapp/30_products/whisper-json-to-srt`
- **Canonical domain:** `https://jsontosrt.com` (trademark-clean generic format domain; avoids third-party ASR brand names in the hostname)
- **Cloudflare Worker name:** `whisper-json-to-srt` (`wrangler.jsonc`)
- **Support inbox:** `hello@jsontosrt.com` and `privacy@jsontosrt.com` (Cloudflare Email Routing to `liqi199315@gmail.com`)
- **Shared analytics key:** `whisperjsontosrt` in `/Users/dake/Projects/aiapp/40_shared/analytics-sites.yaml`

---

## Live launch record (2026-11-12)

- Production: `https://jsontosrt.com`, Worker `whisper-json-to-srt`, version `1e1de410-8c17-4e72-8ead-b922a1cc0f61`; `www` redirects to the canonical domain with HTTP 301.
- GA4 property `564001579`, stream `16325797678`, measurement ID `G-085WZLBQ8F`. Retention is 14 months with reset enabled; site search and form interaction enhanced measurement are disabled; `subtitle_export` is a key event.
- Google domain ownership verified for the service account and `liqi199315@gmail.com`; Search Console property `sc-domain:jsontosrt.com` registered. Sitemap submission returned HTTP 204 and readback returned HTTP 200 with processing pending.
- IndexNow accepted 9 URLs with HTTP 202. Googlebot, AdsBot-Google, Bingbot, OAI-SearchBot, ChatGPT-User and PerplexityBot each received HTTP 200. Live HTML contains the measurement ID.
- Local `verify:all` passed with 29 unit tests and 6 Chromium E2E tests; launch preflight and SEO check returned `ok: true`.
- Cloudflare zone `58c1590cb36fa9e33c7e66176d01f600` (`jsontosrt.com`) is `active`. Email Routing is `enabled: true, status: ready`. `hello@jsontosrt.com` and `privacy@jsontosrt.com` forward to `liqi199315@gmail.com`. MX, SPF, DKIM, and `_dmarc` TXT records are locked.
- Registered as `whisperjsontosrt` in `../../40_shared/analytics-sites.yaml` (`ga4_property_id: "564001579"`, `G-085WZLBQ8F`, `sc-domain:jsontosrt.com`, `https://jsontosrt.com/`).
- Bing Webmaster Tools verified (`IsVerified: true` via Cloudflare unproxied `verify.bing.com` CNAME). Sitemap `https://jsontosrt.com/sitemap-index.xml` submitted via `SubmitFeed`.
- `ga4-report.mjs`, `gsc-report.mjs`, `bing-report.mjs`, and `analytics-registry.test.mjs` all exited `0`.
- Search engine submission does not establish indexing. Google sitemap processing is still pending.
- `[人工]` remaining: manual community launch posts from `LAUNCH_KIT.md` (Show HN, Reddit, X, Product Hunt) and toggling GitHub repo visibility if desired (currently private `https://github.com/liqi199315/whisper-json-to-srt`).

---

## Step 1. Run local verification and refresh workspace inventory

Run the full local gate and update `_ops/projects.yaml` / `_ops/projects.json` for `30_products/whisper-json-to-srt`:

```bash
cd /Users/dake/Projects/aiapp/30_products/whisper-json-to-srt
npm run verify:all
python3 /Users/dake/Projects/aiapp/_ops/generate-project-index.py
```

Confirm Vitest, `astro build`, `scripts/seo-preflight.mjs` (9 routes + 11 auxiliary files), and Playwright (6/6 Chromium tests) all exit `0`.

---

## Step 2. Purchase `jsontosrt.com` and attach to Cloudflare DNS

> Note: Cloudflare zone bootstrap, SSL settings, email routing records, and custom domain bindings can now be automated via `_ops/research/indie-site-workflow-20261112/tools/cf-zone-bootstrap.mjs`.

1. Open **Cloudflare Dashboard -> Domain Registration -> Register Domains** (recommended for at-cost wholesale `.com` renewal, automatic DNSSEC, and free WHOIS redaction).
   - Alternative registrars if registering externally: **Spaceship** or **Porkbun**, then delegate nameservers to Cloudflare.
2. Register `jsontosrt.com` and ensure the zone is **Active** inside your Cloudflare account.
3. Under **SSL/TLS -> Overview**, set encryption mode to **Full (strict)** and enable **Always Use HTTPS** under **SSL/TLS -> Edge Certificates**.

---

## Step 3. Create GA4 Web Data Stream (get the measurement ID before production build)

**Completed 2026-11-12.** Property `564001579`, stream `16325797678`, measurement ID `G-085WZLBQ8F`. Do not create a second property. The numbered steps below are the historical procedure.

1. Open **Google Analytics Admin** and create property `jsontosrt.com` (reporting time zone and USD currency).
2. Disable **Google Signals data collection** and **Ads Personalization** under **Data collection and modifications -> Data collection** so telemetry matches `/privacy/`.
3. Create a **Web Data Stream** for `https://jsontosrt.com` (`Stream name: jsontosrt.com`).
4. Copy two public identifiers (never commit credentials):
   - **Measurement ID:** the `G-` ID from the web data stream (live value `G-085WZLBQ8F`)
   - **Property ID:** numeric string under **Property details** (live value `564001579`)
5. Grant the shared read-only Google service account **Viewer** access under **Property Access Management**:
   ```text
   build-android@charged-sector-382503.iam.gserviceaccount.com
   ```
6. Under **Admin -> Data display -> Custom definitions**, create two Event-scoped custom dimensions:
   - Dimension name: `Output Format` / Event parameter: `output_format`
   - Dimension name: `Export Action` / Event parameter: `export_action`
7. Under **Admin -> Data display -> Events**, mark `subtitle_export` as a **Key event** once the first live event arrives.

---

## Step 4. Deploy to Cloudflare Workers Static Assets and bind `jsontosrt.com`

Build with production environment variables and deploy via Wrangler:

```bash
cd /Users/dake/Projects/aiapp/30_products/whisper-json-to-srt
npx wrangler whoami
PUBLIC_SITE_URL="https://jsontosrt.com" \
PUBLIC_GA4_MEASUREMENT_ID="G-085WZLBQ8F" \
npm run cf:deploy
```

Bind custom domains in Cloudflare:

1. Open **Cloudflare Dashboard -> Workers & Pages -> `whisper-json-to-srt` -> Settings -> Domains & Routes**.
2. Click **Add -> Custom Domain** and add `jsontosrt.com`.
3. Add a Bulk Redirect or Redirect Rule on zone `jsontosrt.com` redirecting `https://www.jsontosrt.com/*` (`301`) to `https://jsontosrt.com/$1`.

Verify live HTTPS responses from your terminal:

```bash
curl -fsSIL https://jsontosrt.com/
curl -fsSIL https://jsontosrt.com/about/
curl -fsSIL https://jsontosrt.com/privacy/
curl -fsSIL https://jsontosrt.com/terms/
curl -fsSL https://jsontosrt.com/robots.txt
curl -fsSL https://jsontosrt.com/sitemap-index.xml
curl -fsSL https://jsontosrt.com/indexnow-key.txt
curl -fsSL https://jsontosrt.com/a8f4c2e91b7d40639e5a12c8d4f07b31.txt
curl -fsSL https://jsontosrt.com/og-image.png
```

---

## Step 5. Enable Cloudflare Email Routing for `hello@jsontosrt.com`

`/about/`, `/privacy/`, and `/terms/` publish `hello@jsontosrt.com` as the official support and privacy contact.

**Completed 2026-11-12.** Zone `58c1590cb36fa9e33c7e66176d01f600` is `active`. Email Routing is `enabled: true, status: ready`. `hello@jsontosrt.com` and `privacy@jsontosrt.com` forward to `liqi199315@gmail.com`. MX, SPF, DKIM, and `_dmarc` TXT are locked. Do not repeat this step.

1. Open **Cloudflare Dashboard -> Zone `jsontosrt.com` -> Email -> Email Routing**.
2. Click **Get started** and click **Add records and enable** so Cloudflare adds the required `MX` records and `TXT` SPF record (`v=spf1 include:_spf.mx.cloudflare.net ~all`).
3. Under **Destination addresses**, add your personal inbox and click the verification link emailed by Cloudflare.
4. Under **Routing rules -> Custom addresses**, create rule:
   - **Custom address:** `hello@jsontosrt.com`
   - **Action:** Send to an email -> select your verified destination inbox.
5. Send a test message from an external email account to `hello@jsontosrt.com` and confirm delivery.

---

## Step 6. Verify Google Search Console, Bing Webmaster Tools, and IndexNow

### 6A. Google Search Console (`sc-domain:jsontosrt.com`)

1. Open **Google Search Console -> Add property -> Domain** and enter `jsontosrt.com`.
2. Copy the `google-site-verification=...` TXT value and add it at `@` in **Cloudflare DNS** for `jsontosrt.com`, then click **Verify**.
3. Open **Settings -> Users and permissions -> Add user** and grant **Full** permission to:
   ```text
   build-android@charged-sector-382503.iam.gserviceaccount.com
   ```
4. Open **Sitemaps** and submit:
   ```text
   https://jsontosrt.com/sitemap-index.xml
   ```

### 6B. Bing Webmaster Tools

**Completed 2026-11-12.** `IsVerified: true` via a Cloudflare unproxied `verify.bing.com` CNAME. Sitemap `https://jsontosrt.com/sitemap-index.xml` was submitted via `SubmitFeed`. Do not submit the sitemap again unless the feed is missing.

1. Open **Bing Webmaster Tools** (using the same account tied to `40_shared/bing-webmaster.key`).
2. Click **Import from Google Search Console** to import `https://jsontosrt.com/` in one click, or verify via DNS TXT.
3. Submit sitemap:
   ```text
   https://jsontosrt.com/sitemap-index.xml
   ```

### 6C. Push all 9 routes via IndexNow

Submit all 9 canonical URLs to IndexNow using the built key in `dist/indexnow-key.txt`:

```bash
cd /Users/dake/Projects/aiapp/30_products/whisper-json-to-srt
INDEXNOW_KEY="$(tr -d '[:space:]' < dist/indexnow-key.txt)"
curl -i -X POST "https://api.indexnow.org/indexnow" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d "{
    \"host\": \"jsontosrt.com\",
    \"key\": \"${INDEXNOW_KEY}\",
    \"keyLocation\": \"https://jsontosrt.com/indexnow-key.txt\",
    \"urlList\": [
      \"https://jsontosrt.com/\",
      \"https://jsontosrt.com/whisper-verbose-json-to-srt/\",
      \"https://jsontosrt.com/whisper-json-to-vtt/\",
      \"https://jsontosrt.com/whisperx-diarized-json-to-srt/\",
      \"https://jsontosrt.com/whisper-cpp-json-to-srt/\",
      \"https://jsontosrt.com/short-video-caption-splitter/\",
      \"https://jsontosrt.com/about/\",
      \"https://jsontosrt.com/privacy/\",
      \"https://jsontosrt.com/terms/\"
    ]
  }"
```

Expect HTTP `200` or `202 Accepted`.

---

## Step 7. Register public IDs in `40_shared/analytics-sites.yaml` and test reports

**Completed 2026-11-12.** Key `whisperjsontosrt` is already present. Do not append a second block. `ga4-report.mjs`, `gsc-report.mjs`, `bing-report.mjs`, and `analytics-registry.test.mjs` all exited `0`.

Registered block in `/Users/dake/Projects/aiapp/40_shared/analytics-sites.yaml`:

```yaml
  whisperjsontosrt:
    display_name: jsontosrt.com
    repo: 30_products/whisper-json-to-srt
    site_url: https://jsontosrt.com
    ga4_property_id: "564001579"
    ga4_measurement_id: G-085WZLBQ8F
    gsc_site: "sc-domain:jsontosrt.com"
    bing_site_url: https://jsontosrt.com/
```

Run the shared registry and reporting smoke checks:

```bash
cd /Users/dake/Projects/aiapp/30_products/whisper-json-to-srt
node ../../40_shared/scripts/analytics-registry.mjs --project whisperjsontosrt
node --test ../../40_shared/scripts/analytics-registry.test.mjs
npm run ga4:report
npm run gsc:report
npm run bing:report
```

The four commands above already exited `0` on 2026-11-12. The baseline is logged in `NOW.md`. Email Routing, Bing Webmaster Tools, the shared registry, and the report checks are complete.
