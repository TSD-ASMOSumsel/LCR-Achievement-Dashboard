LCR Performance Dashboard — GitHub Pages

Files:
- index.html: dashboard structure
- style.css: corporate light theme
- script.js: Google Sheets CSV connections, 15-minute refresh, calculations, charts, ranking, filters, priority list, CSV export

Google Sheets CSV endpoints are configured at the top of script.js. These URLs are public read-only endpoints. Publish only data approved for public access.

Important:
1. The endpoints could not be fetched from this environment, so test them in your browser before publishing.
2. Column mapping is heuristic because actual CSV headers have not yet been inspected. If your header names differ, update the pattern matching in mapRanking(), renderHistoryChart(), and renderDealerChart() in script.js.
3. Chart.js and Google Fonts are loaded from CDNs, so the dashboard needs internet access.
4. GitHub Pages is static hosting; never put secrets, API keys, or private data in these files.
5. To publish: upload index.html, style.css, script.js (and optionally this README) to your GitHub repository root, commit, then enable Settings > Pages > Deploy from a branch > main > /(root).

Dealer-group achievement chart: explicitly maps Grup Dealer, Target, Actual, and Pencapaian; normalizes percentage values to percentage points and falls back to Actual / Target when Pencapaian is blank or contains an Excel error.
