/* LCR Performance Dashboard
   Public, read-only Google Sheets CSV sources.
   Refresh cadence: 15 minutes. Update the URLs below if the published tabs change.
*/
const SOURCES = {
  ranking: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQCaZU7c2yNCR1m6vU9bo1qvfDA83qrZP2sDQP9fVUxzG-GUyFza0JmdbmYda2BqA/pub?gid=1316924880&single=true&output=csv",
  dealer:  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQCaZU7c2yNCR1m6vU9bo1qvfDA83qrZP2sDQP9fVUxzG-GUyFza0JmdbmYda2BqA/pub?gid=1101508039&single=true&output=csv",
  history: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQCaZU7c2yNCR1m6vU9bo1qvfDA83qrZP2sDQP9fVUxzG-GUyFza0JmdbmYda2BqA/pub?gid=1717630869&single=true&output=csv"
};
const REFRESH_MS = 15 * 60 * 1000;
const PAGE_SIZE = 25;
const state = { ranking: [], dealer: [], history: [], filtered: [], page: 1, sort: "rank", direction: "asc", charts: {} };
const $ = id => document.getElementById(id);

function normalize(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function parseCSV(text, sourceName = "") {
  const rawRows = [];
  let row = [], field = "", quoted = false;
  text = String(text ?? "").replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (c === '"') {
      if (quoted && next === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (c === "," && !quoted) { row.push(field); field = ""; }
    else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && next === "\n") i++;
      row.push(field); field = "";
      if (row.some(v => String(v).trim() !== "")) rawRows.push(row);
      row = [];
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); if (row.some(v => String(v).trim() !== "")) rawRows.push(row); }
  if (!rawRows.length) return [];

  // The published tabs contain title/metadata rows before their real column headers.
  // Select the row with the strongest set of recognizable column names.
  const scoreRow = (r) => {
    const cells = r.map(v => normalize(v));
    let score = 0;
    const has = (pattern) => cells.some(c => pattern.test(c));
    if (has(/^rank$|^ranking$/)) score += 4;
    if (has(/group dealer|grup dealer/)) score += 4;
    if (has(/no ahass/)) score += 3;
    if (has(/nama ahass/)) score += 3;
    if (has(/^target$|target bulan/)) score += 2;
    if (has(/treatment.*replace|actual|total ue pkb/)) score += 2;
    if (has(/kota|kabupaten/)) score += 1;
    if (has(/jan 26|jan 2026|target jan agu|acv total/)) score += 2;
    return score;
  };
  let headerIndex = 0, bestScore = -1;
  rawRows.forEach((r, i) => {
    const score = scoreRow(r);
    if (score > bestScore) { bestScore = score; headerIndex = i; }
  });
  const headers = rawRows[headerIndex].map((h,i) => String(h || `column_${i+1}`).trim());
  const result = rawRows.slice(headerIndex + 1).map(r =>
    Object.fromEntries(headers.map((h,i) => [h, (r[i] ?? "").trim()]))
  );
  // Drop obvious repeated header lines and weekday-only helper rows.
  return result.filter(r => {
    const vals = Object.values(r).map(v => normalize(v));
    if (!vals.some(Boolean)) return false;
    if (vals.some(v => v === "rank" || v === "ranking" || v === "grup dealer" || v === "group dealer")) return false;
    if (sourceName === "ranking" && vals.some(v => /^(senin|selasa|rabu|kamis|jumat|sabtu|minggu)$/.test(v))) return false;
    return true;
  });
}
function headerList(rows) { return rows.length ? Object.keys(rows[0]) : []; }
function findKey(rows, patterns, exclude=[]) {
  const keys = headerList(rows);
  for (const p of patterns) {
    const found = keys.find(k => p.test(normalize(k)) && !exclude.some(x => x.test(normalize(k))));
    if (found) return found;
  }
  return null;
}
function num(value) {
  if (typeof value === "number") return value;
  let s = String(value ?? "").trim();
  if (!s || s === "-" || s.toLowerCase() === "n/a") return 0;
  s = s.replace(/\s/g,"").replace(/rp\.?/ig,"").replace(/%/g,"");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g,"").replace(",",".");
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g,"");
  else s = s.replace(",",".");
  const n = Number(s.replace(/[^\d.-]/g,""));
  return Number.isFinite(n) ? n : 0;
}
function firstNumber(row, patterns, exclude=[]) {
  const keys = Object.keys(row || {});
  for (const p of patterns) {
    const k = keys.find(key => p.test(normalize(key)) && !exclude.some(x => x.test(normalize(key))));
    if (k && String(row[k]).trim() !== "") return num(row[k]);
  }
  return 0;
}
function mapRanking(rows) {
  const keys = rows.length ? Object.keys(rows[0]) : [];
  const key = (patterns, exclude=[]) => keys.find(k => patterns.some(p => p.test(normalize(k))) && !exclude.some(p => p.test(normalize(k))));
  const targetKey = key([/^target$/]);
  const actualKey = key([/^treatment replace$/, /treatment.*replace/, /^actual$/]);
  const achKey = key([/^pencapaian treatment replace$/, /pencapaian.*treatment.*replace/]);
  const rankKey = key([/^rank$/, /^ranking$/]);
  const dealerKey = key([/^group dealer$/, /^grup dealer$/]);
  const codeKey = key([/^no ahass$/, /kode ahass/]);
  const nameKey = key([/^nama ahass$/, /nama.*lcr/]);
  const cityKey = key([/^kota kabupaten$/, /kota/, /kabupaten/]);
  // Published CSV headers can contain line breaks/extra spaces because the
  // source sheet uses wrapped, multi-line labels. Match normalized labels first.
  const enteredKey = key([/total ue esaf masuk/, /ue esaf masuk/, /total ue.*ahass/]);
  const clearanceCandidates = keys.filter(k => normalize(k).includes("kelolosan") && normalize(k).includes("lcr"));
  const clearanceRateKey = clearanceCandidates.find(k => String(k).includes("%") || /persen|percent|rate/.test(normalize(k))) || null;
  const clearanceKey = clearanceCandidates.find(k => k !== clearanceRateKey && !String(k).includes("%") && !/persen|percent|rate/.test(normalize(k))) || null;
  return rows.map((r, i) => {
    const target = targetKey ? num(r[targetKey]) : 0;
    const actual = actualKey ? num(r[actualKey]) : 0;
    let achievement = achKey ? num(r[achKey]) : (target ? actual / target * 100 : 0);
    if (achKey && String(r[achKey]).includes("%")) achievement = num(r[achKey]);
    else if (achKey && achievement > 0 && achievement <= 1) achievement *= 100;
    let entered = enteredKey ? num(r[enteredKey]) : 0;
    let clearance = clearanceKey ? num(r[clearanceKey]) : 0;
    let clearanceRate = clearanceRateKey ? num(r[clearanceRateKey]) : (entered ? clearance / entered * 100 : 0);
    if (clearanceRateKey && String(r[clearanceRateKey]).includes("%")) clearanceRate = num(r[clearanceRateKey]);
    else if (clearanceRateKey && clearanceRate > 0 && clearanceRate <= 1) clearanceRate *= 100;
    // Fallback for exported sheets where the two-row header causes the count
    // column to be unnamed/misaligned: derive count from the published rate.
    if (!clearance && entered > 0 && clearanceRate > 0) clearance = Math.round(entered * clearanceRate / 100);
    if (!entered && clearance > 0 && clearanceRate > 0) entered = Math.round(clearance * 100 / clearanceRate);
    if (!clearanceRate && entered > 0 && clearance > 0) clearanceRate = clearance / entered * 100;
    const rawRank = rankKey ? num(r[rankKey]) : i + 1;
    return {
      raw:r, rank:rawRank || i+1,
      dealer:dealerKey ? r[dealerKey] : "—",
      code:codeKey ? r[codeKey] : "—",
      name:nameKey ? r[nameKey] : (codeKey ? r[codeKey] : `Outlet ${i+1}`),
      city:cityKey ? r[cityKey] : "—",
      target, actual, achievement, gap:Math.max(0,target-actual), entered, clearance, clearanceRate
    };
  }).filter(x => x.name && !/^nama ahass$/i.test(x.name) && (x.target > 0 || x.actual > 0));
}
async function fetchCSV(url, sourceName) {
  const separator = url.includes("?") ? "&" : "?";
  const res = await fetch(`${url}${separator}_ts=${Date.now()}`, { cache:"no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim() || text.trimStart().startsWith("<!DOCTYPE") || text.trimStart().startsWith("<html")) throw new Error("Endpoint did not return CSV. Check that the sheet is published as CSV.");
  return parseCSV(text, sourceName);
}
async function refreshData() {
  const btn = $("refresh-btn"); btn.disabled = true; btn.textContent = "↻ Refreshing…";
  setConnection("loading", "Refreshing data…");
  const results = await Promise.allSettled([fetchCSV(SOURCES.ranking, 'ranking'), fetchCSV(SOURCES.dealer, 'dealer'), fetchCSV(SOURCES.history, 'history')]);
  const names = ["ranking","dealer","history"], errors=[];
  results.forEach((result,i) => {
    if (result.status === "fulfilled") state[names[i]] = result.value;
    else errors.push(`${names[i]}: ${result.reason?.message || "fetch failed"}`);
  });
  const anyData = state.ranking.length || state.dealer.length || state.history.length;
  if (anyData) {
    state.outlets = mapRanking(state.ranking);
    populateDealerFilter();
    applyFilters();
    renderKPIs();
    renderCharts();
    renderPriority();
    $("last-updated").textContent = `Updated ${new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})}`;
    $("period-label").textContent = detectPeriod() || "Current period";
    setConnection(errors.length ? "warning" : "ok", errors.length ? "Partially connected" : "All sources connected");
    if (errors.length) showAlert("Some sources could not refresh. The dashboard is showing the last successfully loaded data for those sources. " + errors.join(" | "));
    else hideAlert();
  } else {
    setConnection("error","Connection failed");
    showAlert("Could not load any Google Sheets source. Confirm each tab is published as CSV and that the URLs are accessible publicly. Details: " + errors.join(" | "));
    $("ranking-body").innerHTML = `<tr><td colspan="9" class="table-message">Could not load data. Check the published CSV URLs and try Refresh data.</td></tr>`;
  }
  btn.disabled = false; btn.textContent = "↻ Refresh data";
}
function setConnection(status,label) {
  $("connection-label").textContent = label;
  const dot = $("connection-dot");
  dot.style.background = status==="ok" ? "#139b8b" : status==="error" ? "#d34b58" : status==="warning" ? "#d58b2b" : "#e1a13b";
  dot.style.boxShadow = status==="ok" ? "0 0 0 4px #e8f8f4" : status==="error" ? "0 0 0 4px #fff0f1" : "0 0 0 4px #fff4df";
}
function showAlert(msg) { $("alert").textContent=msg; $("alert").classList.remove("hidden"); }
function hideAlert() { $("alert").classList.add("hidden"); }
function detectPeriod() {
  const all = [...state.ranking,...state.dealer,...state.history];
  const key = findKey(all,[/periode/,/period/,/bulan/,/month/]);
  if (key) { const v=all.map(r=>r[key]).find(Boolean); if(v) return v; }
  return "";
}
function populateDealerFilter() {
  const select=$("dealer-filter"), current=select.value;
  const vals=[...new Set((state.outlets||[]).map(r=>r.dealer).filter(v=>v && v!=="—"))].sort((a,b)=>a.localeCompare(b));
  select.innerHTML='<option value="">All dealer groups</option>'+vals.map(v=>`<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join("");
  if(vals.includes(current)) select.value=current;
}
function applyFilters() {
  const q=normalize($("search-input").value), dealer=$("dealer-filter").value, status=$("status-filter").value;
  state.filtered=(state.outlets||[]).filter(r=>{
    const text=normalize([r.dealer,r.code,r.name,r.city].join(" "));
    return (!q||text.includes(q))&&(!dealer||r.dealer===dealer)&&(!status||(status==="below"?r.achievement<100:r.achievement>=100));
  });
  state.filtered.sort((a,b)=>{
    let x=a[state.sort], y=b[state.sort];
    if(typeof x==="string") {x=x.toLowerCase();y=String(y).toLowerCase();}
    const v=x<y?-1:x>y?1:0; return state.direction==="asc"?v:-v;
  });
  state.page=1; renderTable();
}
function renderKPIs() {
  const rows=state.outlets||[];
  const totalTarget=rows.reduce((s,r)=>s+r.target,0), totalActual=rows.reduce((s,r)=>s+r.actual,0);
  const achievement=totalTarget?totalActual/totalTarget*100:0, gap=Math.max(0,totalTarget-totalActual);
  $("kpi-target").textContent=fmt(totalTarget);
  $("kpi-actual").textContent=fmt(totalActual);
  $("kpi-achievement").textContent=totalTarget?pct(achievement):"—";
  $("kpi-progress").style.width=`${Math.min(100,Math.max(0,achievement))}%`;
  $("kpi-progress").style.background = achievement >= 100 ? "#0b8069" : achievement >= 75 ? "#d97706" : "#c21f3a";
  $("kpi-gap").textContent=fmt(gap);
  $("kpi-gap-note").textContent=gap ? `${pct(totalTarget?totalActual/totalTarget*100:0)} achieved` : "Target reached";
  $("kpi-below").textContent=fmt(rows.filter(r=>r.achievement<100).length);
  const totalEntered=rows.reduce((sum,r)=>sum+(r.entered||0),0);
  const totalClearance=rows.reduce((sum,r)=>sum+(r.clearance||0),0);
  $("kpi-clearance").textContent=fmt(totalClearance);
  $("kpi-clearance-rate").textContent=`Clearance rate: ${totalEntered ? pct(totalClearance/totalEntered*100) : "—"}`;
}
function renderTable() {
  const rows=state.filtered||[], pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
  state.page=Math.min(state.page,pages);
  const start=(state.page-1)*PAGE_SIZE, visible=rows.slice(start,start+PAGE_SIZE);
  $("row-count").textContent=`${rows.length.toLocaleString("id-ID")} outlets`;
  $("table-summary").textContent=rows.length?`Showing ${start+1}–${Math.min(start+PAGE_SIZE,rows.length)} of ${rows.length}`:"No matching outlets";
  $("page-label").textContent=`Page ${state.page} of ${pages}`;
  $("prev-page").disabled=state.page<=1; $("next-page").disabled=state.page>=pages;
  $("ranking-body").innerHTML=visible.length?visible.map((r,i)=>{
    const achClass=r.achievement>=100?"good":r.achievement>=75?"warn":"bad";
    return `<tr><td><span class="rank-number">${escapeHTML(r.rank)}</span></td><td>${escapeHTML(r.dealer)}</td><td>${escapeHTML(r.code)}</td><td><strong>${escapeHTML(r.name)}</strong></td><td>${escapeHTML(r.city)}</td><td class="numeric">${fmt(r.target)}</td><td class="numeric">${fmt(r.actual)}</td><td class="numeric"><div class="achievement-cell"><span class="status-pill ${achClass}">${pct(r.achievement)}</span><span class="achievement-track"><span style="width:${Math.min(100,Math.max(0,r.achievement))}%;background:${r.achievement>=100?'var(--teal)':r.achievement>=75?'var(--orange)':'var(--red)'}"></span></span></div></td><td class="numeric">${fmt(r.gap)}</td><td class="numeric">${fmt(r.clearance)}</td><td class="numeric">${pct(r.clearanceRate)}</td></tr>`;
  }).join(""):`<tr><td colspan="9" class="table-message">No rows match the current filters, or required columns were not detected.</td></tr>`;
}
function renderPriority() {
  const rows=(state.outlets||[]).filter(r=>Number(r.target)>Number(r.actual) && Number(r.target)>0).sort((a,b)=>(b.target-b.actual)-(a.target-a.actual)).slice(0,8);
  const max=Math.max(1,...rows.map(r=>Math.max(0,r.target-r.actual)));
  $("priority-list").innerHTML=rows.length?rows.map((r,i)=>{const gap=Math.max(0,r.target-r.actual);return `<div class="priority-row"><div class="priority-rank">${i+1}</div><div class="priority-name"><strong>${escapeHTML(r.name)}</strong><small>${escapeHTML(r.dealer)} · ${escapeHTML(r.city)} · ${escapeHTML(r.code)}</small></div><div class="priority-gap"><small>${fmt(r.actual)} of ${fmt(r.target)} units completed</small><div class="gap-track"><span style="width:${gap/max*100}%"></span></div></div><div class="priority-metric"><strong>${fmt(gap)} units</strong><small>${pct(r.achievement)} achieved</small></div></div>`}).join(""):`<div class="empty-state">No remaining target gaps were found. Check that the Ranking Okt 26 sheet has valid Target and Treatment + Replace columns.</div>`;
}
function renderCharts() {
  if (typeof Chart==="undefined") { showAlert("Chart library did not load. Check internet access or the Chart.js CDN."); return; }
  renderHistoryChart(); renderDealerChart();
}
function renderHistoryChart() {
  const rows=state.history||[];
  const canvas=$("history-chart"), empty=$("history-empty");
  if(!rows.length){canvas.classList.add("hidden");empty.classList.remove("hidden");return;}

  // History LCR is a wide table: one row per AHASS and one column per month.
  // Aggregate the monthly actuals across AHASS instead of looking for a date column.
  const keys=Object.keys(rows[0]||{});
  const monthPattern=/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[ -]?(26|2026)$/i;
  const monthKeys=keys.filter(k=>monthPattern.test(normalize(k).replace(/\s+/g," ")));
  const orderedMonths=["Jan-26","Feb-26","Mar-26","Apr-26","May-26","Jun-26","Jul-26","Aug-26","Sep-26","Oct-26","Nov-26","Dec-26"];
  const normalizeMonth = k => {
    const n=normalize(k).replace(/\s+/g," ");
    const m=n.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[ -]?(26|2026)$/i);
    if(!m) return k;
    const names={jan:"Jan",feb:"Feb",mar:"Mar",apr:"Apr",may:"May",jun:"Jun",jul:"Jul",aug:"Aug",sep:"Sep",oct:"Oct",nov:"Nov",dec:"Dec"};
    return names[m[1].toLowerCase()]+"-26";
  };
  const actualMonths=monthKeys.map(k=>({key:k,label:normalizeMonth(k)}))
    .sort((a,b)=>orderedMonths.indexOf(a.label)-orderedMonths.indexOf(b.label));
  if(!actualMonths.length){canvas.classList.add("hidden");empty.classList.remove("hidden");return;}
  const labels=actualMonths.map(m=>m.label);
  const values=actualMonths.map(m=>rows.reduce((sum,r)=>sum+num(r[m.key]),0));
  canvas.classList.remove("hidden");empty.classList.add("hidden");
  makeChart("history",{type:"line",data:{labels,datasets:[{
    label:"Total LCR treatment",data:values,borderColor:"#1748e8",
    backgroundColor:"rgba(23,72,232,.18)",fill:true,tension:.3,pointRadius:4,pointHoverRadius:6,pointBackgroundColor:"#ffffff",pointBorderColor:"#1748e8",pointBorderWidth:2,borderWidth:3
  }]},options:chartOptions()});
}
function renderDealerChart() {
  const rows = state.dealer || [];
  const canvas = $("dealer-chart"), empty = $("dealer-empty");
  if (!rows.length) { canvas.classList.add("hidden"); empty.classList.remove("hidden"); return; }

  const keys = Object.keys(rows[0] || {});
  const findExact = (name) => keys.find(k => normalize(k) === normalize(name));
  const groupKey = findExact("Grup Dealer") || findExact("Group Dealer");
  const targetKey = findExact("Target");
  const actualKey = findExact("Actual");
  const achievementKey = findExact("Pencapaian");
  const labelKey = groupKey || keys.find(k => /grup dealer|group dealer/i.test(k));

  const points = rows.map((r, i) => {
    const target = targetKey ? num(r[targetKey]) : 0;
    const actual = actualKey ? num(r[actualKey]) : 0;
    let achievement = achievementKey ? num(r[achievementKey]) : NaN;
    const raw = achievementKey ? String(r[achievementKey] ?? "").trim() : "";
    if (!Number.isFinite(achievement) || raw === "" || /#REF!|#DIV\/0!/i.test(raw)) {
      achievement = target > 0 ? actual / target * 100 : 0;
    } else if (raw.includes("%")) {
      // num() strips the percent symbol, so 43.1% remains 43.1.
    } else if (achievement > 0 && achievement <= 1) {
      // Google Sheets may export percentage-formatted cells as fractions.
      achievement *= 100;
    }
    return {
      label: labelKey ? String(r[labelKey] || "").trim() : `Group ${i + 1}`,
      achievement: Number.isFinite(achievement) ? achievement : 0,
      target, actual
    };
  }).filter(x => x.label && !/^grup dealer$/i.test(x.label));

  // Keep every group from the published MTD table, including TDM.
  // Some exported sheets contain repeated rank values, so do not deduplicate by rank.
  if (!points.length) { canvas.classList.add("hidden"); empty.classList.remove("hidden"); return; }

  // Allocate a separate vertical row for each group so Chart.js cannot auto-skip labels.
  const chartWrap = canvas.parentElement;
  if (chartWrap) chartWrap.style.height = `${Math.max(245, points.length * 24 + 56)}px`;

  // Keep the scale in percentage points (e.g. 43.1 means 43.1%).
  const maxValue = Math.max(100, ...points.map(x => x.achievement));
  canvas.classList.remove("hidden"); empty.classList.add("hidden");
  makeChart("dealer", {
    type: "bar",
    data: {
      labels: points.map(x => x.label),
      datasets: [{
        label: "Achievement (%)",
        data: points.map(x => x.achievement),
        // Use alternating blues so short bars remain visually distinguishable.
        backgroundColor: points.map(x => x.achievement >= 100 ? "#0b8069" : x.achievement >= 75 ? "#d97706" : "#2f63ff"),
        borderRadius: 5,
        barThickness: 14,
        categoryPercentage: 0.92,
        barPercentage: 0.92,
        minBarLength: 5
      }]
    },
    options: {
      ...chartOptions(),
      indexAxis: "y",
      layout: { padding: { left: 8, right: 12, top: 4, bottom: 4 } },
      scales: {
        x: {
          beginAtZero: true,
          max: Math.ceil(maxValue / 10) * 10,
          ticks: { color: "#000000", font: { family: "DM Sans", size: 12, weight: "700" }, stepSize: 20, callback: value => `${value}%` },
          grid: { color: "rgba(92,113,148,.22)" }
        },
        y: {
          grid: { display: false },
          afterFit: scale => { scale.width = Math.max(scale.width, 70); },
          ticks: {
            autoSkip: false,
            color: "#000000",
            font: { size: 11, weight: "600" },
            callback: function(value) { return this.getLabelForValue(value); }
          }
        }
      },
      plugins: {
        ...chartOptions().plugins,
        tooltip: {
          callbacks: {
            label: ctx => `Achievement: ${Number(ctx.raw).toFixed(1)}%`
          }
        }
      }
    }
  });
}

function chartOptions(){return {responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,labels:{boxWidth:9,usePointStyle:true,pointStyle:"circle",font:{family:"DM Sans",size:12,weight:"700"},color:"#000000"}},tooltip:{backgroundColor:"#19243a",padding:10,displayColors:true}},scales:{x:{grid:{display:false},ticks:{color:"#000000",font:{family:"DM Sans",size:12,weight:"700"},maxRotation:45}},y:{beginAtZero:true,grid:{color:"rgba(92,113,148,.20)"},ticks:{color:"#000000",font:{family:"DM Sans",size:13,weight:"700"}}}}};}
function makeChart(key,config){if(state.charts[key])state.charts[key].destroy();state.charts[key]=new Chart($(key==="history"?"history-chart":"dealer-chart"),config);}
function fmt(n){return Number(n||0).toLocaleString("id-ID",{maximumFractionDigits:1});}
function pct(n){return `${Number(n||0).toLocaleString("id-ID",{maximumFractionDigits:1,minimumFractionDigits:1})}%`;}
function escapeHTML(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function exportCSV(){
  const rows=state.filtered||[]; const headers=["Rank","Grup Dealer","No AHASS","Nama AHASS","Kota/Kabupaten","Target","Treatment + Replace","Pencapaian (%)","Gap","Kelolosan LCR","% Kelolosan"];
  const data=[headers,...rows.map(r=>[r.rank,r.dealer,r.code,r.name,r.city,r.target,r.actual,r.achievement.toFixed(1),r.gap,r.clearance,r.clearanceRate.toFixed(1)])];
  const csv=data.map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"})); const a=document.createElement("a");a.href=url;a.download="lcr-ahass-ranking.csv";a.click();URL.revokeObjectURL(url);
}
$("refresh-btn").addEventListener("click",refreshData);
$("search-input").addEventListener("input",applyFilters);
$("dealer-filter").addEventListener("change",applyFilters);
$("status-filter").addEventListener("change",applyFilters);
$("prev-page").addEventListener("click",()=>{if(state.page>1){state.page--;renderTable();}});
$("next-page").addEventListener("click",()=>{state.page++;renderTable();});
$("export-btn").addEventListener("click",exportCSV);
document.querySelectorAll("th[data-sort]").forEach(th=>th.addEventListener("click",()=>{
  const key=th.dataset.sort; if(state.sort===key)state.direction=state.direction==="asc"?"desc":"asc";else{state.sort=key;state.direction=key==="rank"?"asc":"desc";}
  applyFilters();
}));
refreshData();
setInterval(refreshData,REFRESH_MS);
