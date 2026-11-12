# Production Launch Checklist (`jsontosrt.com`)

Step-by-step copy-paste runbook for dake (`[人工]` tasks `P0-2` and `P0-3` in `PLAN_90DAY.md`).

- **Repository path:** `/Users/dake/Projects/aiapp/30_products/whisper-json-to-srt`
- **Canonical domain:** `https://jsontosrt.com` (trademark-clean generic format domain; avoids third-party ASR brand names in the hostname)
- **Cloudflare Worker name:** `whisper-json-to-srt` (`wrangler.jsonc`)
- **Support inbox:** `hello@jsontosrt.com` (Cloudflare Email Routing)
- **Shared analytics key:** `whisperjsontosrt` in `/Users/dake/Projects/aiapp/40_shared/analytics-sites.yaml`

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

## Step 3. Create GA4 Web Data Stream (get `G-XXXXXXXXXX` before production build)

1. Open **Google Analytics Admin** and create property `jsontosrt.com` (reporting time zone and USD currency).
2. Disable **Google Signals data collection** and **Ads Personalization** under **Data collection and modifications -> Data collection** so telemetry matches `/privacy/`.
3. Create a **Web Data Stream** for `https://jsontosrt.com` (`Stream name: jsontosrt.com`).
4. Copy two public identifiers (never commit credentials):
   - **Measurement ID:** `G-XXXXXXXXXX`
   - **Property ID:** numeric string under **Property details** (for example `531234567`)
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
PUBLIC_GA4_MEASUREMENT_ID="G-XXXXXXXXXX" \
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

Append this exact 2-space / 4-space indented block under `sites:` in `/Users/dake/Projects/aiapp/40_shared/analytics-sites.yaml` (replace `<NUMERIC_GA4_PROPERTY_ID>` and `G-XXXXXXXXXX` with your real public IDs from Step 3; keep key `whisperjsontosrt` so `package.json` scripts match):

```yaml
  whisperjsontosrt:
    display_name: jsontosrt.com
    repo: 30_products/whisper-json-to-srt
    site_url: https://jsontosrt.com
    ga4_property_id: "<NUMERIC_GA4_PROPERTY_ID>"
    ga4_measurement_id: G-XXXXXXXXXX
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

Once all four commands succeed, mark `P0-2`, `P0-3`, and `P0-4` completed with today's date in `PLAN_90DAY.md` and log the baseline in `NOW.md`.
