const COLORS = {
  base: "#7b8791",
  teal: "#0f8b8d",
  blue: "#2f6fdb",
  coral: "#d95d4f",
  amber: "#c98b21",
  green: "#4c8b42",
  violet: "#7463b6",
  ink: "#17202a",
};

const app = document.getElementById("app");
let chartSerial = 0;
let activeModelId = "pib";

const clone = (obj) => JSON.parse(JSON.stringify(obj));
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const nearly = (a, b, tol = 1e-7) => Math.abs(a - b) <= tol;
const esc = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function fmt(value, digits = 2, unit = "") {
  if (!Number.isFinite(value)) return "n.d.";
  const abs = Math.abs(value);
  const decimals = abs >= 100 || Number.isInteger(value) ? Math.min(digits, 1) : digits;
  return `${value.toLocaleString("es-CO", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  })}${unit}`;
}

function signed(value, digits = 2, unit = "") {
  if (!Number.isFinite(value)) return "n.d.";
  if (nearly(value, 0)) return `0${unit}`;
  return `${value > 0 ? "+" : ""}${fmt(value, digits, unit)}`;
}

function pct(value, digits = 1) {
  return fmt(value * 100, digits, "%");
}

function ticks([min, max], count = 5) {
  if (nearly(min, max)) return [min];
  return Array.from({ length: count }, (_, i) => min + ((max - min) * i) / (count - 1));
}

function samplePoints(fn, [x0, x1], steps = 90) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const x = x0 + ((x1 - x0) * i) / steps;
    return { x, y: fn(x) };
  }).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

function pointsFromY(fn, [y0, y1], steps = 90) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const y = y0 + ((y1 - y0) * i) / steps;
    return { x: fn(y), y };
  }).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

function domainFrom(values, pad = 0.12, floorZero = false) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return [0, 1];
  let min = Math.min(...clean);
  let max = Math.max(...clean);
  if (floorZero) min = Math.min(0, min);
  if (nearly(min, max)) {
    const bump = Math.max(1, Math.abs(min) * 0.2);
    min -= bump;
    max += bump;
  }
  const gap = (max - min) * pad;
  return [min - gap, max + gap];
}

function lineChart({
  title,
  subtitle = "",
  xLabel,
  yLabel,
  xDomain,
  yDomain,
  curves = [],
  markers = [],
  vLines = [],
  hLines = [],
  segments = [],
  arrows = [],
  shifts = [],
  bands = [],
  crossGuides = [],
  wide = false,
}) {
  const id = `clip-${chartSerial++}`;
  const width = 660;
  const height = 420;
  const margin = { left: 72, right: 36, top: 30, bottom: 66 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const sx = (x) => margin.left + ((x - xDomain[0]) / (xDomain[1] - xDomain[0])) * plotW;
  const sy = (y) => margin.top + plotH - ((y - yDomain[0]) / (yDomain[1] - yDomain[0])) * plotH;
  const linePoints = (pts) =>
    pts
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      .map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
      .join(" ");
  const legend = curves
    .filter((c) => c.label)
    .map(
      (c) => `<span class="legend-item" style="color:${c.color}"><span class="legend-swatch"></span>${esc(c.label)}</span>`,
    )
    .join("");
  const xTicks = ticks(xDomain, 5);
  const yTicks = ticks(yDomain, 5);

  const grid = [
    ...xTicks.map(
      (x) =>
        `<line x1="${sx(x)}" x2="${sx(x)}" y1="${margin.top}" y2="${margin.top + plotH}" stroke="#edf1f3" />` +
        `<text class="tick-label" x="${sx(x)}" y="${margin.top + plotH + 22}" text-anchor="middle">${fmt(x, 1)}</text>`,
    ),
    ...yTicks.map(
      (y) =>
        `<line x1="${margin.left}" x2="${margin.left + plotW}" y1="${sy(y)}" y2="${sy(y)}" stroke="#edf1f3" />` +
        `<text class="tick-label" x="${margin.left - 12}" y="${sy(y) + 4}" text-anchor="end">${fmt(y, 1)}</text>`,
    ),
  ].join("");

  const bandSvg = bands
    .map((b) => {
      if (b.orientation === "h") {
        const y1 = sy(b.from);
        const y2 = sy(b.to);
        const yTop = Math.min(y1, y2);
        const h = Math.abs(y2 - y1);
        return `<rect clip-path="url(#${id})" x="${margin.left}" y="${yTop}" width="${plotW}" height="${h}" fill="${b.color || COLORS.teal}" opacity="${b.opacity ?? 0.08}" />` +
          (b.label ? `<text class="tick-label" x="${margin.left + 8}" y="${yTop + 14}" fill="${b.color || COLORS.ink}" font-weight="800">${esc(b.label)}</text>` : "");
      }
      const x1 = sx(b.from);
      const x2 = sx(b.to);
      const xLeft = Math.min(x1, x2);
      const w = Math.abs(x2 - x1);
      return `<rect clip-path="url(#${id})" x="${xLeft}" y="${margin.top}" width="${w}" height="${plotH}" fill="${b.color || COLORS.teal}" opacity="${b.opacity ?? 0.08}" />` +
        (b.label ? `<text class="tick-label" x="${xLeft + w / 2}" y="${margin.top + 14}" text-anchor="middle" fill="${b.color || COLORS.ink}" font-weight="800">${esc(b.label)}</text>` : "");
    })
    .join("");

  const shiftSvg = shifts
    .map((s) => {
      const basePts = s.basePoints || (s.baseFn ? samplePoints(s.baseFn, xDomain) : []);
      const newPts = s.newPoints || (s.newFn ? samplePoints(s.newFn, xDomain) : []);
      if (!basePts.length || !newPts.length) return "";
      const fwd = basePts
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
        .map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
        .join(" ");
      const back = newPts
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
        .slice()
        .reverse()
        .map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
        .join(" ");
      return `<polygon clip-path="url(#${id})" points="${fwd} ${back}" fill="${s.color || COLORS.teal}" opacity="${s.opacity ?? 0.18}" />`;
    })
    .join("");

  const refs = [
    ...vLines.map(
      (line) =>
        `<line clip-path="url(#${id})" x1="${sx(line.x)}" x2="${sx(line.x)}" y1="${margin.top}" y2="${margin.top + plotH}" stroke="${line.color || COLORS.ink}" stroke-width="${line.width || 2}" ${line.dash ? `stroke-dasharray="${line.dash}"` : ""} opacity="${line.opacity || 0.85}" />` +
        (line.label
          ? `<text class="marker-label" x="${sx(line.x) + 6}" y="${margin.top + 16}" fill="${line.color || COLORS.ink}">${esc(line.label)}</text>`
          : ""),
    ),
    ...hLines.map(
      (line) =>
        `<line clip-path="url(#${id})" x1="${margin.left}" x2="${margin.left + plotW}" y1="${sy(line.y)}" y2="${sy(line.y)}" stroke="${line.color || COLORS.ink}" stroke-width="${line.width || 2}" ${line.dash ? `stroke-dasharray="${line.dash}"` : ""} opacity="${line.opacity || 0.85}" />` +
        (line.label
          ? `<text class="marker-label" x="${margin.left + 6}" y="${sy(line.y) - 7}" fill="${line.color || COLORS.ink}">${esc(line.label)}</text>`
          : ""),
    ),
  ].join("");

  const crossSvg = crossGuides
    .map((g) => {
      if (g.orientation === "h") {
        return `<line clip-path="url(#${id})" x1="${margin.left}" x2="${margin.left + plotW}" y1="${sy(g.y)}" y2="${sy(g.y)}" stroke="${g.color || COLORS.violet}" stroke-width="${g.width || 1.5}" stroke-dasharray="2 4" opacity="${g.opacity ?? 0.55}" />` +
          (g.label ? `<text class="cross-label" x="${margin.left + plotW - 6}" y="${sy(g.y) - 6}" text-anchor="end" fill="${g.color || COLORS.violet}">${esc(g.label)}</text>` : "");
      }
      return `<line clip-path="url(#${id})" x1="${sx(g.x)}" x2="${sx(g.x)}" y1="${margin.top}" y2="${margin.top + plotH}" stroke="${g.color || COLORS.violet}" stroke-width="${g.width || 1.5}" stroke-dasharray="2 4" opacity="${g.opacity ?? 0.55}" />` +
        (g.label ? `<text class="cross-label" x="${sx(g.x) + 5}" y="${margin.top + plotH - 8}" fill="${g.color || COLORS.violet}">${esc(g.label)}</text>` : "");
    })
    .join("");

  const curveSvg = curves
    .map((curve) => {
      const pts = curve.points || samplePoints(curve.fn, xDomain);
      return `<polyline clip-path="url(#${id})" points="${linePoints(pts)}" fill="none" stroke="${curve.color}" stroke-width="${curve.width || 3}" stroke-linecap="round" stroke-linejoin="round" ${curve.dash ? `stroke-dasharray="${curve.dash}"` : ""} opacity="${curve.opacity || 1}" />`;
    })
    .join("");

  const segSvg = segments
    .map((seg) => {
      const x1 = sx(seg.x1);
      const x2 = sx(seg.x2);
      const y1 = sy(seg.y1);
      const y2 = sy(seg.y2);
      return `<line clip-path="url(#${id})" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${seg.color || COLORS.coral}" stroke-width="${seg.width || 4}" stroke-linecap="round" ${seg.dash ? `stroke-dasharray="${seg.dash}"` : ""}/>` +
        (seg.label
          ? `<text class="marker-label" x="${(x1 + x2) / 2}" y="${y1 - 8}" text-anchor="middle" fill="${seg.color || COLORS.coral}">${esc(seg.label)}</text>`
          : "");
    })
    .join("");

  const arrowDefs = arrows
    .map((arrow, i) => {
      const color = arrow.color || COLORS.teal;
      return `<marker id="${id}-arrow-${i}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="${color}" stroke="${color}" stroke-width="0.4" stroke-linejoin="round" />
      </marker>`;
    })
    .join("");

  const arrowSvg = arrows
    .filter((arrow) => !nearly(arrow.x1, arrow.x2) || !nearly(arrow.y1, arrow.y2))
    .map((arrow, i) => {
      const x1 = sx(arrow.x1);
      const y1 = sy(arrow.y1);
      const x2 = sx(arrow.x2);
      const y2 = sy(arrow.y2);
      const mx = (x1 + x2) / 2 + (arrow.labelDx || 0);
      const my = (y1 + y2) / 2 + (arrow.labelDy || -12);
      const color = arrow.color || COLORS.teal;
      const w = arrow.width || 2.4;
      return `<line clip-path="url(#${id})" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ffffff" stroke-width="${w + 1.8}" stroke-linecap="round" opacity="0.85" />` +
        `<line clip-path="url(#${id})" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" stroke-linecap="round" marker-end="url(#${id}-arrow-${i})" opacity="${arrow.opacity || 0.95}" ${arrow.dash ? `stroke-dasharray="${arrow.dash}"` : ""}/>` +
        (arrow.label
          ? `<text class="arrow-label" x="${clamp(mx, margin.left + 14, margin.left + plotW - 14)}" y="${clamp(my, margin.top + 16, margin.top + plotH - 10)}" text-anchor="middle" fill="${color}">${esc(arrow.label)}</text>`
          : "");
    })
    .join("");

  const markerSvg = markers
    .map((m) => {
      const x = sx(m.x);
      const y = sy(m.y);
      const labelX = clamp(x + (m.dx ?? 10), margin.left + 8, margin.left + plotW - 8);
      const labelY = clamp(y + (m.dy ?? -10), margin.top + 12, margin.top + plotH - 8);
      const r = m.r || 5;
      const isHero = !!m.pulse;
      const ring = isHero
        ? `<circle cx="${x}" cy="${y}" r="${r + 4}" fill="none" stroke="${m.color || COLORS.ink}" stroke-width="2" opacity="0.55"><animate attributeName="r" from="${r + 2}" to="${r + 9}" dur="1.6s" repeatCount="indefinite" /><animate attributeName="opacity" from="0.55" to="0" dur="1.6s" repeatCount="indefinite" /></circle>`
        : "";
      return `${m.guides ? `<line x1="${x}" x2="${x}" y1="${y}" y2="${margin.top + plotH}" stroke="${m.color || COLORS.ink}" stroke-dasharray="4 4" opacity="0.55"/><line x1="${margin.left}" x2="${x}" y1="${y}" y2="${y}" stroke="${m.color || COLORS.ink}" stroke-dasharray="4 4" opacity="0.55"/>` : ""}` +
        ring +
        `<circle cx="${x}" cy="${y}" r="${r}" fill="${m.color || COLORS.ink}" stroke="#fff" stroke-width="2" />` +
        (m.label ? `<text class="marker-label" x="${labelX}" y="${labelY}" text-anchor="${m.anchor || "start"}" fill="${m.color || COLORS.ink}">${esc(m.label)}</text>` : "");
    })
    .join("");

  return `<article class="chart-card ${wide ? "wide" : ""}">
    <div class="chart-top">
      <div>
        <h3 class="chart-title">${esc(title)}</h3>
        ${subtitle ? `<p class="chart-subtitle">${esc(subtitle)}</p>` : ""}
      </div>
      <div class="legend">${legend}</div>
    </div>
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">
      <defs><clipPath id="${id}"><rect x="${margin.left}" y="${margin.top}" width="${plotW}" height="${plotH}" /></clipPath>${arrowDefs}</defs>
      <rect x="0" y="0" width="${width}" height="${height}" fill="#fff"/>
      ${bandSvg}
      ${grid}
      <line x1="${margin.left}" x2="${margin.left + plotW}" y1="${margin.top + plotH}" y2="${margin.top + plotH}" stroke="#6c7781" stroke-width="1.5"/>
      <line x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${margin.top + plotH}" stroke="#6c7781" stroke-width="1.5"/>
      ${shiftSvg}
      ${refs}
      ${crossSvg}
      ${curveSvg}
      ${segSvg}
      ${arrowSvg}
      ${markerSvg}
      <text class="axis-label" x="${margin.left + plotW / 2}" y="${height - 14}" text-anchor="middle">${esc(xLabel)}</text>
      <text class="axis-label" transform="translate(20 ${margin.top + plotH / 2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text>
    </svg>
  </article>`;
}

function barChart({ title, subtitle = "", bars, yLabel = "Valor", wide = false }) {
  const id = `bar-${chartSerial++}`;
  const width = 660;
  const height = 420;
  const margin = { left: 72, right: 36, top: 30, bottom: 84 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const vals = bars.flatMap((b) => [b.base, b.value]);
  const yDomain = domainFrom(vals.concat([0]), 0.18);
  const sy = (y) => margin.top + plotH - ((y - yDomain[0]) / (yDomain[1] - yDomain[0])) * plotH;
  const zeroY = sy(0);
  const groupW = plotW / bars.length;
  const barW = Math.min(34, groupW / 3.2);
  const yTicks = ticks(yDomain, 5);
  const grid = yTicks
    .map(
      (y) =>
        `<line x1="${margin.left}" x2="${margin.left + plotW}" y1="${sy(y)}" y2="${sy(y)}" stroke="#edf1f3" />` +
        `<text class="tick-label" x="${margin.left - 12}" y="${sy(y) + 4}" text-anchor="end">${fmt(y, 1)}</text>`,
    )
    .join("");
  const columns = bars
    .map((bar, i) => {
      const cx = margin.left + groupW * i + groupW / 2;
      const baseH = Math.abs(sy(bar.base) - zeroY);
      const valueH = Math.abs(sy(bar.value) - zeroY);
      const baseY = bar.base >= 0 ? sy(bar.base) : zeroY;
      const valueY = bar.value >= 0 ? sy(bar.value) : zeroY;
      return `<rect x="${cx - barW - 4}" y="${baseY}" width="${barW}" height="${baseH}" fill="${COLORS.base}" opacity="0.58" rx="5"/>
        <rect x="${cx + 4}" y="${valueY}" width="${barW}" height="${valueH}" fill="${bar.color || COLORS.teal}" rx="5"/>
        <text class="axis-label" x="${cx}" y="${margin.top + plotH + 24}" text-anchor="middle">${esc(bar.label)}</text>
        <text class="marker-label" x="${cx}" y="${margin.top + plotH + 46}" text-anchor="middle">${fmt(bar.value, bar.digits ?? 1, bar.unit || "")}</text>`;
    })
    .join("");
  return `<article class="chart-card ${wide ? "wide" : ""}">
    <div class="chart-top">
      <div>
        <h3 class="chart-title">${esc(title)}</h3>
        ${subtitle ? `<p class="chart-subtitle">${esc(subtitle)}</p>` : ""}
      </div>
      <div class="legend">
        <span class="legend-item" style="color:${COLORS.base}"><span class="legend-swatch"></span>Base</span>
        <span class="legend-item" style="color:${COLORS.teal}"><span class="legend-swatch"></span>Nuevo</span>
      </div>
    </div>
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#fff"/>
      ${grid}
      <line x1="${margin.left}" x2="${margin.left + plotW}" y1="${zeroY}" y2="${zeroY}" stroke="#6c7781" stroke-width="1.5"/>
      <line x1="${margin.left}" x2="${margin.left}" y1="${margin.top}" y2="${margin.top + plotH}" stroke="#6c7781" stroke-width="1.5"/>
      ${columns}
      <text class="axis-label" transform="translate(20 ${margin.top + plotH / 2}) rotate(-90)" text-anchor="middle">${esc(yLabel)}</text>
    </svg>
  </article>`;
}

function tablePanel(rows, note = "") {
  const body = rows
    .map((row) => {
      const delta = row.value - row.base;
      const cls = nearly(delta, 0) ? "delta-zero" : delta > 0 ? "delta-pos" : "delta-neg";
      return `<tr>
        <td>${esc(row.label)}</td>
        <td>${fmt(row.base, row.digits ?? 2, row.unit || "")}</td>
        <td>${fmt(row.value, row.digits ?? 2, row.unit || "")}</td>
        <td class="${cls}">${signed(delta, row.digits ?? 2, row.unit || "")}</td>
      </tr>`;
    })
    .join("");
  return `<section class="table-panel">
    <h3 class="panel-title">Tabla numérica del escenario</h3>
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr><th>Variable</th><th>Base</th><th>Nuevo</th><th>Cambio</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    ${note ? `<p class="footnote">${esc(note)}</p>` : ""}
  </section>`;
}

function termHTML(baseValue, curValue, digits = 2, unit = "") {
  const same = nearly(baseValue, curValue);
  const cls = same ? "term term-same" : curValue > baseValue ? "term term-up" : "term term-down";
  const arrow = same ? "" : curValue > baseValue ? " ↑" : " ↓";
  const tip = same ? `${fmt(curValue, digits, unit)}` : `Base ${fmt(baseValue, digits, unit)} → ${fmt(curValue, digits, unit)}`;
  return `<span class="${cls}" title="${esc(tip)}">${fmt(curValue, digits, unit)}${arrow}</span>`;
}

function termRaw(text, changed = false, kind = "neutral") {
  if (!changed) return `<span class="term term-same">${esc(text)}</span>`;
  const cls = kind === "up" ? "term-up" : kind === "down" ? "term-down" : "term-neutral";
  return `<span class="term ${cls}">${esc(text)}</span>`;
}

function equationsPanel(items = []) {
  if (!items.length) return "";
  const cards = items
    .map((item) => {
      const baseLine = item.baseHTML
        ? `<div class="eq-line eq-line-base"><span class="eq-tag">Base</span><span class="eq-eval">${item.baseHTML}</span></div>`
        : "";
      const curLine = item.curHTML
        ? `<div class="eq-line eq-line-cur"><span class="eq-tag">Nuevo</span><span class="eq-eval">${item.curHTML}</span></div>`
        : "";
      const note = item.note ? `<p class="eq-note">${esc(item.note)}</p>` : "";
      return `<article class="equation-card">
        <header class="equation-head">
          <span class="equation-label">${esc(item.label)}</span>
          ${item.tag ? `<span class="equation-tag">${esc(item.tag)}</span>` : ""}
        </header>
        <div class="equation-formula">${item.formula}</div>
        <div class="equation-body">${baseLine}${curLine}</div>
        ${note}
      </article>`;
    })
    .join("");
  return `<section class="equations-panel">
    <header class="equations-head">
      <h3 class="panel-title">Ecuaciones de equilibrio</h3>
      <span class="equations-hint">Verde sube, rojo baja respecto al escenario base</span>
    </header>
    <div class="equations-grid">${cards}</div>
  </section>`;
}

function shocksTablePanel(spec) {
  if (!spec || !spec.columns || !spec.rows || !spec.rows.length) return "";
  const symFor = (v) => {
    if (v === "up" || v === "↑") return "↑";
    if (v === "down" || v === "↓") return "↓";
    if (v === "mixed" || v === "⇄" || v === "~") return "⇄";
    if (v === "flat" || v === "—" || v === "-") return "—";
    return v || "—";
  };
  const clsFor = (v) => {
    if (v === "up" || v === "↑") return "arrow-up";
    if (v === "down" || v === "↓") return "arrow-down";
    if (v === "mixed" || v === "⇄" || v === "~") return "arrow-mixed";
    return "arrow-flat";
  };
  const head = `<th>Choque</th>${spec.columns.map((c) => `<th>${esc(c.label || c.key)}</th>`).join("")}`;
  const body = spec.rows
    .map((r) => {
      const cells = spec.columns
        .map((c) => {
          const e = (r.effects || {})[c.key];
          return `<td class="${clsFor(e)}" title="${esc(c.label || c.key)}">${symFor(e)}</td>`;
        })
        .join("");
      return `<tr><td class="var-name">${esc(r.shock)}${r.note ? ` <span class="footnote">· ${esc(r.note)}</span>` : ""}</td>${cells}</tr>`;
    })
    .join("");
  return `<section class="shocks-panel">
    <header class="connection-head">
      <h3 class="panel-title">${esc(spec.title || "Estática comparativa teórica")}</h3>
      <span class="connection-hint">${esc(spec.hint || "↑ aumenta · ↓ disminuye · — sin cambio · ⇄ ambiguo")}</span>
    </header>
    ${spec.subtitle ? `<p class="footnote" style="margin-top:6px">${esc(spec.subtitle)}</p>` : ""}
    <div class="data-table-wrap">
      <table class="shock-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </section>`;
}

function explainPanel(model, params, steps) {
  const chips = changedChips(model, params);
  return `<section class="explain-panel">
    <h3 class="panel-title">Secuencia del choque</h3>
    <div class="shock-line">${
      chips.length
        ? chips.map((chip) => `<span class="shock-chip">${esc(chip)}</span>`).join("")
        : '<span class="shock-chip">Escenario base sin desplazamiento</span>'
    }</div>
    <ol class="steps">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
  </section>`;
}

function changedChips(model, params) {
  const chips = [];
  for (const control of model.controls) {
    if (control.type === "group") continue;
    if (control.type === "segmented") {
      if (params[control.key] !== model.defaults[control.key]) {
        const opt = control.options.find((o) => o.value === params[control.key]);
        chips.push(`${control.label}: ${opt ? opt.label : params[control.key]}`);
      }
      continue;
    }
    const current = Number(params[control.key]);
    const base = Number(model.defaults[control.key]);
    if (!nearly(current, base)) {
      const arrow = current > base ? "↑" : "↓";
      chips.push(`${arrow} ${control.label}`);
    }
  }
  return chips.slice(0, 8);
}

function formulas(items) {
  return `<div class="formula-row">${items.map((x) => `<span class="formula-chip">${esc(x)}</span>`).join("")}</div>`;
}

function linkValue(link) {
  const unit = link.unit || "";
  if (link.base === undefined || link.value === undefined) return "";
  const delta = Number(link.value) - Number(link.base);
  const cls = nearly(delta, 0) ? "delta-zero" : delta > 0 ? "delta-pos" : "delta-neg";
  return `<span class="link-values">
    <span>Base ${fmt(link.base, link.digits ?? 2, unit)}</span>
    <span>Nuevo ${fmt(link.value, link.digits ?? 2, unit)}</span>
    <span class="${cls}">${signed(delta, link.digits ?? 2, unit)}</span>
  </span>`;
}

function connectionPanel(links = []) {
  if (!links.length) return "";
  return `<section class="connection-panel">
    <div class="connection-head">
      <h3 class="panel-title">Conexión entre gráficas</h3>
      <span class="connection-hint">Sigue el mismo color y la misma variable de un panel al siguiente</span>
    </div>
    <div class="connection-map">
      ${links
        .map(
          (link) => `<div class="flow-link" style="--link:${link.color || COLORS.teal}">
            <div class="flow-node">${esc(link.from)}</div>
            <div class="flow-mid">
              <span class="flow-arrow"></span>
              <span class="flow-variable">${esc(link.variable)}</span>
              ${linkValue(link)}
              ${link.note ? `<span class="flow-note">${esc(link.note)}</span>` : ""}
            </div>
            <div class="flow-node">${esc(link.to)}</div>
          </div>`,
        )
        .join("")}
    </div>
  </section>`;
}

function row(label, base, value, digits = 2, unit = "") {
  return { label, base, value, digits, unit };
}

function moveArrow(base, cur, label, color = COLORS.teal, extra = {}) {
  if (!base || !cur || (nearly(base.x, cur.x) && nearly(base.y, cur.y))) return [];
  return [{ x1: base.x, y1: base.y, x2: cur.x, y2: cur.y, label, color, ...extra }];
}

function direction(value, up = "aumenta", down = "cae") {
  if (nearly(value, 0)) return "no cambia";
  return value > 0 ? up : down;
}

function computePib(p) {
  const NX = p.X - p.M;
  const Y = p.C + p.I + p.G + NX;
  return { ...p, NX, Y, absorption: p.C + p.I + p.G };
}

function renderPib(base, cur) {
  const charts = [
    barChart({
      title: "PIB por componentes del gasto",
      subtitle: "Identidad contable de economía abierta: el PIB sube con C, I, G y X; baja con M.",
      yLabel: "Unidades teóricas",
      bars: [
        { label: "C", base: base.C, value: cur.C, color: COLORS.teal },
        { label: "I", base: base.I, value: cur.I, color: COLORS.blue },
        { label: "G", base: base.G, value: cur.G, color: COLORS.amber },
        { label: "NX", base: base.NX, value: cur.NX, color: cur.NX >= 0 ? COLORS.green : COLORS.coral },
        { label: "Y", base: base.Y, value: cur.Y, color: COLORS.violet },
      ],
    }),
    barChart({
      title: "Canal externo",
      subtitle: "Exportaciones netas = exportaciones menos importaciones.",
      yLabel: "Unidades teóricas",
      bars: [
        { label: "X", base: base.X, value: cur.X, color: COLORS.green },
        { label: "M", base: base.M, value: cur.M, color: COLORS.coral },
        { label: "NX", base: base.NX, value: cur.NX, color: COLORS.teal },
        { label: "Abs.", base: base.absorption, value: cur.absorption, color: COLORS.blue },
      ],
    }),
  ].join("");
  const equations = [
    {
      label: "Identidad del PIB",
      tag: "Y = C + I + G + XN",
      formula: "Y = C + I + G + (X − M)",
      baseHTML: `Y = ${termHTML(base.C, base.C, 1)} + ${termHTML(base.I, base.I, 1)} + ${termHTML(base.G, base.G, 1)} + (${termHTML(base.X, base.X, 1)} − ${termHTML(base.M, base.M, 1)}) = <b>${fmt(base.Y, 1)}</b>`,
      curHTML: `Y = ${termHTML(base.C, cur.C, 1)} + ${termHTML(base.I, cur.I, 1)} + ${termHTML(base.G, cur.G, 1)} + (${termHTML(base.X, cur.X, 1)} − ${termHTML(base.M, cur.M, 1)}) = <b>${fmt(cur.Y, 1)}</b>`,
    },
    {
      label: "Exportaciones netas",
      tag: "XN = X − M",
      formula: "XN = X − M",
      baseHTML: `XN = ${termHTML(base.X, base.X, 1)} − ${termHTML(base.M, base.M, 1)} = <b>${fmt(base.NX, 1)}</b>`,
      curHTML: `XN = ${termHTML(base.X, cur.X, 1)} − ${termHTML(base.M, cur.M, 1)} = <b>${fmt(cur.NX, 1)}</b>`,
      note: "Si M crece más que X, las XN se vuelven negativas y el país absorbe más de lo que produce.",
    },
    {
      label: "Absorción doméstica",
      tag: "A = C + I + G",
      formula: "Absorción = C + I + G = Y − XN",
      baseHTML: `A = ${termHTML(base.C, base.C, 1)} + ${termHTML(base.I, base.I, 1)} + ${termHTML(base.G, base.G, 1)} = <b>${fmt(base.absorption, 1)}</b>`,
      curHTML: `A = ${termHTML(base.C, cur.C, 1)} + ${termHTML(base.I, cur.I, 1)} + ${termHTML(base.G, cur.G, 1)} = <b>${fmt(cur.absorption, 1)}</b>`,
    },
  ];
  return {
    formulas: ["Y = C + I + G + XN", "XN = X - M", "Absorción = C + I + G"],
    links: [
      {
        from: "Canal externo",
        variable: "XN",
        base: base.NX,
        value: cur.NX,
        color: COLORS.green,
        to: "PIB por gasto",
        note: "El valor X - M aparece como componente de la identidad de gasto.",
      },
      {
        from: "Gasto interno",
        variable: "C + I + G",
        base: base.absorption,
        value: cur.absorption,
        color: COLORS.teal,
        to: "PIB total",
        note: "La absorción doméstica y XN se suman para obtener Y.",
      },
    ],
    charts,
    equations,
    steps: [
      `El gasto interno pasa de ${fmt(base.absorption, 1)} a ${fmt(cur.absorption, 1)} unidades.`,
      `Las exportaciones netas pasan de ${fmt(base.NX, 1)} a ${fmt(cur.NX, 1)}; una importación adicional resta producción doméstica medida por el PIB.`,
      `El PIB teórico resultante ${direction(cur.Y - base.Y)} de ${fmt(base.Y, 1)} a ${fmt(cur.Y, 1)}.`,
    ],
    rows: [
      row("Consumo C", base.C, cur.C, 1),
      row("Inversión I", base.I, cur.I, 1),
      row("Gasto público G", base.G, cur.G, 1),
      row("Exportaciones X", base.X, cur.X, 1),
      row("Importaciones M", base.M, cur.M, 1),
      row("Exportaciones netas XN", base.NX, cur.NX, 1),
      row("PIB Y", base.Y, cur.Y, 1),
    ],
    shocks: {
      title: "Estática comparativa · Identidad contable Y = C + I + G + XN",
      subtitle: "Identidad pura: cada componente entra punto a punto en el PIB. XN = X − M.",
      columns: [
        { key: "Y", label: "PIB" },
        { key: "NX", label: "XN" },
        { key: "abs", label: "Absorción" },
      ],
      rows: [
        { shock: "↑ C  (consumo)", effects: { Y: "up", NX: "flat", abs: "up" } },
        { shock: "↑ I  (inversión)", effects: { Y: "up", NX: "flat", abs: "up" } },
        { shock: "↑ G  (gasto público)", effects: { Y: "up", NX: "flat", abs: "up" } },
        { shock: "↑ X  (exportaciones)", effects: { Y: "up", NX: "up", abs: "flat" } },
        { shock: "↑ M  (importaciones)", effects: { Y: "down", NX: "down", abs: "flat" }, note: "M se resta del PIB" },
      ],
    },
  };
}

function computeProduction(p) {
  const Y = p.A * Math.pow(p.K, p.alpha) * Math.pow(p.L, 1 - p.alpha);
  const MPL = ((1 - p.alpha) * Y) / p.L;
  const MPK = (p.alpha * Y) / p.K;
  return {
    ...p,
    Y,
    MPL,
    MPK,
    laborIncome: MPL * p.L,
    capitalIncome: MPK * p.K,
  };
}

function renderProduction(base, cur) {
  const xK = [30, 230];
  const laborX = [35, 180];
  const maxW = Math.max(base.MPL, cur.MPL, 1.3) * 1.8;
  const charts = [
    lineChart({
      title: "Función de producción",
      subtitle: "La producción potencial depende de tecnología, capital y trabajo.",
      xLabel: "Capital K",
      yLabel: "Producto Y",
      xDomain: xK,
      yDomain: domainFrom([0, base.Y, cur.Y, computeProduction({ ...cur, K: 230 }).Y], 0.1, true),
      curves: [
        {
          label: "Base",
          color: COLORS.base,
          dash: "7 6",
          points: samplePoints((K) => computeProduction({ ...base, K }).Y, xK),
        },
        {
          label: "Nuevo",
          color: COLORS.teal,
          points: samplePoints((K) => computeProduction({ ...cur, K }).Y, xK),
        },
      ],
      markers: [
        { x: base.K, y: base.Y, label: "Base", color: COLORS.base, guides: true },
        { x: cur.K, y: cur.Y, label: "Nuevo", color: COLORS.teal, guides: true },
      ],
      arrows: moveArrow({ x: base.K, y: base.Y }, { x: cur.K, y: cur.Y }, "Y*", COLORS.teal),
    }),
    lineChart({
      title: "Mercado de trabajo",
      subtitle: "La demanda de trabajo sigue el producto marginal del trabajo; la oferta se toma fija.",
      xLabel: "Trabajo L",
      yLabel: "Salario real w/P",
      xDomain: laborX,
      yDomain: [0, maxW],
      curves: [
        {
          label: "PMgL base",
          color: COLORS.base,
          dash: "7 6",
          points: samplePoints((L) => computeProduction({ ...base, L }).MPL, laborX),
        },
        {
          label: "PMgL nuevo",
          color: COLORS.blue,
          points: samplePoints((L) => computeProduction({ ...cur, L }).MPL, laborX),
        },
      ],
      vLines: [
        { x: base.L, label: "L base", color: COLORS.base, dash: "5 5" },
        { x: cur.L, label: "L", color: COLORS.blue },
      ],
      markers: [
        { x: cur.L, y: cur.MPL, label: `w/P=${fmt(cur.MPL, 2)}`, color: COLORS.blue, guides: true },
      ],
      arrows: moveArrow({ x: base.L, y: base.MPL }, { x: cur.L, y: cur.MPL }, "PMgL", COLORS.blue),
    }),
    barChart({
      title: "Distribución funcional del ingreso",
      subtitle: "En competencia, cada factor recibe su producto marginal.",
      yLabel: "Ingreso",
      bars: [
        { label: "Trabajo", base: base.laborIncome, value: cur.laborIncome, color: COLORS.green },
        { label: "Capital", base: base.capitalIncome, value: cur.capitalIncome, color: COLORS.amber },
        { label: "Y", base: base.Y, value: cur.Y, color: COLORS.violet },
      ],
      wide: true,
    }),
  ].join("");
  const equations = [
    {
      label: "Función de producción Cobb-Douglas",
      tag: "Y = A K^α L^(1-α)",
      formula: "Y = A · K^α · L^(1−α)",
      baseHTML: `Y = ${termHTML(base.A, base.A, 2)} · ${termHTML(base.K, base.K, 1)}^${termHTML(base.alpha, base.alpha, 2)} · ${termHTML(base.L, base.L, 1)}^(1−${termHTML(base.alpha, base.alpha, 2)}) = <b>${fmt(base.Y, 2)}</b>`,
      curHTML: `Y = ${termHTML(base.A, cur.A, 2)} · ${termHTML(base.K, cur.K, 1)}^${termHTML(base.alpha, cur.alpha, 2)} · ${termHTML(base.L, cur.L, 1)}^(1−${termHTML(base.alpha, cur.alpha, 2)}) = <b>${fmt(cur.Y, 2)}</b>`,
    },
    {
      label: "Salario real",
      tag: "w/P = PMgL",
      formula: "w/P = (1 − α) · Y / L",
      baseHTML: `w/P = (1 − ${termHTML(base.alpha, base.alpha, 2)}) · ${termHTML(base.Y, base.Y, 2)} / ${termHTML(base.L, base.L, 1)} = <b>${fmt(base.MPL, 3)}</b>`,
      curHTML: `w/P = (1 − ${termHTML(base.alpha, cur.alpha, 2)}) · ${termHTML(base.Y, cur.Y, 2)} / ${termHTML(base.L, cur.L, 1)} = <b>${fmt(cur.MPL, 3)}</b>`,
    },
    {
      label: "Renta real del capital",
      tag: "r/P = PMgK",
      formula: "r/P = α · Y / K",
      baseHTML: `r/P = ${termHTML(base.alpha, base.alpha, 2)} · ${termHTML(base.Y, base.Y, 2)} / ${termHTML(base.K, base.K, 1)} = <b>${fmt(base.MPK, 3)}</b>`,
      curHTML: `r/P = ${termHTML(base.alpha, cur.alpha, 2)} · ${termHTML(base.Y, cur.Y, 2)} / ${termHTML(base.K, cur.K, 1)} = <b>${fmt(cur.MPK, 3)}</b>`,
      note: "En competencia, el ingreso del capital es α·Y y el del trabajo (1−α)·Y. Suman el producto Y.",
    },
  ];
  return {
    formulas: ["Y = A K^α L^(1-α)", "w/P = PMgL", "r/P = PMgK"],
    links: [
      {
        from: "Producción",
        variable: "Y potencial",
        base: base.Y,
        value: cur.Y,
        color: COLORS.teal,
        to: "Ingreso factorial",
        note: "El producto generado se distribuye entre trabajo y capital.",
      },
      {
        from: "PMgL",
        variable: "w/P",
        base: base.MPL,
        value: cur.MPL,
        color: COLORS.blue,
        to: "Mercado de trabajo",
        note: "El salario real se lee en el punto de la demanda de trabajo.",
      },
    ],
    charts,
    equations,
    steps: [
      `La producción potencial ${direction(cur.Y - base.Y)} porque cambia la combinación de tecnología, capital o trabajo disponible.`,
      `La curva de producto marginal del trabajo se desplaza cuando cambian A o K; con L fijo, el salario real de equilibrio queda en PMgL.`,
      `El ingreso se reparte entre trabajo y capital según sus productos marginales: trabajo recibe ${fmt(cur.laborIncome, 1)} y capital ${fmt(cur.capitalIncome, 1)}.`,
    ],
    rows: [
      row("Producto potencial Y", base.Y, cur.Y, 2),
      row("Salario real w/P", base.MPL, cur.MPL, 3),
      row("Renta real del capital r/P", base.MPK, cur.MPK, 3),
      row("Ingreso del trabajo", base.laborIncome, cur.laborIncome, 2),
      row("Ingreso del capital", base.capitalIncome, cur.capitalIncome, 2),
    ],
    shocks: {
      title: "Estática comparativa · Función de producción y mercados de factores",
      subtitle: "Y = A·K^α·L^(1−α). En competencia, w/P = PMgL y r/P = PMgK.",
      columns: [
        { key: "Y", label: "Y potencial" },
        { key: "w", label: "w/P" },
        { key: "r", label: "r/P" },
        { key: "wL", label: "Ingreso L" },
        { key: "rK", label: "Ingreso K" },
      ],
      rows: [
        { shock: "↑ A  (tecnología)", effects: { Y: "up", w: "up", r: "up", wL: "up", rK: "up" }, note: "ambos factores ganan" },
        { shock: "↑ K  (más capital)", effects: { Y: "up", w: "up", r: "down", wL: "up", rK: "mixed" }, note: "PMgK cae por rendim. decrec." },
        { shock: "↑ L  (más trabajo)", effects: { Y: "up", w: "down", r: "up", wL: "mixed", rK: "up" } },
        { shock: "↑ α  (peso del capital)", effects: { Y: "flat", w: "down", r: "up", wL: "down", rK: "up" }, note: "redistribuye hacia K" },
      ],
    },
  };
}

function computeClosed(p) {
  const autonomousC = p.a + p.c * (p.Y - p.T);
  const S0 = p.Y - autonomousC - p.G;
  const r = (p.h - S0) / (p.b + p.d);
  const C = p.a + p.c * (p.Y - p.T) - p.d * r;
  const I = p.h - p.b * r;
  const S = p.Y - C - p.G;
  return { ...p, autonomousC, S0, r, C, I, S, privateSaving: p.Y - p.T - C, publicSaving: p.T - p.G };
}

function renderClosed(base, cur) {
  const rMax = Math.max(8, base.r, cur.r) + 1.5;
  const rDomain = [0, rMax];
  const qVals = [base.S, base.I, cur.S, cur.I, base.h, cur.h, base.S0 + base.d * rMax, cur.S0 + cur.d * rMax];
  const xDomain = domainFrom(qVals.concat([0]), 0.15, true);
  const sBaseFn = (r) => base.S0 + base.d * r;
  const sCurFn = (r) => cur.S0 + cur.d * r;
  const iBaseFn = (r) => base.h - base.b * r;
  const iCurFn = (r) => cur.h - cur.b * r;
  const charts = [
    lineChart({
      title: "Mercado financiero: ahorro e inversión",
      subtitle: "La tasa de interés equilibra ahorro nacional e inversión deseada.",
      xLabel: "Fondos prestables",
      yLabel: "Tasa de interés r",
      xDomain,
      yDomain: rDomain,
      shifts: [
        { basePoints: pointsFromY(sBaseFn, rDomain), newPoints: pointsFromY(sCurFn, rDomain), color: COLORS.green, opacity: 0.16 },
        { basePoints: pointsFromY(iBaseFn, rDomain), newPoints: pointsFromY(iCurFn, rDomain), color: COLORS.coral, opacity: 0.14 },
      ],
      curves: [
        { label: "S base", color: COLORS.base, dash: "7 6", points: pointsFromY(sBaseFn, rDomain) },
        { label: "I base", color: COLORS.base, dash: "2 5", points: pointsFromY(iBaseFn, rDomain) },
        { label: "S nuevo", color: COLORS.green, points: pointsFromY(sCurFn, rDomain) },
        { label: "I nuevo", color: COLORS.coral, points: pointsFromY(iCurFn, rDomain) },
      ],
      crossGuides: [{ orientation: "h", y: cur.r, color: COLORS.amber, label: `r = ${fmt(cur.r, 2)}%` }],
      markers: [
        { x: base.S, y: base.r, label: "Base", color: COLORS.base, guides: true },
        { x: cur.S, y: cur.r, label: "Nuevo", color: COLORS.teal, guides: true, pulse: true },
      ],
      arrows: moveArrow({ x: base.S, y: base.r }, { x: cur.S, y: cur.r }, "S = I", COLORS.teal),
    }),
    barChart({
      title: "Uso del producto",
      subtitle: "En equilibrio de bienes: Y = C + I + G.",
      yLabel: "Unidades",
      bars: [
        { label: "C", base: base.C, value: cur.C, color: COLORS.teal },
        { label: "I", base: base.I, value: cur.I, color: COLORS.coral },
        { label: "G", base: base.G, value: cur.G, color: COLORS.amber },
        { label: "S", base: base.S, value: cur.S, color: COLORS.green },
      ],
    }),
    lineChart({
      title: "Consumo e inversión frente a r",
      subtitle: "La variante modificada permite que el consumo responda a la tasa de interés.",
      xLabel: "Tasa de interés r",
      yLabel: "C e I",
      xDomain: rDomain,
      yDomain: domainFrom([0, base.C, cur.C, base.I, cur.I, base.h, cur.h, cur.autonomousC], 0.15, true),
      curves: [
        { label: "C base", color: COLORS.base, dash: "7 6", points: samplePoints((r) => base.a + base.c * (base.Y - base.T) - base.d * r, rDomain) },
        { label: "I base", color: COLORS.base, dash: "2 5", points: samplePoints((r) => base.h - base.b * r, rDomain) },
        { label: "C nuevo", color: COLORS.teal, points: samplePoints((r) => cur.a + cur.c * (cur.Y - cur.T) - cur.d * r, rDomain) },
        { label: "I nuevo", color: COLORS.coral, points: samplePoints((r) => cur.h - cur.b * r, rDomain) },
      ],
      crossGuides: [{ orientation: "v", x: cur.r, color: COLORS.amber, label: `r = ${fmt(cur.r, 2)}%` }],
      markers: [
        { x: cur.r, y: cur.C, label: `C*=${fmt(cur.C, 1)}`, color: COLORS.teal, guides: true },
        { x: cur.r, y: cur.I, label: `I*=${fmt(cur.I, 1)}`, color: COLORS.coral, dy: 22 },
      ],
      wide: true,
    }),
  ].join("");
  const equations = [
    {
      label: "Consumo",
      tag: "C(Y-T, r)",
      formula: "C = a + c · (Y − T) − d · r",
      baseHTML: `C = ${termHTML(base.a, base.a, 1)} + ${termHTML(base.c, base.c, 2)} · (${termHTML(base.Y, base.Y, 1)} − ${termHTML(base.T, base.T, 1)}) − ${termHTML(base.d, base.d, 2)} · ${termHTML(base.r, base.r, 2, "%")} = <b>${fmt(base.C, 2)}</b>`,
      curHTML: `C = ${termHTML(base.a, cur.a, 1)} + ${termHTML(base.c, cur.c, 2)} · (${termHTML(base.Y, cur.Y, 1)} − ${termHTML(base.T, cur.T, 1)}) − ${termHTML(base.d, cur.d, 2)} · ${termHTML(base.r, cur.r, 2, "%")} = <b>${fmt(cur.C, 2)}</b>`,
    },
    {
      label: "Inversión",
      tag: "I(r)",
      formula: "I = h − b · r",
      baseHTML: `I = ${termHTML(base.h, base.h, 1)} − ${termHTML(base.b, base.b, 2)} · ${termHTML(base.r, base.r, 2, "%")} = <b>${fmt(base.I, 2)}</b>`,
      curHTML: `I = ${termHTML(base.h, cur.h, 1)} − ${termHTML(base.b, cur.b, 2)} · ${termHTML(base.r, cur.r, 2, "%")} = <b>${fmt(cur.I, 2)}</b>`,
    },
    {
      label: "Ahorro nacional",
      tag: "S = Y − C − G",
      formula: "S = Y − C − G",
      baseHTML: `S = ${termHTML(base.Y, base.Y, 1)} − ${termHTML(base.C, base.C, 2)} − ${termHTML(base.G, base.G, 1)} = <b>${fmt(base.S, 2)}</b>`,
      curHTML: `S = ${termHTML(base.Y, cur.Y, 1)} − ${termHTML(base.C, cur.C, 2)} − ${termHTML(base.G, cur.G, 1)} = <b>${fmt(cur.S, 2)}</b>`,
    },
    {
      label: "Equilibrio del mercado financiero",
      tag: "S = I → r",
      formula: "h − b·r = (Y − a − c(Y−T) − G) + d·r ⇒ r = (h − S₀)/(b + d)",
      baseHTML: `r = (${termHTML(base.h, base.h, 1)} − ${termHTML(base.S0, base.S0, 2)}) / (${termHTML(base.b, base.b, 2)} + ${termHTML(base.d, base.d, 2)}) = <b>${fmt(base.r, 2)}%</b>`,
      curHTML: `r = (${termHTML(base.h, cur.h, 1)} − ${termHTML(base.S0, cur.S0, 2)}) / (${termHTML(base.b, cur.b, 2)} + ${termHTML(base.d, cur.d, 2)}) = <b>${fmt(cur.r, 2)}%</b>`,
      note: "La tasa que iguala oferta y demanda de fondos es la que se lee en el cruce de las curvas.",
    },
  ];
  return {
    formulas: ["C = a + c(Y - T) - d r", "I = h - b r", "S = Y - C - G", "S = I"],
    links: [
      {
        from: "Ahorro S(r)",
        variable: "r de equilibrio",
        base: base.r,
        value: cur.r,
        unit: "%",
        color: COLORS.amber,
        to: "Inversión I(r)",
        note: "El mismo punto de corte fija simultáneamente la tasa y la cantidad de fondos.",
      },
      {
        from: "Mercado financiero",
        variable: "S = I",
        base: base.S,
        value: cur.S,
        color: COLORS.green,
        to: "Uso del producto",
        note: "La inversión que aparece en Y = C + I + G coincide con el cruce del primer gráfico.",
      },
    ],
    charts,
    equations,
    steps: [
      `El ahorro nacional se mueve de ${fmt(base.S, 2)} a ${fmt(cur.S, 2)} y la inversión deseada de ${fmt(base.I, 2)} a ${fmt(cur.I, 2)}.`,
      `La tasa de interés de equilibrio ${direction(cur.r - base.r)} de ${fmt(base.r, 2)} a ${fmt(cur.r, 2)} para cerrar la brecha entre S e I.`,
      `Si d es positivo, el consumo cae cuando sube r; por eso la curva de ahorro deja de ser vertical y parte del ajuste ocurre vía consumo.`,
    ],
    rows: [
      row("Consumo C", base.C, cur.C, 2),
      row("Inversión I", base.I, cur.I, 2),
      row("Ahorro nacional S", base.S, cur.S, 2),
      row("Ahorro privado", base.privateSaving, cur.privateSaving, 2),
      row("Ahorro público", base.publicSaving, cur.publicSaving, 2),
      row("Tasa de interés r", base.r, cur.r, 2, "%"),
    ],
    shocks: cur.d > 0
      ? {
          title: "Estática comparativa · Cerrada LP MODIFICADA (consumo responde a r)",
          subtitle: "Cuando d > 0, el ahorro tiene pendiente positiva en r; ↑G y ↑h ya no son neutrales sobre C.",
          columns: [
            { key: "C", label: "C" },
            { key: "I", label: "I" },
            { key: "r", label: "r" },
          ],
          rows: [
            { shock: "↑ Y  (más producto potencial)", effects: { C: "up", I: "up", r: "down" } },
            { shock: "↑ G  (gasto público)", effects: { C: "down", I: "down", r: "up" }, note: "↑r reduce C vía d" },
            { shock: "↑ T  (impuestos)", effects: { C: "down", I: "up", r: "down" } },
            { shock: "↑ a  (consumo autónomo)", effects: { C: "up", I: "down", r: "up" } },
            { shock: "↑ h  (inversión autónoma)", effects: { C: "down", I: "up", r: "up" }, note: "I sube en neto pero menos por crowding-out parcial" },
          ],
        }
      : {
          title: "Estática comparativa · Cerrada LP BÁSICA",
          subtitle: "El ahorro es vertical (no depende de r); ↑G genera crowding-out perfecto sobre I.",
          columns: [
            { key: "C", label: "C" },
            { key: "I", label: "I" },
            { key: "r", label: "r" },
          ],
          rows: [
            { shock: "↑ Y  (más producto potencial)", effects: { C: "up", I: "up", r: "down" } },
            { shock: "↑ G  (gasto público)", effects: { C: "flat", I: "down", r: "up" }, note: "crowding-out perfecto" },
            { shock: "↑ T  (impuestos)", effects: { C: "down", I: "up", r: "down" } },
            { shock: "↑ a  (consumo autónomo)", effects: { C: "up", I: "down", r: "up" } },
            { shock: "↑ h  (inversión autónoma)", effects: { C: "flat", I: "flat", r: "up" }, note: "I total no cambia (oferta de fondos fija)" },
          ],
        },
  };
}

function computeMoney(p) {
  const m = (p.ed + 1) / (p.ed + p.rd);
  const M = m * p.B;
  return { ...p, m, M };
}

function renderMoney(base, cur) {
  const rdDomain = [0.04, 0.42];
  const charts = [
    lineChart({
      title: "Multiplicador monetario",
      subtitle: "El multiplicador cae cuando sube R/D o E/D.",
      xLabel: "Reservas / depósitos",
      yLabel: "Multiplicador m",
      xDomain: rdDomain,
      yDomain: domainFrom([base.m, cur.m, 1, 6], 0.05, true),
      curves: [
        { label: "Base", color: COLORS.base, dash: "7 6", points: samplePoints((rd) => computeMoney({ ...base, rd }).m, rdDomain) },
        { label: "Nuevo", color: COLORS.teal, points: samplePoints((rd) => computeMoney({ ...cur, rd }).m, rdDomain) },
      ],
      markers: [
        { x: base.rd, y: base.m, label: "Base", color: COLORS.base, guides: true },
        { x: cur.rd, y: cur.m, label: "Nuevo", color: COLORS.teal, guides: true },
      ],
      arrows: moveArrow({ x: base.rd, y: base.m }, { x: cur.rd, y: cur.m }, "m", COLORS.teal),
    }),
    barChart({
      title: "Base monetaria y oferta de dinero",
      subtitle: "M = mB amplifica las operaciones del banco central.",
      yLabel: "Billones teóricos",
      bars: [
        { label: "B", base: base.B, value: cur.B, color: COLORS.blue },
        { label: "m", base: base.m, value: cur.m, color: COLORS.amber, digits: 2 },
        { label: "M", base: base.M, value: cur.M, color: COLORS.teal },
      ],
    }),
  ].join("");
  const equations = [
    {
      label: "Multiplicador bancario",
      tag: "m",
      formula: "m = (E/D + 1) / (E/D + R/D)",
      baseHTML: `m = (${termHTML(base.ed, base.ed, 2)} + 1) / (${termHTML(base.ed, base.ed, 2)} + ${termHTML(base.rd, base.rd, 2)}) = <b>${fmt(base.m, 2)}</b>`,
      curHTML: `m = (${termHTML(base.ed, cur.ed, 2)} + 1) / (${termHTML(base.ed, cur.ed, 2)} + ${termHTML(base.rd, cur.rd, 2)}) = <b>${fmt(cur.m, 2)}</b>`,
    },
    {
      label: "Oferta monetaria total",
      tag: "M = m · B",
      formula: "M = m · B",
      baseHTML: `M = ${termHTML(base.m, base.m, 2)} · ${termHTML(base.B, base.B, 1)} = <b>${fmt(base.M, 1)}</b>`,
      curHTML: `M = ${termHTML(base.m, cur.m, 2)} · ${termHTML(base.B, cur.B, 1)} = <b>${fmt(cur.M, 1)}</b>`,
      note: "Subir reservas/depósitos R/D o efectivo/depósitos E/D contrae m. Comprar bonos sube B y expande M.",
    },
  ];
  return {
    formulas: ["M = E + D", "B = E + R", "m = (E/D + 1) / (E/D + R/D)", "M = mB"],
    links: [
      {
        from: "Multiplicador",
        variable: "m",
        base: base.m,
        value: cur.m,
        color: COLORS.teal,
        to: "Oferta de dinero",
        note: "El multiplicador calculado en el primer gráfico amplifica la base B en el segundo.",
      },
      {
        from: "Banco central",
        variable: "B",
        base: base.B,
        value: cur.B,
        color: COLORS.blue,
        to: "M = mB",
        note: "Una operación sobre la base se transmite a M según el multiplicador vigente.",
      },
    ],
    charts,
    equations,
    steps: [
      `El multiplicador pasa de ${fmt(base.m, 2)} a ${fmt(cur.m, 2)} por los cambios en efectivo/depositos y reservas/depositos.`,
      `La oferta monetaria ${direction(cur.M - base.M)} porque M combina la base monetaria con el multiplicador bancario.`,
      `Un mayor encaje o mayor preferencia por efectivo contrae el multiplicador; una compra de bonos aumenta B y expande M.`,
    ],
    rows: [
      row("Base monetaria B", base.B, cur.B, 1),
      row("Efectivo / depósitos", base.ed, cur.ed, 2),
      row("Reservas / depósitos", base.rd, cur.rd, 2),
      row("Multiplicador m", base.m, cur.m, 2),
      row("Oferta monetaria M", base.M, cur.M, 1),
    ],
    shocks: {
      title: "Estática comparativa · Multiplicador bancario",
      subtitle: "M = m·B con m = (E/D + 1) / (E/D + R/D). El multiplicador cae cuando suben las fugas E/D o R/D.",
      columns: [
        { key: "m", label: "m" },
        { key: "M", label: "M" },
      ],
      rows: [
        { shock: "↑ B  (compra de bonos del BC)", effects: { m: "flat", M: "up" }, note: "OMA expansiva" },
        { shock: "↓ B  (venta de bonos del BC)", effects: { m: "flat", M: "down" }, note: "OMA contractiva" },
        { shock: "↑ R/D  (encaje o reservas excedentes)", effects: { m: "down", M: "down" } },
        { shock: "↓ R/D", effects: { m: "up", M: "up" } },
        { shock: "↑ E/D  (público demanda más efectivo)", effects: { m: "down", M: "down" } },
        { shock: "↓ E/D", effects: { m: "up", M: "up" } },
      ],
    },
  };
}

function computeInflation(p) {
  const P = (p.M * p.V) / p.Y;
  const pi = ((1 + p.mu) * (1 + p.vu)) / (1 + p.g) - 1;
  const i = Math.max(0.002, p.r + pi);
  const N = Math.sqrt((i * p.Y) / (2 * p.F));
  const cash = Math.sqrt((p.Y * p.F) / (2 * i));
  return { ...p, P, pi, i, N, cash };
}

function renderInflation(base, cur) {
  const mDomain = [40, 190];
  const iDomain = [0.01, 0.22];
  const charts = [
    lineChart({
      title: "Teoría cuantitativa del dinero",
      subtitle: "Con velocidad y producto dados, más dinero implica mayor nivel de precios.",
      xLabel: "Cantidad de dinero M",
      yLabel: "Nivel de precios P",
      xDomain: mDomain,
      yDomain: domainFrom([0, base.P, cur.P, (190 * cur.V) / cur.Y], 0.15, true),
      curves: [
        { label: "Base", color: COLORS.base, dash: "7 6", points: samplePoints((M) => (M * base.V) / base.Y, mDomain) },
        { label: "Nuevo", color: COLORS.teal, points: samplePoints((M) => (M * cur.V) / cur.Y, mDomain) },
      ],
      markers: [
        { x: base.M, y: base.P, label: "Base", color: COLORS.base, guides: true },
        { x: cur.M, y: cur.P, label: "Nuevo", color: COLORS.teal, guides: true },
      ],
      arrows: moveArrow({ x: base.M, y: base.P }, { x: cur.M, y: cur.P }, "MV=PY", COLORS.teal),
    }),
    lineChart({
      title: "Baumol-Tobin: demanda de efectivo",
      subtitle: "El costo de oportunidad de tener dinero aumenta con la tasa nominal.",
      xLabel: "Tasa nominal i",
      yLabel: "Saldo promedio óptimo",
      xDomain: iDomain,
      yDomain: domainFrom([base.cash, cur.cash, 0, 100], 0.1, true),
      curves: [
        { label: "Base", color: COLORS.base, dash: "7 6", points: samplePoints((i) => Math.sqrt((base.Y * base.F) / (2 * i)), iDomain) },
        { label: "Nuevo", color: COLORS.coral, points: samplePoints((i) => Math.sqrt((cur.Y * cur.F) / (2 * i)), iDomain) },
      ],
      markers: [{ x: cur.i, y: cur.cash, label: `i=${pct(cur.i, 1)}`, color: COLORS.coral, guides: true }],
      arrows: moveArrow({ x: base.i, y: base.cash }, { x: cur.i, y: cur.cash }, "i → dinero", COLORS.coral),
    }),
    barChart({
      title: "Crecimiento monetario e inflación",
      subtitle: "La inflación teórica recoge dinero, velocidad y crecimiento real.",
      yLabel: "Tasa",
      bars: [
        { label: "m", base: base.mu * 100, value: cur.mu * 100, color: COLORS.teal, unit: "%" },
        { label: "v", base: base.vu * 100, value: cur.vu * 100, color: COLORS.blue, unit: "%" },
        { label: "g", base: base.g * 100, value: cur.g * 100, color: COLORS.green, unit: "%" },
        { label: "π", base: base.pi * 100, value: cur.pi * 100, color: COLORS.coral, unit: "%" },
      ],
      wide: true,
    }),
  ].join("");
  const equations = [
    {
      label: "Teoría cuantitativa",
      tag: "MV = PY",
      formula: "P = M · V / Y",
      baseHTML: `P = ${termHTML(base.M, base.M, 1)} · ${termHTML(base.V, base.V, 2)} / ${termHTML(base.Y, base.Y, 1)} = <b>${fmt(base.P, 2)}</b>`,
      curHTML: `P = ${termHTML(base.M, cur.M, 1)} · ${termHTML(base.V, cur.V, 2)} / ${termHTML(base.Y, cur.Y, 1)} = <b>${fmt(cur.P, 2)}</b>`,
    },
    {
      label: "Inflación esperada",
      tag: "π ≈ m + v − g",
      formula: "(1 + π) = (1 + m)(1 + v) / (1 + g)",
      baseHTML: `π = (1 + ${termHTML(base.mu, base.mu, 3)})(1 + ${termHTML(base.vu, base.vu, 3)}) / (1 + ${termHTML(base.g, base.g, 3)}) − 1 = <b>${fmt(base.pi * 100, 2)}%</b>`,
      curHTML: `π = (1 + ${termHTML(base.mu, cur.mu, 3)})(1 + ${termHTML(base.vu, cur.vu, 3)}) / (1 + ${termHTML(base.g, cur.g, 3)}) − 1 = <b>${fmt(cur.pi * 100, 2)}%</b>`,
    },
    {
      label: "Ecuación de Fisher",
      tag: "i = r + πᵉ",
      formula: "i = r + π",
      baseHTML: `i = ${termHTML(base.r, base.r, 3)} + ${termHTML(base.pi, base.pi, 3)} = <b>${fmt(base.i * 100, 2)}%</b>`,
      curHTML: `i = ${termHTML(base.r, cur.r, 3)} + ${termHTML(base.pi, cur.pi, 3)} = <b>${fmt(cur.i * 100, 2)}%</b>`,
    },
    {
      label: "Baumol-Tobin (saldo óptimo de efectivo)",
      tag: "SPO = √(YF/2i)",
      formula: "Saldo óptimo = √(Y · F / (2 · i))",
      baseHTML: `SPO = √(${termHTML(base.Y, base.Y, 1)} · ${termHTML(base.F, base.F, 2)} / (2 · ${termHTML(base.i, base.i, 3)})) = <b>${fmt(base.cash, 2)}</b>`,
      curHTML: `SPO = √(${termHTML(base.Y, cur.Y, 1)} · ${termHTML(base.F, cur.F, 2)} / (2 · ${termHTML(base.i, cur.i, 3)})) = <b>${fmt(cur.cash, 2)}</b>`,
      note: "Mayor i ⇒ menor demanda de efectivo (porque el costo de oportunidad sube).",
    },
  ];
  return {
    formulas: ["MV = PY", "P = VM/Y", "π ≈ m + v - g", "i = r + πᵉ", "SPO = √(YF/2i)"],
    links: [
      {
        from: "Teoría cuantitativa",
        variable: "π esperada",
        base: base.pi * 100,
        value: cur.pi * 100,
        unit: "%",
        color: COLORS.coral,
        to: "Fisher",
        note: "La inflación derivada del dinero entra a la tasa nominal.",
      },
      {
        from: "Fisher",
        variable: "i",
        base: base.i * 100,
        value: cur.i * 100,
        unit: "%",
        color: COLORS.amber,
        to: "Baumol-Tobin",
        note: "La tasa nominal es el costo de oportunidad de mantener saldos reales.",
      },
    ],
    charts,
    equations,
    steps: [
      `El nivel de precios pasa de ${fmt(base.P, 2)} a ${fmt(cur.P, 2)} por la ecuación cuantitativa.`,
      `La inflación implícita ${direction(cur.pi - base.pi)} hasta ${pct(cur.pi, 1)} cuando el crecimiento de M o V supera el crecimiento real.`,
      `La tasa nominal de Fisher queda en ${pct(cur.i, 1)}; al subir i, el saldo promedio de efectivo deseado cae hacia ${fmt(cur.cash, 2)}.`,
    ],
    rows: [
      row("Nivel de precios P", base.P, cur.P, 2),
      row("Inflación π", base.pi * 100, cur.pi * 100, 2, "%"),
      row("Tasa nominal i", base.i * 100, cur.i * 100, 2, "%"),
      row("Viajes óptimos al banco N*", base.N, cur.N, 2),
      row("Saldo promedio óptimo", base.cash, cur.cash, 2),
    ],
    shocks: {
      title: "Estática comparativa · Cuantitativa, Fisher y Baumol-Tobin",
      subtitle: "MV = PY, i = r + πe, SPO = √(YF/2i). Neutralidad: en LP la inflación replica el crecimiento de M.",
      columns: [
        { key: "P", label: "P" },
        { key: "pi", label: "π" },
        { key: "i", label: "i" },
        { key: "SPO", label: "SPO" },
      ],
      rows: [
        { shock: "↑ M  (cantidad de dinero)", effects: { P: "up", pi: "flat", i: "flat", SPO: "flat" }, note: "neutralidad: solo niveles" },
        { shock: "↑ V  (velocidad)", effects: { P: "up", pi: "flat", i: "flat", SPO: "flat" } },
        { shock: "↑ Y  (producto real)", effects: { P: "down", pi: "flat", i: "flat", SPO: "up" } },
        { shock: "↑ μ  (crecimiento de M)", effects: { P: "up", pi: "up", i: "up", SPO: "down" }, note: "supraneutralidad: i sube por Fisher" },
        { shock: "↑ g  (crecimiento real)", effects: { P: "down", pi: "down", i: "down", SPO: "up" } },
        { shock: "↑ r  (tasa real)", effects: { P: "flat", pi: "flat", i: "up", SPO: "down" } },
        { shock: "↑ F  (costo de ir al banco)", effects: { P: "flat", pi: "flat", i: "flat", SPO: "up" } },
      ],
    },
  };
}

function computeSmallOpen(p) {
  const C = p.a + p.c * (p.Y - p.T);
  const S = p.Y - C - p.G;
  const I = p.h - p.b * p.rStar;
  const NCO = S - I;
  const q = 1 + (NCO - p.z - p.tb) / p.phi;
  const NX = p.z + p.tb + p.phi * (q - 1);
  return { ...p, C, S, I, NCO, q, NX };
}

function renderSmallOpen(base, cur) {
  const rDomain = [0, 8];
  const qDomain = domainFrom([base.q, cur.q, 0.45, 1.75], 0.05);
  const nxVals = [base.NCO, cur.NCO, base.NX, cur.NX, -15, 15];
  const C_NCO = COLORS.blue;
  const C_TCR = COLORS.violet;
  const C_RSTAR = COLORS.amber;
  const iBaseFn = (r) => base.h - base.b * r;
  const iCurFn = (r) => cur.h - cur.b * r;
  const xnBaseFn = (q) => base.z + base.tb + base.phi * (q - 1);
  const xnCurFn = (q) => cur.z + cur.tb + cur.phi * (q - 1);
  const charts = [
    lineChart({
      title: "1. Ahorro e inversión · r = r*",
      subtitle: "La economía toma r* como dada. La distancia S − I es exactamente lo que sale como capital.",
      xLabel: "Fondos prestables",
      yLabel: "Tasa de interés",
      xDomain: domainFrom([base.S, cur.S, base.I, cur.I, 0, 45], 0.1, true),
      yDomain: rDomain,
      shifts: [{ basePoints: pointsFromY(iBaseFn, rDomain), newPoints: pointsFromY(iCurFn, rDomain), color: COLORS.coral, opacity: 0.14 }],
      curves: [
        { label: "I base", color: COLORS.base, dash: "7 6", points: pointsFromY(iBaseFn, rDomain) },
        { label: "I nuevo", color: COLORS.coral, points: pointsFromY(iCurFn, rDomain) },
      ],
      vLines: [
        { x: base.S, label: "S base", color: COLORS.base, dash: "7 6" },
        { x: cur.S, label: `S = ${fmt(cur.S, 2)}`, color: COLORS.green },
      ],
      hLines: [{ y: cur.rStar, label: `r* = ${fmt(cur.rStar, 2)}%`, color: C_RSTAR }],
      crossGuides: [{ orientation: "v", x: cur.NCO + cur.I, color: C_NCO, label: "" }],
      segments: [{ x1: cur.I, y1: cur.rStar, x2: cur.S, y2: cur.rStar, color: C_NCO, width: 5, label: `S − I = ${fmt(cur.NCO, 2)}` }],
      markers: [
        { x: cur.I, y: cur.rStar, label: `I(r*)=${fmt(cur.I, 2)}`, color: COLORS.coral },
        { x: cur.S, y: cur.rStar, label: `S=${fmt(cur.S, 2)}`, color: COLORS.green, dy: 22 },
      ],
      arrows: moveArrow({ x: base.I, y: base.rStar }, { x: cur.I, y: cur.rStar }, "ΔI(r*)", COLORS.coral, { labelDy: 22 }),
    }),
    lineChart({
      title: "2. TCR y exportaciones netas · S − I = XN",
      subtitle: "La brecha S − I llega como línea vertical. El TCR busca el cruce con XN(TCR).",
      xLabel: "XN y S − I",
      yLabel: "TCR real",
      xDomain: domainFrom(nxVals, 0.1),
      yDomain: qDomain,
      shifts: [{ basePoints: pointsFromY(xnBaseFn, qDomain), newPoints: pointsFromY(xnCurFn, qDomain), color: COLORS.teal, opacity: 0.14 }],
      curves: [
        { label: "XN base", color: COLORS.base, dash: "7 6", points: pointsFromY(xnBaseFn, qDomain) },
        { label: "XN nuevo", color: COLORS.teal, points: pointsFromY(xnCurFn, qDomain) },
      ],
      vLines: [
        { x: base.NCO, label: "S − I base", color: COLORS.base, dash: "7 6" },
        { x: cur.NCO, label: `S − I = ${fmt(cur.NCO, 2)}`, color: C_NCO },
      ],
      crossGuides: [{ orientation: "h", y: cur.q, color: C_TCR, label: `TCR = ${fmt(cur.q, 2)}` }],
      markers: [
        { x: base.NCO, y: base.q, label: "Base", color: COLORS.base, guides: true },
        { x: cur.NCO, y: cur.q, label: "XN = S−I", color: C_TCR, guides: true, pulse: true },
      ],
      arrows: moveArrow({ x: base.NCO, y: base.q }, { x: cur.NCO, y: cur.q }, "TCR ajusta", C_TCR),
    }),
    barChart({
      title: "Balance macroeconómico abierto",
      subtitle: "El ahorro que no financia inversión doméstica se refleja en XN.",
      yLabel: "Unidades",
      bars: [
        { label: "S", base: base.S, value: cur.S, color: COLORS.green },
        { label: "I", base: base.I, value: cur.I, color: COLORS.coral },
        { label: "S-I", base: base.NCO, value: cur.NCO, color: C_NCO },
        { label: "TCR", base: base.q, value: cur.q, color: C_TCR, digits: 2 },
      ],
      wide: true,
    }),
  ].join("");
  const equations = [
    {
      label: "Ahorro nacional",
      tag: "S = Y − C − G",
      formula: "S = Y − [a + c(Y − T)] − G",
      baseHTML: `S = ${termHTML(base.Y, base.Y, 1)} − [${termHTML(base.a, base.a, 1)} + ${termHTML(base.c, base.c, 2)}·(${termHTML(base.Y, base.Y, 1)} − ${termHTML(base.T, base.T, 1)})] − ${termHTML(base.G, base.G, 1)} = <b>${fmt(base.S, 2)}</b>`,
      curHTML: `S = ${termHTML(base.Y, cur.Y, 1)} − [${termHTML(base.a, cur.a, 1)} + ${termHTML(base.c, cur.c, 2)}·(${termHTML(base.Y, cur.Y, 1)} − ${termHTML(base.T, cur.T, 1)})] − ${termHTML(base.G, cur.G, 1)} = <b>${fmt(cur.S, 2)}</b>`,
    },
    {
      label: "Inversión con r* dada",
      tag: "I = h − b·r*",
      formula: "I = h − b · r*",
      baseHTML: `I = ${termHTML(base.h, base.h, 1)} − ${termHTML(base.b, base.b, 2)} · ${termHTML(base.rStar, base.rStar, 2, "%")} = <b>${fmt(base.I, 2)}</b>`,
      curHTML: `I = ${termHTML(base.h, cur.h, 1)} − ${termHTML(base.b, cur.b, 2)} · ${termHTML(base.rStar, cur.rStar, 2, "%")} = <b>${fmt(cur.I, 2)}</b>`,
    },
    {
      label: "Salidas netas de capital",
      tag: "S − I = XN",
      formula: "S − I = XN(z, TB, TCR)",
      baseHTML: `S − I = ${termHTML(base.S, base.S, 2)} − ${termHTML(base.I, base.I, 2)} = <b>${fmt(base.NCO, 2)}</b>`,
      curHTML: `S − I = ${termHTML(base.S, cur.S, 2)} − ${termHTML(base.I, cur.I, 2)} = <b>${fmt(cur.NCO, 2)}</b>`,
      note: "Si la economía ahorra más de lo que invierte, S − I > 0 y exporta capital.",
    },
    {
      label: "Tipo de cambio real de equilibrio",
      tag: "XN = S − I → TCR",
      formula: "TCR = 1 + (S − I − z − TB) / φ",
      baseHTML: `TCR = 1 + (${termHTML(base.NCO, base.NCO, 2)} − ${termHTML(base.z, base.z, 1)} − ${termHTML(base.tb, base.tb, 1)}) / ${termHTML(base.phi, base.phi, 1)} = <b>${fmt(base.q, 2)}</b>`,
      curHTML: `TCR = 1 + (${termHTML(base.NCO, cur.NCO, 2)} − ${termHTML(base.z, cur.z, 1)} − ${termHTML(base.tb, cur.tb, 1)}) / ${termHTML(base.phi, cur.phi, 1)} = <b>${fmt(cur.q, 2)}</b>`,
    },
  ];
  return {
    formulas: ["S - I = XN", "I = h - b r*", "XN = z + TB + φ(TCR - 1)", "TCR ajusta"],
    links: [
      {
        from: "Ahorro e inversión",
        variable: "S − I",
        base: base.NCO,
        value: cur.NCO,
        color: C_NCO,
        to: "XN y TCR",
        note: "La distancia horizontal entre S e I se traslada como línea vertical al segundo gráfico.",
      },
      {
        from: "Curva XN(TCR)",
        variable: "TCR real",
        base: base.q,
        value: cur.q,
        color: C_TCR,
        to: "Equilibrio externo",
        note: "El TCR se mueve hasta que XN coincide exactamente con S − I.",
      },
    ],
    charts,
    equations,
    steps: [
      `Con r* dada, la inversión se ubica en ${fmt(cur.I, 2)} y el ahorro en ${fmt(cur.S, 2)}.`,
      `La brecha S − I pasa de ${fmt(base.NCO, 2)} a ${fmt(cur.NCO, 2)}; esa es la balanza comercial de equilibrio.`,
      `El TCR ${cur.q < base.q ? "se revalúa" : cur.q > base.q ? "se devalúa" : "no cambia"} hasta ${fmt(cur.q, 2)} para que la curva XN cruce la nueva S − I.`,
    ],
    rows: [
      row("Consumo C", base.C, cur.C, 2),
      row("Ahorro S", base.S, cur.S, 2),
      row("Inversión I(r*)", base.I, cur.I, 2),
      row("Salidas netas S-I", base.NCO, cur.NCO, 2),
      row("Exportaciones netas XN", base.NX, cur.NX, 2),
      row("TCR real", base.q, cur.q, 2),
    ],
    shocks: {
      title: "Estática comparativa · Economía abierta PEQUEÑA LP",
      subtitle: "r = r* fija (movilidad perfecta y país pequeño). El TCR ajusta hasta que XN(q) = S − I.",
      columns: [
        { key: "r", label: "r" },
        { key: "S", label: "S" },
        { key: "I", label: "I" },
        { key: "q", label: "q (TCR)" },
        { key: "XN", label: "XN" },
      ],
      rows: [
        { shock: "↑ a  (consumo autónomo)", effects: { r: "flat", S: "down", I: "flat", q: "down", XN: "down" }, note: "menor S − I → revaluación" },
        { shock: "↑ h  (inversión autónoma)", effects: { r: "flat", S: "flat", I: "up", q: "down", XN: "down" } },
        { shock: "↑ G  (gasto público)", effects: { r: "flat", S: "down", I: "flat", q: "down", XN: "down" } },
        { shock: "↓ T  (impuestos)", effects: { r: "flat", S: "down", I: "flat", q: "down", XN: "down" } },
        { shock: "↑ z  (XN autónomas)", effects: { r: "flat", S: "flat", I: "flat", q: "down", XN: "flat" }, note: "XN total no cambia" },
        { shock: "↑ TB  (proteccionismo)", effects: { r: "flat", S: "flat", I: "flat", q: "down", XN: "flat" }, note: "compensa con revaluación" },
        { shock: "↓ r*  (cae tasa internacional)", effects: { r: "down", S: "flat", I: "up", q: "down", XN: "down" } },
      ],
    },
  };
}

function computeLargeOpen(p) {
  const C = p.a + p.c * (p.Y - p.T);
  const S = p.Y - C - p.G;
  const r = (p.h + p.cf0 - S) / (p.b + p.k);
  const I = p.h - p.b * r;
  const CF = p.cf0 - p.k * r;
  const q = 1 + (CF - p.z - p.tb) / p.phi;
  const NX = p.z + p.tb + p.phi * (q - 1);
  return { ...p, C, S, r, I, CF, q, NX };
}

function renderLargeOpen(base, cur) {
  const rDomain = [0, Math.max(8, base.r, cur.r) + 1];
  const qDomain = domainFrom([base.q, cur.q, 0.5, 2.2], 0.05);
  const cfVals = [base.CF, cur.CF, base.NX, cur.NX, -12, 24];
  const C_R = COLORS.amber;
  const C_CF = COLORS.blue;
  const C_TCR = COLORS.violet;
  const cfBaseFn = (r) => base.cf0 - base.k * r;
  const cfCurFn = (r) => cur.cf0 - cur.k * r;
  const icfBaseFn = (r) => base.h - base.b * r + base.cf0 - base.k * r;
  const icfCurFn = (r) => cur.h - cur.b * r + cur.cf0 - cur.k * r;
  const xnBaseFn = (q) => base.z + base.tb + base.phi * (q - 1);
  const xnCurFn = (q) => cur.z + cur.tb + cur.phi * (q - 1);
  const charts = [
    lineChart({
      title: "1. Salidas netas de capital · CF(r)",
      subtitle: "CF cae cuando sube r doméstica. Comparte el eje r con la gráfica 2.",
      xLabel: "CF",
      yLabel: "Tasa de interés r",
      xDomain: domainFrom(cfVals, 0.12),
      yDomain: rDomain,
      shifts: [{ basePoints: pointsFromY(cfBaseFn, rDomain), newPoints: pointsFromY(cfCurFn, rDomain), color: C_CF, opacity: 0.16 }],
      curves: [
        { label: "CF base", color: COLORS.base, dash: "7 6", points: pointsFromY(cfBaseFn, rDomain) },
        { label: "CF nuevo", color: C_CF, points: pointsFromY(cfCurFn, rDomain) },
      ],
      crossGuides: [{ orientation: "h", y: cur.r, color: C_R, label: `r = ${fmt(cur.r, 2)}%` }],
      markers: [
        { x: base.CF, y: base.r, label: "Base", color: COLORS.base, guides: true },
        { x: cur.CF, y: cur.r, label: `CF*=${fmt(cur.CF, 2)}`, color: C_CF, guides: true, pulse: true },
      ],
      arrows: moveArrow({ x: base.CF, y: base.r }, { x: cur.CF, y: cur.r }, "Δr → ΔCF", C_CF),
    }),
    lineChart({
      title: "2. Mercado financiero grande · S = I(r) + CF(r)",
      subtitle: "S es vertical (Y fijo). I+CF baja con r. El cruce determina la r doméstica.",
      xLabel: "S e I + CF",
      yLabel: "Tasa de interés r",
      xDomain: domainFrom([base.S, cur.S, base.I + base.CF, cur.I + cur.CF, 0, 45], 0.1, true),
      yDomain: rDomain,
      shifts: [{ basePoints: pointsFromY(icfBaseFn, rDomain), newPoints: pointsFromY(icfCurFn, rDomain), color: COLORS.coral, opacity: 0.14 }],
      curves: [
        { label: "I+CF base", color: COLORS.base, dash: "7 6", points: pointsFromY(icfBaseFn, rDomain) },
        { label: "I+CF nuevo", color: COLORS.coral, points: pointsFromY(icfCurFn, rDomain) },
      ],
      vLines: [
        { x: base.S, label: "S base", color: COLORS.base, dash: "7 6" },
        { x: cur.S, label: `S = ${fmt(cur.S, 2)}`, color: COLORS.green },
      ],
      crossGuides: [{ orientation: "h", y: cur.r, color: C_R, label: `r = ${fmt(cur.r, 2)}%` }],
      markers: [{ x: cur.S, y: cur.r, label: "Equilibrio", color: C_R, guides: true, pulse: true }],
      arrows: moveArrow({ x: base.S, y: base.r }, { x: cur.S, y: cur.r }, "S = I + CF", C_R),
    }),
    lineChart({
      title: "3. TCR y exportaciones netas · CF = XN(TCR)",
      subtitle: "CF llega como línea vertical. El TCR ajusta hasta que XN(TCR) lo iguala.",
      xLabel: "CF y XN",
      yLabel: "TCR real",
      xDomain: domainFrom(cfVals, 0.1),
      yDomain: qDomain,
      shifts: [{ basePoints: pointsFromY(xnBaseFn, qDomain), newPoints: pointsFromY(xnCurFn, qDomain), color: COLORS.teal, opacity: 0.14 }],
      curves: [
        { label: "XN base", color: COLORS.base, dash: "7 6", points: pointsFromY(xnBaseFn, qDomain) },
        { label: "XN nuevo", color: COLORS.teal, points: pointsFromY(xnCurFn, qDomain) },
      ],
      vLines: [
        { x: base.CF, label: "CF base", color: COLORS.base, dash: "7 6" },
        { x: cur.CF, label: `CF = ${fmt(cur.CF, 2)}`, color: C_CF },
      ],
      crossGuides: [{ orientation: "h", y: cur.q, color: C_TCR, label: `TCR = ${fmt(cur.q, 2)}` }],
      markers: [{ x: cur.CF, y: cur.q, label: "XN = CF", color: C_TCR, guides: true, pulse: true }],
      arrows: moveArrow({ x: base.CF, y: base.q }, { x: cur.CF, y: cur.q }, "TCR ajusta", C_TCR),
      wide: true,
    }),
  ].join("");
  const equations = [
    {
      label: "Ahorro nacional",
      tag: "S = Y − C − G",
      formula: "S = Y − [a + c(Y − T)] − G",
      baseHTML: `S = ${termHTML(base.Y, base.Y, 1)} − [${termHTML(base.a, base.a, 1)} + ${termHTML(base.c, base.c, 2)}·(${termHTML(base.Y, base.Y, 1)} − ${termHTML(base.T, base.T, 1)})] − ${termHTML(base.G, base.G, 1)} = <b>${fmt(base.S, 2)}</b>`,
      curHTML: `S = ${termHTML(base.Y, cur.Y, 1)} − [${termHTML(base.a, cur.a, 1)} + ${termHTML(base.c, cur.c, 2)}·(${termHTML(base.Y, cur.Y, 1)} − ${termHTML(base.T, cur.T, 1)})] − ${termHTML(base.G, cur.G, 1)} = <b>${fmt(cur.S, 2)}</b>`,
    },
    {
      label: "Tasa de interés doméstica",
      tag: "S = I(r) + CF(r)",
      formula: "r = (h + cf₀ − S) / (b + k)",
      baseHTML: `r = (${termHTML(base.h, base.h, 1)} + ${termHTML(base.cf0, base.cf0, 1)} − ${termHTML(base.S, base.S, 2)}) / (${termHTML(base.b, base.b, 2)} + ${termHTML(base.k, base.k, 2)}) = <b>${fmt(base.r, 2)}%</b>`,
      curHTML: `r = (${termHTML(base.h, cur.h, 1)} + ${termHTML(base.cf0, cur.cf0, 1)} − ${termHTML(base.S, cur.S, 2)}) / (${termHTML(base.b, cur.b, 2)} + ${termHTML(base.k, cur.k, 2)}) = <b>${fmt(cur.r, 2)}%</b>`,
    },
    {
      label: "Inversión y salidas de capital",
      tag: "I, CF",
      formula: "I = h − b·r ;  CF = cf₀ − k·r",
      baseHTML: `I = ${termHTML(base.h, base.h, 1)} − ${termHTML(base.b, base.b, 2)}·${termHTML(base.r, base.r, 2, "%")} = <b>${fmt(base.I, 2)}</b> ;  CF = ${termHTML(base.cf0, base.cf0, 1)} − ${termHTML(base.k, base.k, 2)}·${termHTML(base.r, base.r, 2, "%")} = <b>${fmt(base.CF, 2)}</b>`,
      curHTML: `I = ${termHTML(base.h, cur.h, 1)} − ${termHTML(base.b, cur.b, 2)}·${termHTML(base.r, cur.r, 2, "%")} = <b>${fmt(cur.I, 2)}</b> ;  CF = ${termHTML(base.cf0, cur.cf0, 1)} − ${termHTML(base.k, cur.k, 2)}·${termHTML(base.r, cur.r, 2, "%")} = <b>${fmt(cur.CF, 2)}</b>`,
    },
    {
      label: "Tipo de cambio real",
      tag: "CF = XN(TCR)",
      formula: "TCR = 1 + (CF − z − TB) / φ",
      baseHTML: `TCR = 1 + (${termHTML(base.CF, base.CF, 2)} − ${termHTML(base.z, base.z, 1)} − ${termHTML(base.tb, base.tb, 1)}) / ${termHTML(base.phi, base.phi, 1)} = <b>${fmt(base.q, 2)}</b>`,
      curHTML: `TCR = 1 + (${termHTML(base.CF, cur.CF, 2)} − ${termHTML(base.z, cur.z, 1)} − ${termHTML(base.tb, cur.tb, 1)}) / ${termHTML(base.phi, cur.phi, 1)} = <b>${fmt(cur.q, 2)}</b>`,
      note: "Si TCR > 1 hay devaluación real; si TCR < 1, revaluación.",
    },
  ];
  return {
    formulas: ["S = I(r) + CF(r)", "CF = cf₀ - k r", "CF = XN", "XN = z + TB + φ(TCR - 1)"],
    links: [
      {
        from: "2. S = I + CF",
        variable: "r",
        base: base.r,
        value: cur.r,
        unit: "%",
        color: C_R,
        to: "1. CF(r)",
        note: "La tasa que resuelve fondos prestables se lee en la curva de salidas de capital.",
      },
      {
        from: "1. CF(r)",
        variable: "CF",
        base: base.CF,
        value: cur.CF,
        color: C_CF,
        to: "3. CF = XN",
        note: "El valor de CF viaja como la línea vertical del gráfico externo.",
      },
      {
        from: "Curva XN",
        variable: "TCR real",
        base: base.q,
        value: cur.q,
        color: C_TCR,
        to: "Equilibrio final",
        note: "El tipo de cambio real ajusta hasta que el punto de corte tiene XN = CF.",
      },
    ],
    charts,
    equations,
    steps: [
      `El primer ajuste ocurre en fondos prestables: r ${direction(cur.r - base.r, "sube", "baja")} hasta ${fmt(cur.r, 2)}%.`,
      `Con esa tasa, la inversión queda en ${fmt(cur.I, 2)} y las salidas netas de capital en ${fmt(cur.CF, 2)}.`,
      `El tercer panel cierra el sistema: el TCR ${cur.q < base.q ? "se revalúa" : cur.q > base.q ? "se devalúa" : "no cambia"} hasta ${fmt(cur.q, 2)} para que XN sea igual a CF.`,
    ],
    rows: [
      row("Ahorro S", base.S, cur.S, 2),
      row("Tasa de interés r", base.r, cur.r, 2, "%"),
      row("Inversión I", base.I, cur.I, 2),
      row("Salidas de capital CF", base.CF, cur.CF, 2),
      row("Exportaciones netas XN", base.NX, cur.NX, 2),
      row("TCR real", base.q, cur.q, 2),
    ],
    shocks: {
      title: "Estática comparativa · Economía abierta GRANDE LP",
      subtitle: "r es endógena (afecta i/CF). El primer cierre ocurre en S = I + CF; luego CF = XN(q).",
      columns: [
        { key: "r", label: "r" },
        { key: "I", label: "I" },
        { key: "CF", label: "CF" },
        { key: "q", label: "q (TCR)" },
        { key: "XN", label: "XN" },
      ],
      rows: [
        { shock: "↑ a  (consumo autónomo)", effects: { r: "up", I: "down", CF: "down", q: "down", XN: "down" }, note: "menor S → más r → menos CF" },
        { shock: "↑ h  (inversión autónoma)", effects: { r: "up", I: "up", CF: "down", q: "down", XN: "down" } },
        { shock: "↑ G  (gasto público)", effects: { r: "up", I: "down", CF: "down", q: "down", XN: "down" } },
        { shock: "↓ T  (impuestos)", effects: { r: "up", I: "down", CF: "down", q: "down", XN: "down" } },
        { shock: "↑ z  (XN autónomas)", effects: { r: "flat", I: "flat", CF: "flat", q: "down", XN: "flat" } },
        { shock: "↑ TB  (proteccionismo)", effects: { r: "flat", I: "flat", CF: "flat", q: "down", XN: "flat" } },
        { shock: "↑ cf₀  (apetito por activos extranjeros)", effects: { r: "up", I: "down", CF: "up", q: "up", XN: "up" } },
      ],
    },
  };
}

function computeUnemployment(p) {
  const fEff = Math.max(0.03, p.f + p.training - p.benefit * 0.06);
  const sEff = Math.max(0.005, p.s + p.union * 0.01 + p.eff * 0.006);
  const u = sEff / (sEff + fEff);
  const wEq = Math.max(0.2, (p.demand - p.supply) / (p.eta + p.gamma));
  const LEq = p.demand - p.eta * wEq;
  const wageMarkup = p.markup + p.union + p.eff;
  const wFloor = wEq * (1 + wageMarkup);
  const Ld = Math.max(0, p.demand - p.eta * wFloor);
  const Ls = Math.max(0, p.supply + p.gamma * wFloor);
  const waitUnemp = Math.max(0, Ls - Ld);
  const waitRate = Ls > 0 ? waitUnemp / Ls : 0;
  const observed = clamp(u + waitRate * 0.55, 0, 0.95);
  return { ...p, fEff, sEff, u, wEq, LEq, wFloor, Ld, Ls, waitUnemp, waitRate, observed };
}

function renderUnemployment(base, cur) {
  const wageDomain = [0, Math.max(base.wFloor, cur.wFloor, base.wEq, cur.wEq) * 1.35];
  const laborDomain = [0, Math.max(base.Ls, cur.Ls, base.LEq, cur.LEq, 100) * 1.1];
  const charts = [
    barChart({
      title: "Flujos de desempleo en estado estable",
      subtitle: "En equilibrio: separaciones sE = enganches fU.",
      yLabel: "Flujo por periodo",
      bars: [
        { label: "sE", base: base.sEff * (1 - base.u) * 100, value: cur.sEff * (1 - cur.u) * 100, color: COLORS.coral, unit: "%" },
        { label: "fU", base: base.fEff * base.u * 100, value: cur.fEff * cur.u * 100, color: COLORS.green, unit: "%" },
        { label: "U/L", base: base.u * 100, value: cur.u * 100, color: COLORS.blue, unit: "%" },
      ],
    }),
    lineChart({
      title: "Rigidez salarial y desempleo de espera",
      subtitle: "Un salario por encima del equilibrio abre una brecha entre oferta y demanda de trabajo.",
      xLabel: "Trabajo",
      yLabel: "Salario real",
      xDomain: laborDomain,
      yDomain: wageDomain,
      curves: [
        { label: "Demanda", color: COLORS.coral, points: pointsFromY((w) => cur.demand - cur.eta * w, wageDomain) },
        { label: "Oferta", color: COLORS.green, points: pointsFromY((w) => cur.supply + cur.gamma * w, wageDomain) },
        { label: "Demanda base", color: COLORS.base, dash: "7 6", points: pointsFromY((w) => base.demand - base.eta * w, wageDomain) },
      ],
      hLines: [
        { y: cur.wEq, label: "w*", color: COLORS.base, dash: "5 5" },
        { y: cur.wFloor, label: "w rígido", color: COLORS.amber },
      ],
      segments: cur.waitUnemp > 0 ? [{ x1: cur.Ld, x2: cur.Ls, y1: cur.wFloor, y2: cur.wFloor, label: "desempleo", color: COLORS.coral }] : [],
      markers: [{ x: cur.LEq, y: cur.wEq, label: "Equilibrio", color: COLORS.teal, guides: true }],
      arrows: moveArrow({ x: base.LEq, y: base.wEq }, { x: cur.LEq, y: cur.wEq }, "w*", COLORS.teal),
    }),
    barChart({
      title: "Composición de la tasa de desempleo",
      subtitle: "Búsqueda y espera se suman a la tasa observada teórica.",
      yLabel: "Porcentaje de la fuerza laboral",
      bars: [
        { label: "Natural", base: base.u * 100, value: cur.u * 100, color: COLORS.blue, unit: "%" },
        { label: "Espera", base: base.waitRate * 55, value: cur.waitRate * 55, color: COLORS.amber, unit: "%" },
        { label: "Obs.", base: base.observed * 100, value: cur.observed * 100, color: COLORS.coral, unit: "%" },
      ],
      wide: true,
    }),
  ].join("");
  const equations = [
    {
      label: "Tasa natural de desempleo (estado estable)",
      tag: "sE = fU",
      formula: "U / L = s / (s + f)",
      baseHTML: `U/L = ${termHTML(base.sEff, base.sEff, 3)} / (${termHTML(base.sEff, base.sEff, 3)} + ${termHTML(base.fEff, base.fEff, 3)}) = <b>${fmt(base.u * 100, 2)}%</b>`,
      curHTML: `U/L = ${termHTML(base.sEff, cur.sEff, 3)} / (${termHTML(base.sEff, cur.sEff, 3)} + ${termHTML(base.fEff, cur.fEff, 3)}) = <b>${fmt(cur.u * 100, 2)}%</b>`,
      note: "Más capacitación e información suben f y bajan U/L; sindicatos y salario eficiencia suben s y la elevan.",
    },
    {
      label: "Salario rígido y desempleo de espera",
      tag: "w rígido = w* · (1 + markup + sindical + eficiencia)",
      formula: "w rígido = w* · (1 + ω);  Ls > Ld ⇒ desempleo de espera",
      baseHTML: `w rígido = ${termHTML(base.wEq, base.wEq, 2)} · (1 + ${termHTML(base.markup + base.union + base.eff, base.markup + base.union + base.eff, 2)}) = <b>${fmt(base.wFloor, 2)}</b>`,
      curHTML: `w rígido = ${termHTML(base.wEq, cur.wEq, 2)} · (1 + ${termHTML(base.markup + base.union + base.eff, cur.markup + cur.union + cur.eff, 2)}) = <b>${fmt(cur.wFloor, 2)}</b>`,
    },
    {
      label: "Brecha en el mercado laboral",
      tag: "Ls − Ld",
      formula: "Ls − Ld = (oferta + γ·w) − (demanda − η·w)",
      baseHTML: `Ls − Ld = ${termHTML(base.Ls, base.Ls, 1)} − ${termHTML(base.Ld, base.Ld, 1)} = <b>${fmt(base.waitUnemp, 2)}</b>`,
      curHTML: `Ls − Ld = ${termHTML(base.Ls, cur.Ls, 1)} − ${termHTML(base.Ld, cur.Ld, 1)} = <b>${fmt(cur.waitUnemp, 2)}</b>`,
    },
  ];
  return {
    formulas: ["U/L = s / (f + s)", "sE = fU", "w rígido > w* ⇒ Ls > Ld"],
    links: [
      {
        from: "Flujos s y f",
        variable: "U/L natural",
        base: base.u * 100,
        value: cur.u * 100,
        unit: "%",
        color: COLORS.blue,
        to: "Desempleo observado",
        note: "La tasa natural es el centro alrededor del cual se agrega la espera por rigideces.",
      },
      {
        from: "Salario rígido",
        variable: "Ls - Ld",
        base: base.waitUnemp,
        value: cur.waitUnemp,
        color: COLORS.coral,
        to: "Desempleo de espera",
        note: "La brecha horizontal del mercado laboral se suma al problema de desempleo.",
      },
    ],
    charts,
    equations,
    steps: [
      `La tasa natural queda en ${pct(cur.u, 1)} porque separaciones y enganches se igualan en estado estable.`,
      `La tasa de enganche efectiva ${direction(cur.fEff - base.fEff)} y la tasa de separación efectiva ${direction(cur.sEff - base.sEff)} con las políticas de búsqueda, sindicatos o salarios de eficiencia.`,
      `Si el salario rígido supera w*, aparece desempleo de espera: la brecha Ls - Ld es ${fmt(cur.waitUnemp, 2)} trabajadores teóricos.`,
    ],
    rows: [
      row("Tasa de separación s", base.sEff * 100, cur.sEff * 100, 2, "%"),
      row("Tasa de enganche f", base.fEff * 100, cur.fEff * 100, 2, "%"),
      row("Desempleo natural U/L", base.u * 100, cur.u * 100, 2, "%"),
      row("Salario de equilibrio w*", base.wEq, cur.wEq, 2),
      row("Salario rígido", base.wFloor, cur.wFloor, 2),
      row("Desempleo observado teórico", base.observed * 100, cur.observed * 100, 2, "%"),
    ],
    shocks: {
      title: "Estática comparativa · Empleo y desempleo",
      subtitle: "U/L = s/(s+f). El desempleo de espera aparece cuando el salario efectivo supera w*.",
      columns: [
        { key: "u", label: "U/L (natural)" },
        { key: "wage", label: "w" },
        { key: "wait", label: "Espera" },
        { key: "obs", label: "Obs." },
      ],
      rows: [
        { shock: "↑ s  (separaciones)", effects: { u: "up", wage: "flat", wait: "flat", obs: "up" } },
        { shock: "↑ f  (enganches / capacitación)", effects: { u: "down", wage: "flat", wait: "flat", obs: "down" } },
        { shock: "↑ subsidio de desempleo", effects: { u: "up", wage: "flat", wait: "flat", obs: "up" }, note: "↓ búsqueda → ↓ f efectivo" },
        { shock: "↑ salario mínimo / sindicato", effects: { u: "flat", wage: "up", wait: "up", obs: "up" }, note: "Ls > Ld" },
        { shock: "↑ salario de eficiencia", effects: { u: "up", wage: "up", wait: "up", obs: "up" } },
        { shock: "↑ training (capacitación)", effects: { u: "down", wage: "up", wait: "down", obs: "down" } },
      ],
    },
  };
}

function computeCycles(p) {
  const Y = (130 + p.demandShock - p.supplyShock) / 1.3;
  const P = 150 + p.demandShock - 0.8 * Y;
  const gap = ((Y - p.Ypot) / p.Ypot) * 100;
  const uObs = p.uNatural - gap / p.okun;
  return { ...p, Y, P, gap, uObs };
}

function renderCycles(base, cur) {
  const yDomain = domainFrom([base.Y, cur.Y, base.Ypot, cur.Ypot, 75, 125], 0.08);
  const pDomain = domainFrom([base.P, cur.P, 40, 100], 0.08);
  const ad = (p, Y) => 150 + p.demandShock - 0.8 * Y;
  const sras = (p, Y) => 20 + p.supplyShock + 0.5 * Y;
  const xDomain = [70, 130];
  const cyclePtsY = Array.from({ length: 25 }, (_, t) => {
    const x = t;
    const y = cur.Ypot * (1 + 0.035 * Math.sin(t / 2.2)) + cur.demandShock * 0.18 - cur.supplyShock * 0.12;
    return { x, y };
  });
  const cyclePtsPot = Array.from({ length: 25 }, (_, t) => ({ x: t, y: cur.Ypot }));
  // Detect auge / recesión bands in the time series
  const bands = [];
  let segStart = 0;
  let segState = cyclePtsY[0].y >= cur.Ypot ? "auge" : "rec";
  for (let i = 1; i <= cyclePtsY.length; i++) {
    const here = i < cyclePtsY.length ? (cyclePtsY[i].y >= cur.Ypot ? "auge" : "rec") : null;
    if (here !== segState) {
      bands.push({
        from: cyclePtsY[segStart].x,
        to: cyclePtsY[Math.min(i, cyclePtsY.length - 1)].x,
        color: segState === "auge" ? COLORS.green : COLORS.coral,
        opacity: 0.12,
        label: segStart === 0 ? (segState === "auge" ? "Auge" : "Recesión") : "",
      });
      segStart = i;
      segState = here;
    }
  }
  const charts = [
    lineChart({
      title: "1. Demanda agregada y oferta agregada",
      subtitle: "Choques de DA y OA mueven el equilibrio de corto plazo (Y, P).",
      xLabel: "Producto Y",
      yLabel: "Nivel de precios P",
      xDomain,
      yDomain: pDomain,
      shifts: [
        { basePoints: samplePoints((Y) => ad(base, Y), xDomain), newPoints: samplePoints((Y) => ad(cur, Y), xDomain), color: COLORS.blue, opacity: 0.13 },
        { basePoints: samplePoints((Y) => sras(base, Y), xDomain), newPoints: samplePoints((Y) => sras(cur, Y), xDomain), color: COLORS.coral, opacity: 0.13 },
      ],
      curves: [
        { label: "DA base", color: COLORS.base, dash: "7 6", points: samplePoints((Y) => ad(base, Y), xDomain) },
        { label: "OA base", color: COLORS.base, dash: "2 5", points: samplePoints((Y) => sras(base, Y), xDomain) },
        { label: "DA nueva", color: COLORS.blue, points: samplePoints((Y) => ad(cur, Y), xDomain) },
        { label: "OA nueva", color: COLORS.coral, points: samplePoints((Y) => sras(cur, Y), xDomain) },
      ],
      vLines: [{ x: cur.Ypot, label: "Y* potencial", color: COLORS.green }],
      crossGuides: [{ orientation: "v", x: cur.Y, color: COLORS.teal, label: `Y = ${fmt(cur.Y, 1)}` }],
      markers: [{ x: cur.Y, y: cur.P, label: `Equilibrio (${fmt(cur.Y, 1)}, ${fmt(cur.P, 1)})`, color: COLORS.teal, guides: true, pulse: true }],
      arrows: moveArrow({ x: base.Y, y: base.P }, { x: cur.Y, y: cur.P }, "ΔDA / ΔOA", COLORS.teal),
    }),
    lineChart({
      title: "2. Ciclo teórico de producto",
      subtitle: "Bandas verdes: auge (Y > Y*). Bandas rojas: recesión (Y < Y*).",
      xLabel: "Periodo",
      yLabel: "Producto",
      xDomain: [0, 24],
      yDomain,
      bands,
      curves: [
        { label: "Y potencial", color: COLORS.green, dash: "7 6", points: cyclePtsPot },
        { label: "Y observado", color: COLORS.teal, points: cyclePtsY },
      ],
      markers: [{ x: 24, y: cyclePtsY[24].y, label: `Brecha ${fmt(cur.gap, 1)}%`, color: COLORS.teal }],
    }),
    lineChart({
      title: "3. Ley de Okun",
      subtitle: "u_obs = u_natural − brecha / β. La brecha del producto se traduce en desempleo observado.",
      xLabel: "Brecha del producto (%)",
      yLabel: "Desempleo observado (%)",
      xDomain: [-12, 12],
      yDomain: domainFrom([cur.uNatural - 12 / cur.okun, cur.uNatural + 12 / cur.okun, cur.uObs], 0.1),
      bands: [
        { from: -12, to: 0, color: COLORS.coral, opacity: 0.08, label: "Recesión" },
        { from: 0, to: 12, color: COLORS.green, opacity: 0.08, label: "Auge" },
      ],
      curves: [
        { label: "Okun", color: COLORS.violet, points: samplePoints((gap) => cur.uNatural - gap / cur.okun, [-12, 12]) },
      ],
      hLines: [{ y: cur.uNatural, label: `u natural = ${fmt(cur.uNatural, 1)}%`, color: COLORS.base, dash: "5 5" }],
      crossGuides: [{ orientation: "v", x: cur.gap, color: COLORS.teal, label: `Brecha = ${fmt(cur.gap, 1)}%` }],
      markers: [{ x: cur.gap, y: cur.uObs, label: `u_obs = ${fmt(cur.uObs, 1)}%`, color: COLORS.violet, guides: true, pulse: true }],
      arrows: moveArrow({ x: base.gap, y: base.uObs }, { x: cur.gap, y: cur.uObs }, "Okun", COLORS.violet),
      wide: true,
    }),
  ].join("");
  const equations = [
    {
      label: "Equilibrio DA-OA",
      tag: "DA = OA",
      formula: "150 + ε_DA − 0,8·Y = 20 + ε_OA + 0,5·Y ⇒ Y = (130 + ε_DA − ε_OA) / 1,3",
      baseHTML: `Y = (130 + ${termHTML(base.demandShock, base.demandShock, 1)} − ${termHTML(base.supplyShock, base.supplyShock, 1)}) / 1,3 = <b>${fmt(base.Y, 2)}</b>`,
      curHTML: `Y = (130 + ${termHTML(base.demandShock, cur.demandShock, 1)} − ${termHTML(base.supplyShock, cur.supplyShock, 1)}) / 1,3 = <b>${fmt(cur.Y, 2)}</b>`,
    },
    {
      label: "Brecha del producto",
      tag: "(Y − Y*) / Y*",
      formula: "Brecha = (Y − Y*) / Y*",
      baseHTML: `Brecha = (${termHTML(base.Y, base.Y, 2)} − ${termHTML(base.Ypot, base.Ypot, 1)}) / ${termHTML(base.Ypot, base.Ypot, 1)} = <b>${fmt(base.gap, 2)}%</b>`,
      curHTML: `Brecha = (${termHTML(base.Y, cur.Y, 2)} − ${termHTML(base.Ypot, cur.Ypot, 1)}) / ${termHTML(base.Ypot, cur.Ypot, 1)} = <b>${fmt(cur.gap, 2)}%</b>`,
      note: "Brecha > 0 ⇒ auge; brecha < 0 ⇒ recesión.",
    },
    {
      label: "Ley de Okun",
      tag: "u_obs = u_nat − brecha/β",
      formula: "u_obs = u_natural − brecha / β",
      baseHTML: `u_obs = ${termHTML(base.uNatural, base.uNatural, 1, "%")} − ${termHTML(base.gap, base.gap, 2, "%")} / ${termHTML(base.okun, base.okun, 1)} = <b>${fmt(base.uObs, 2)}%</b>`,
      curHTML: `u_obs = ${termHTML(base.uNatural, cur.uNatural, 1, "%")} − ${termHTML(base.gap, cur.gap, 2, "%")} / ${termHTML(base.okun, cur.okun, 1)} = <b>${fmt(cur.uObs, 2)}%</b>`,
    },
  ];
  return {
    formulas: ["Brecha = (Y - Y*) / Y*", "u observado = u natural - brecha / β", "DA + OA determinan Y y P de corto plazo"],
    links: [
      {
        from: "DA-OA",
        variable: "Y − Y*",
        base: base.gap,
        value: cur.gap,
        unit: "%",
        color: COLORS.teal,
        to: "Ley de Okun",
        note: "La brecha que sale del equilibrio de producto entra directamente al cálculo del desempleo.",
      },
      {
        from: "Brecha",
        variable: "u observado",
        base: base.uObs,
        value: cur.uObs,
        unit: "%",
        color: COLORS.violet,
        to: "Ciclo económico",
        note: "Auge y recesión se leen como movimientos opuestos de producto y desempleo.",
      },
    ],
    charts,
    equations,
    steps: [
      `Los choques de demanda y oferta ubican el producto observado en ${fmt(cur.Y, 2)} frente a un potencial de ${fmt(cur.Ypot, 2)}.`,
      `La brecha del producto es ${fmt(cur.gap, 2, "%")}; si es positiva hay auge, si es negativa hay recesión.`,
      `Por Okun, el desempleo observado queda en ${fmt(cur.uObs, 2, "%")} frente a una tasa natural de ${fmt(cur.uNatural, 2, "%")}.`,
    ],
    rows: [
      row("Producto observado Y", base.Y, cur.Y, 2),
      row("Producto potencial Y*", base.Ypot, cur.Ypot, 2),
      row("Brecha del producto", base.gap, cur.gap, 2, "%"),
      row("Nivel de precios P", base.P, cur.P, 2),
      row("Desempleo observado", base.uObs, cur.uObs, 2, "%"),
    ],
    shocks: {
      title: "Estática comparativa · DA-OA y Ley de Okun",
      subtitle: "%ΔPIB ≈ 3 − 2·Δu (Okun). Choques de demanda mueven Y y P en mismo sentido; choques de oferta los mueven en sentido opuesto.",
      columns: [
        { key: "Y", label: "Y" },
        { key: "P", label: "P" },
        { key: "gap", label: "brecha" },
        { key: "uObs", label: "u obs." },
      ],
      rows: [
        { shock: "↑ choque de demanda (+)", effects: { Y: "up", P: "up", gap: "up", uObs: "down" }, note: "↑G, ↑M, optimismo" },
        { shock: "↓ choque de demanda (−)", effects: { Y: "down", P: "down", gap: "down", uObs: "up" }, note: "recesión por demanda" },
        { shock: "↑ choque adverso de oferta", effects: { Y: "down", P: "up", gap: "down", uObs: "up" }, note: "estanflación: ↑costos" },
        { shock: "↓ choque favorable de oferta", effects: { Y: "up", P: "down", gap: "up", uObs: "down" }, note: "↑ productividad" },
        { shock: "↑ Y* (crecimiento de potencial)", effects: { Y: "flat", P: "flat", gap: "down", uObs: "up" }, note: "brecha cae si Y observado fijo" },
      ],
    },
  };
}

function computeIS(p) {
  const A = p.a - p.c * p.T + p.h + p.G;
  const Y = (A - p.b * p.r) / (1 - p.c);
  const multG = 1 / (1 - p.c);
  const multT = -p.c / (1 - p.c);
  return { ...p, A, Y, multG, multT };
}

function renderIS(base, cur) {
  const yDomain = [0, Math.max(180, base.Y, cur.Y) * 1.05];
  const rDomain = [0, 8];
  const E = (p, Y) => p.a + p.c * (Y - p.T) + p.h - p.b * p.r + p.G;
  const AforCurve = (p) => p.a - p.c * p.T + p.h + p.G;
  const isBaseFn = (Y) => (AforCurve(base) - (1 - base.c) * Y) / base.b;
  const isCurFn = (Y) => (AforCurve(cur) - (1 - cur.c) * Y) / cur.b;
  const charts = [
    lineChart({
      title: "1. Cruz keynesiana · E = Y",
      subtitle: "El equilibrio ocurre donde gasto planeado E cruza la línea de 45°.",
      xLabel: "Producto Y",
      yLabel: "Gasto planeado E",
      xDomain: yDomain,
      yDomain,
      shifts: [{ basePoints: samplePoints((Y) => E(base, Y), yDomain), newPoints: samplePoints((Y) => E(cur, Y), yDomain), color: COLORS.teal, opacity: 0.14 }],
      curves: [
        { label: "45°", color: COLORS.ink, dash: "5 5", points: samplePoints((Y) => Y, yDomain) },
        { label: "E base", color: COLORS.base, dash: "7 6", points: samplePoints((Y) => E(base, Y), yDomain) },
        { label: "E nuevo", color: COLORS.teal, points: samplePoints((Y) => E(cur, Y), yDomain) },
      ],
      crossGuides: [{ orientation: "v", x: cur.Y, color: COLORS.teal, label: `Y* = ${fmt(cur.Y, 1)}` }],
      markers: [{ x: cur.Y, y: cur.Y, label: `Y* = ${fmt(cur.Y, 1)}`, color: COLORS.teal, guides: true, pulse: true }],
      arrows: moveArrow({ x: base.Y, y: base.Y }, { x: cur.Y, y: cur.Y }, "ΔY", COLORS.teal),
    }),
    lineChart({
      title: "2. Curva IS · pares (r, Y) compatibles con bienes",
      subtitle: "Subir G o a desplaza IS a la derecha; subir T la mueve a la izquierda.",
      xLabel: "Producto Y",
      yLabel: "Tasa de interés r",
      xDomain: yDomain,
      yDomain: rDomain,
      shifts: [{ basePoints: samplePoints(isBaseFn, yDomain), newPoints: samplePoints(isCurFn, yDomain), color: COLORS.blue, opacity: 0.14 }],
      curves: [
        { label: "IS base", color: COLORS.base, dash: "7 6", points: samplePoints(isBaseFn, yDomain) },
        { label: "IS nueva", color: COLORS.blue, points: samplePoints(isCurFn, yDomain) },
      ],
      hLines: [{ y: cur.r, label: `r dada = ${fmt(cur.r, 2)}%`, color: COLORS.amber }],
      crossGuides: [{ orientation: "v", x: cur.Y, color: COLORS.teal, label: `Y = ${fmt(cur.Y, 1)}` }],
      markers: [{ x: cur.Y, y: cur.r, label: "Punto IS", color: COLORS.blue, guides: true, pulse: true }],
      arrows: moveArrow({ x: base.Y, y: base.r }, { x: cur.Y, y: cur.r }, "sobre IS", COLORS.blue),
    }),
    barChart({
      title: "3. Multiplicadores fiscales",
      subtitle: "dY/dG = 1/(1−c) y dY/dT = −c/(1−c).",
      yLabel: "ΔY por unidad",
      bars: [
        { label: "dY/dG", base: base.multG, value: cur.multG, color: COLORS.green },
        { label: "dY/dT", base: base.multT, value: cur.multT, color: COLORS.coral },
      ],
      wide: true,
    }),
  ].join("");
  const equations = [
    {
      label: "Gasto planeado",
      tag: "E(Y)",
      formula: "E = a + c(Y − T) + h − b·r + G",
      baseHTML: `E = ${termHTML(base.a, base.a, 1)} + ${termHTML(base.c, base.c, 2)}(Y − ${termHTML(base.T, base.T, 1)}) + ${termHTML(base.h, base.h, 1)} − ${termHTML(base.b, base.b, 2)}·${termHTML(base.r, base.r, 2, "%")} + ${termHTML(base.G, base.G, 1)}`,
      curHTML: `E = ${termHTML(base.a, cur.a, 1)} + ${termHTML(base.c, cur.c, 2)}(Y − ${termHTML(base.T, cur.T, 1)}) + ${termHTML(base.h, cur.h, 1)} − ${termHTML(base.b, cur.b, 2)}·${termHTML(base.r, cur.r, 2, "%")} + ${termHTML(base.G, cur.G, 1)}`,
    },
    {
      label: "Producto de equilibrio",
      tag: "Y = (A − b·r)/(1 − c)",
      formula: "Y = (a − cT + h + G − b·r) / (1 − c)",
      baseHTML: `Y = (${termHTML(base.a, base.a, 1)} − ${termHTML(base.c, base.c, 2)}·${termHTML(base.T, base.T, 1)} + ${termHTML(base.h, base.h, 1)} + ${termHTML(base.G, base.G, 1)} − ${termHTML(base.b, base.b, 2)}·${termHTML(base.r, base.r, 2, "%")}) / (1 − ${termHTML(base.c, base.c, 2)}) = <b>${fmt(base.Y, 2)}</b>`,
      curHTML: `Y = (${termHTML(base.a, cur.a, 1)} − ${termHTML(base.c, cur.c, 2)}·${termHTML(base.T, cur.T, 1)} + ${termHTML(base.h, cur.h, 1)} + ${termHTML(base.G, cur.G, 1)} − ${termHTML(base.b, cur.b, 2)}·${termHTML(base.r, cur.r, 2, "%")}) / (1 − ${termHTML(base.c, cur.c, 2)}) = <b>${fmt(cur.Y, 2)}</b>`,
    },
    {
      label: "Multiplicadores",
      tag: "dY/dG, dY/dT",
      formula: "dY/dG = 1/(1−c) ;  dY/dT = −c/(1−c)",
      baseHTML: `dY/dG = 1 / (1 − ${termHTML(base.c, base.c, 2)}) = <b>${fmt(base.multG, 2)}</b> ;  dY/dT = −${termHTML(base.c, base.c, 2)} / (1 − ${termHTML(base.c, base.c, 2)}) = <b>${fmt(base.multT, 2)}</b>`,
      curHTML: `dY/dG = 1 / (1 − ${termHTML(base.c, cur.c, 2)}) = <b>${fmt(cur.multG, 2)}</b> ;  dY/dT = −${termHTML(base.c, cur.c, 2)} / (1 − ${termHTML(base.c, cur.c, 2)}) = <b>${fmt(cur.multT, 2)}</b>`,
      note: "Cuanto mayor la PMC c, más potente es el multiplicador del gasto.",
    },
  ];
  return {
    formulas: ["E = C + I + G", "Y = a + c(Y - T) + h - br + G", "dY/dG = 1/(1-c)", "dY/dT = -c/(1-c)"],
    links: [
      {
        from: "Cruz keynesiana",
        variable: "Y de equilibrio",
        base: base.Y,
        value: cur.Y,
        color: COLORS.teal,
        to: "Curva IS",
        note: "El cruce E=Y se convierte en el punto de la IS para la tasa r elegida.",
      },
      {
        from: "Parámetros fiscales",
        variable: "Multiplicador",
        base: base.multG,
        value: cur.multG,
        color: COLORS.green,
        to: "ΔY",
        note: "El tamaño del desplazamiento depende de la PMC.",
      },
    ],
    charts,
    equations,
    steps: [
      `El gasto planeado se desplaza con a, h, G y T; el nuevo cruce keynesiano ubica Y en ${fmt(cur.Y, 2)}.`,
      `La IS se desplaza a la derecha si suben a, h o G, o si caen T; se mueve a la izquierda con cambios opuestos.`,
      `Con c = ${fmt(cur.c, 2)}, el multiplicador del gasto es ${fmt(cur.multG, 2)} y el de impuestos ${fmt(cur.multT, 2)}.`,
    ],
    rows: [
      row("Producto de equilibrio Y", base.Y, cur.Y, 2),
      row("Tasa de interés dada r", base.r, cur.r, 2, "%"),
      row("Intercepto autónomo", base.A, cur.A, 2),
      row("Multiplicador del gasto", base.multG, cur.multG, 2),
      row("Multiplicador de impuestos", base.multT, cur.multT, 2),
    ],
    shocks: {
      title: "Estática comparativa · IS / Cruz keynesiana (corto plazo, r dada)",
      subtitle: "Y = (A − b·r)/(1 − c) con A = a − cT + h + G. dY/dG = 1/(1−c) > |dY/dT| = c/(1−c).",
      columns: [
        { key: "E", label: "E" },
        { key: "Y", label: "Y" },
        { key: "IS", label: "IS" },
      ],
      rows: [
        { shock: "↑ a  (consumo autónomo)", effects: { E: "up", Y: "up", IS: "up" }, note: "IS → derecha" },
        { shock: "↑ h  (inversión autónoma)", effects: { E: "up", Y: "up", IS: "up" } },
        { shock: "↑ G  (gasto público)", effects: { E: "up", Y: "up", IS: "up" }, note: "ΔY = ΔG · 1/(1−c)" },
        { shock: "↓ T  (impuestos)", effects: { E: "up", Y: "up", IS: "up" }, note: "ΔY = −ΔT · c/(1−c)" },
        { shock: "↑ r  (sube la tasa)", effects: { E: "down", Y: "down", IS: "flat" }, note: "movimiento sobre IS" },
        { shock: "↑ c  (PMC)", effects: { E: "up", Y: "up", IS: "up" }, note: "multiplicador más grande" },
      ],
    },
  };
}

function computeLM(p) {
  const realM = p.M / p.P;
  const r = (p.n + p.k * p.Y - realM) / p.l;
  return { ...p, realM, r };
}

function renderLM(base, cur) {
  const rDomain = [0, 8];
  const yDomain = [40, 190];
  const moneyDomain = domainFrom([base.realM, cur.realM, base.n + base.k * base.Y, cur.n + cur.k * cur.Y, 20, 120], 0.15, true);
  const ldBaseFn = (r) => base.n + base.k * base.Y - base.l * r;
  const ldCurFn = (r) => cur.n + cur.k * cur.Y - cur.l * r;
  const lmBaseFn = (Y) => (base.n + base.k * Y - base.realM) / base.l;
  const lmCurFn = (Y) => (cur.n + cur.k * Y - cur.realM) / cur.l;
  const charts = [
    lineChart({
      title: "1. Mercado de saldos reales",
      subtitle: "M/P es vertical (oferta exógena). La demanda Ld baja con r.",
      xLabel: "Saldos reales",
      yLabel: "Tasa de interés r",
      xDomain: moneyDomain,
      yDomain: rDomain,
      shifts: [{ basePoints: pointsFromY(ldBaseFn, rDomain), newPoints: pointsFromY(ldCurFn, rDomain), color: COLORS.teal, opacity: 0.14 }],
      curves: [
        { label: "Ld base", color: COLORS.base, dash: "7 6", points: pointsFromY(ldBaseFn, rDomain) },
        { label: "Ld nueva", color: COLORS.teal, points: pointsFromY(ldCurFn, rDomain) },
      ],
      vLines: [
        { x: base.realM, label: "M/P base", color: COLORS.base, dash: "7 6" },
        { x: cur.realM, label: `M/P = ${fmt(cur.realM, 2)}`, color: COLORS.blue },
      ],
      crossGuides: [{ orientation: "h", y: cur.r, color: COLORS.amber, label: `r = ${fmt(cur.r, 2)}%` }],
      markers: [{ x: cur.realM, y: cur.r, label: `r = ${fmt(cur.r, 2)}%`, color: COLORS.amber, guides: true, pulse: true }],
      arrows: moveArrow({ x: base.realM, y: base.r }, { x: cur.realM, y: cur.r }, "Δ(M/P) → Δr", COLORS.amber),
    }),
    lineChart({
      title: "2. Curva LM · pares (r, Y) compatibles con dinero",
      subtitle: "Aumentar M/P desplaza LM a la derecha; aumentar n la mueve a la izquierda.",
      xLabel: "Producto Y",
      yLabel: "Tasa de interés r",
      xDomain: yDomain,
      yDomain: rDomain,
      shifts: [{ basePoints: samplePoints(lmBaseFn, yDomain), newPoints: samplePoints(lmCurFn, yDomain), color: COLORS.blue, opacity: 0.14 }],
      curves: [
        { label: "LM base", color: COLORS.base, dash: "7 6", points: samplePoints(lmBaseFn, yDomain) },
        { label: "LM nueva", color: COLORS.blue, points: samplePoints(lmCurFn, yDomain) },
      ],
      crossGuides: [{ orientation: "h", y: cur.r, color: COLORS.amber, label: `r = ${fmt(cur.r, 2)}%` }],
      markers: [{ x: cur.Y, y: cur.r, label: "Punto LM", color: COLORS.blue, guides: true, pulse: true }],
      arrows: moveArrow({ x: base.Y, y: base.r }, { x: cur.Y, y: cur.r }, "sobre LM", COLORS.blue),
    }),
  ].join("");
  const equations = [
    {
      label: "Saldos reales",
      tag: "M/P",
      formula: "M/P = M / P",
      baseHTML: `M/P = ${termHTML(base.M, base.M, 1)} / ${termHTML(base.P, base.P, 2)} = <b>${fmt(base.realM, 2)}</b>`,
      curHTML: `M/P = ${termHTML(base.M, cur.M, 1)} / ${termHTML(base.P, cur.P, 2)} = <b>${fmt(cur.realM, 2)}</b>`,
    },
    {
      label: "Demanda de dinero",
      tag: "Ld(Y, r)",
      formula: "Ld = n + k·Y − ℓ·r",
      baseHTML: `Ld = ${termHTML(base.n, base.n, 1)} + ${termHTML(base.k, base.k, 2)}·${termHTML(base.Y, base.Y, 1)} − ${termHTML(base.l, base.l, 1)}·r`,
      curHTML: `Ld = ${termHTML(base.n, cur.n, 1)} + ${termHTML(base.k, cur.k, 2)}·${termHTML(base.Y, cur.Y, 1)} − ${termHTML(base.l, cur.l, 1)}·r`,
    },
    {
      label: "Tasa de equilibrio",
      tag: "M/P = Ld",
      formula: "r = (n + k·Y − M/P) / ℓ",
      baseHTML: `r = (${termHTML(base.n, base.n, 1)} + ${termHTML(base.k, base.k, 2)}·${termHTML(base.Y, base.Y, 1)} − ${termHTML(base.realM, base.realM, 2)}) / ${termHTML(base.l, base.l, 1)} = <b>${fmt(base.r, 2)}%</b>`,
      curHTML: `r = (${termHTML(base.n, cur.n, 1)} + ${termHTML(base.k, cur.k, 2)}·${termHTML(base.Y, cur.Y, 1)} − ${termHTML(base.realM, cur.realM, 2)}) / ${termHTML(base.l, cur.l, 1)} = <b>${fmt(cur.r, 2)}%</b>`,
    },
  ];
  return {
    formulas: ["M/P = L(n, r, Y)", "Ld = n + kY - ℓr", "r = (n + kY - M/P)/ℓ"],
    links: [
      {
        from: "Mercado de dinero",
        variable: "M/P",
        base: base.realM,
        value: cur.realM,
        color: COLORS.blue,
        to: "Curva LM",
        note: "La oferta real de saldos fija la posición horizontal de la LM.",
      },
      {
        from: "Demanda L(r,Y)",
        variable: "r",
        base: base.r,
        value: cur.r,
        unit: "%",
        color: COLORS.amber,
        to: "Punto sobre LM",
        note: "Para cada Y, el cruce monetario entrega la tasa que se dibuja en LM.",
      },
    ],
    charts,
    equations,
    steps: [
      `La oferta real de dinero pasa de ${fmt(base.realM, 2)} a ${fmt(cur.realM, 2)}.`,
      `La LM se desplaza a la derecha si aumenta M o cae P; se desplaza a la izquierda si aumenta la demanda autónoma n.`,
      `Para Y = ${fmt(cur.Y, 1)}, la tasa que equilibra dinero es ${fmt(cur.r, 2, "%")}.`,
    ],
    rows: [
      row("Oferta real M/P", base.realM, cur.realM, 2),
      row("Demanda autónoma n", base.n, cur.n, 2),
      row("Producto Y", base.Y, cur.Y, 2),
      row("Tasa de interés r", base.r, cur.r, 2, "%"),
    ],
    shocks: {
      title: "Estática comparativa · LM (mercado de saldos reales)",
      subtitle: "M/P = n + k·Y − ℓ·r. Cualquier choque que aumente M/P ampliá la LM hacia la derecha.",
      columns: [
        { key: "MP", label: "M/P" },
        { key: "r", label: "r de equilib." },
        { key: "LM", label: "LM" },
      ],
      rows: [
        { shock: "↑ M  (oferta nominal)", effects: { MP: "up", r: "down", LM: "up" }, note: "LM → derecha" },
        { shock: "↓ P  (precios)", effects: { MP: "up", r: "down", LM: "up" } },
        { shock: "↑ n  (demanda autónoma de dinero)", effects: { MP: "flat", r: "up", LM: "down" }, note: "LM → izquierda" },
        { shock: "↑ Y  (más producto)", effects: { MP: "flat", r: "up", LM: "flat" }, note: "movimiento sobre LM" },
        { shock: "↑ k  (sensibilidad de Ld a Y)", effects: { MP: "flat", r: "up", LM: "flat" } },
        { shock: "↑ ℓ  (sensibilidad de Ld a r)", effects: { MP: "flat", r: "down", LM: "flat" }, note: "LM más plana" },
      ],
    },
  };
}

function solveISLM(p, price = p.P) {
  const realM = p.M / price;
  const A = p.a - p.c * p.T + p.h + p.G;
  const denom = 1 - p.c + (p.b * p.k) / p.l;
  const Y = (A - (p.b * p.n) / p.l + (p.b * realM) / p.l) / denom;
  const r = (p.n + p.k * Y - realM) / p.l;
  return { ...p, P: price, realM, A, Y, r };
}

function renderISLM(base, cur) {
  const yDomain = [50, Math.max(190, base.Y, cur.Y) * 1.04];
  const rDomain = [0, 8];
  const isBaseFn = (Y) => (base.A - (1 - base.c) * Y) / base.b;
  const isCurFn = (Y) => (cur.A - (1 - cur.c) * Y) / cur.b;
  const lmBaseFn = (Y) => (base.n + base.k * Y - base.realM) / base.l;
  const lmCurFn = (Y) => (cur.n + cur.k * Y - cur.realM) / cur.l;
  const charts = [
    lineChart({
      title: "1. Equilibrio simultáneo IS-LM",
      subtitle: "Política fiscal mueve IS, política monetaria mueve LM. El cruce fija (Y, r).",
      xLabel: "Producto Y",
      yLabel: "Tasa de interés r",
      xDomain: yDomain,
      yDomain: rDomain,
      shifts: [
        { basePoints: samplePoints(isBaseFn, yDomain), newPoints: samplePoints(isCurFn, yDomain), color: COLORS.coral, opacity: 0.13 },
        { basePoints: samplePoints(lmBaseFn, yDomain), newPoints: samplePoints(lmCurFn, yDomain), color: COLORS.blue, opacity: 0.13 },
      ],
      curves: [
        { label: "IS base", color: COLORS.base, dash: "7 6", points: samplePoints(isBaseFn, yDomain) },
        { label: "LM base", color: COLORS.base, dash: "2 5", points: samplePoints(lmBaseFn, yDomain) },
        { label: "IS nueva", color: COLORS.coral, points: samplePoints(isCurFn, yDomain) },
        { label: "LM nueva", color: COLORS.blue, points: samplePoints(lmCurFn, yDomain) },
      ],
      crossGuides: [
        { orientation: "v", x: cur.Y, color: COLORS.teal, label: `Y = ${fmt(cur.Y, 1)}` },
        { orientation: "h", y: cur.r, color: COLORS.amber, label: `r = ${fmt(cur.r, 2)}%` },
      ],
      markers: [
        { x: base.Y, y: base.r, label: "Base", color: COLORS.base, guides: true },
        { x: cur.Y, y: cur.r, label: "Nuevo", color: COLORS.teal, guides: true, pulse: true },
      ],
      arrows: moveArrow({ x: base.Y, y: base.r }, { x: cur.Y, y: cur.r }, "IS ∩ LM", COLORS.teal),
      wide: true,
    }),
    barChart({
      title: "2. Resultado simultáneo",
      subtitle: "Variables endógenas determinadas por la intersección IS ∩ LM.",
      yLabel: "Nivel",
      bars: [
        { label: "Y", base: base.Y, value: cur.Y, color: COLORS.teal },
        { label: "r", base: base.r, value: cur.r, color: COLORS.amber },
        { label: "M/P", base: base.realM, value: cur.realM, color: COLORS.blue },
        { label: "A", base: base.A, value: cur.A, color: COLORS.coral },
      ],
    }),
  ].join("");
  const equations = [
    {
      label: "IS",
      tag: "(1−c)·Y = A − b·r",
      formula: "Y · (1 − c) = (a − cT + h + G) − b · r",
      baseHTML: `(${termHTML(base.Y, base.Y, 1)})·(1 − ${termHTML(base.c, base.c, 2)}) = ${termHTML(base.A, base.A, 2)} − ${termHTML(base.b, base.b, 2)}·${termHTML(base.r, base.r, 2, "%")}`,
      curHTML: `(${termHTML(base.Y, cur.Y, 1)})·(1 − ${termHTML(base.c, cur.c, 2)}) = ${termHTML(base.A, cur.A, 2)} − ${termHTML(base.b, cur.b, 2)}·${termHTML(base.r, cur.r, 2, "%")}`,
    },
    {
      label: "LM",
      tag: "M/P = n + k·Y − ℓ·r",
      formula: "M / P = n + k · Y − ℓ · r",
      baseHTML: `${termHTML(base.realM, base.realM, 2)} = ${termHTML(base.n, base.n, 1)} + ${termHTML(base.k, base.k, 2)}·${termHTML(base.Y, base.Y, 1)} − ${termHTML(base.l, base.l, 1)}·${termHTML(base.r, base.r, 2, "%")}`,
      curHTML: `${termHTML(base.realM, cur.realM, 2)} = ${termHTML(base.n, cur.n, 1)} + ${termHTML(base.k, cur.k, 2)}·${termHTML(base.Y, cur.Y, 1)} − ${termHTML(base.l, cur.l, 1)}·${termHTML(base.r, cur.r, 2, "%")}`,
    },
    {
      label: "Producto de equilibrio",
      tag: "Y* = ?",
      formula: "Y = [A − b·n/ℓ + b·(M/P)/ℓ] / [(1 − c) + b·k/ℓ]",
      baseHTML: `Y = [${termHTML(base.A, base.A, 2)} − ${termHTML(base.b, base.b, 2)}·${termHTML(base.n, base.n, 1)}/${termHTML(base.l, base.l, 1)} + ${termHTML(base.b, base.b, 2)}·${termHTML(base.realM, base.realM, 2)}/${termHTML(base.l, base.l, 1)}] / [(1 − ${termHTML(base.c, base.c, 2)}) + ${termHTML(base.b, base.b, 2)}·${termHTML(base.k, base.k, 2)}/${termHTML(base.l, base.l, 1)}] = <b>${fmt(base.Y, 2)}</b>`,
      curHTML: `Y = [${termHTML(base.A, cur.A, 2)} − ${termHTML(base.b, cur.b, 2)}·${termHTML(base.n, cur.n, 1)}/${termHTML(base.l, cur.l, 1)} + ${termHTML(base.b, cur.b, 2)}·${termHTML(base.realM, cur.realM, 2)}/${termHTML(base.l, cur.l, 1)}] / [(1 − ${termHTML(base.c, cur.c, 2)}) + ${termHTML(base.b, cur.b, 2)}·${termHTML(base.k, cur.k, 2)}/${termHTML(base.l, cur.l, 1)}] = <b>${fmt(cur.Y, 2)}</b>`,
      note: "La política fiscal opera por el numerador (A); la monetaria por M/P.",
    },
  ];
  return {
    formulas: ["IS: (1-c)Y = A - br", "LM: M/P = n + kY - ℓr", "Equilibrio: IS ∩ LM"],
    links: [
      {
        from: "IS",
        variable: "Y",
        base: base.Y,
        value: cur.Y,
        color: COLORS.coral,
        to: "LM",
        note: "El producto debe ser compatible con bienes y dinero al mismo tiempo.",
      },
      {
        from: "LM",
        variable: "r",
        base: base.r,
        value: cur.r,
        unit: "%",
        color: COLORS.amber,
        to: "IS",
        note: "La tasa cierra la inversión deseada en la IS y la demanda de dinero en la LM.",
      },
    ],
    charts,
    equations,
    steps: [
      `La IS se ubica por el gasto autónomo A = ${fmt(cur.A, 2)}; la LM por saldos reales M/P = ${fmt(cur.realM, 2)}.`,
      `El cruce simultáneo mueve el producto de ${fmt(base.Y, 2)} a ${fmt(cur.Y, 2)}.`,
      `La tasa de interés ${direction(cur.r - base.r, "sube", "baja")} hasta ${fmt(cur.r, 2, "%")}, reflejando la presión relativa de bienes y dinero.`,
    ],
    rows: [
      row("Producto Y", base.Y, cur.Y, 2),
      row("Tasa de interés r", base.r, cur.r, 2, "%"),
      row("Gasto autónomo A", base.A, cur.A, 2),
      row("Saldos reales M/P", base.realM, cur.realM, 2),
    ],
    shocks: {
      title: "Estática comparativa · IS-LM (corto plazo, economía cerrada)",
      subtitle: "Política fiscal mueve IS · Política monetaria mueve LM · Equilibrio simultáneo en (Y*, r*).",
      columns: [
        { key: "IS", label: "IS" },
        { key: "LM", label: "LM" },
        { key: "Y", label: "Y*" },
        { key: "r", label: "r*" },
      ],
      rows: [
        { shock: "↑ G  (fiscal expansiva)", effects: { IS: "up", LM: "flat", Y: "up", r: "up" }, note: "crowding-out parcial" },
        { shock: "↑ T  (impuestos)", effects: { IS: "down", LM: "flat", Y: "down", r: "down" } },
        { shock: "↑ a o ↑ h  (gasto autónomo)", effects: { IS: "up", LM: "flat", Y: "up", r: "up" } },
        { shock: "↑ M  (monetaria expansiva)", effects: { IS: "flat", LM: "up", Y: "up", r: "down" } },
        { shock: "↓ M  (monetaria contractiva)", effects: { IS: "flat", LM: "down", Y: "down", r: "up" } },
        { shock: "↑ P  (precios)", effects: { IS: "flat", LM: "down", Y: "down", r: "up" }, note: "deriva la pendiente de DA" },
        { shock: "↑ n  (demanda autónoma de dinero)", effects: { IS: "flat", LM: "down", Y: "down", r: "up" } },
        { shock: "Mix coordinado: ↑G y ↑M", effects: { IS: "up", LM: "up", Y: "up", r: "flat" }, note: "expande Y sin presionar r" },
      ],
    },
  };
}

function renderAD(base, cur) {
  const pDomain = [0.9, 4.2];
  const basePts = pointsFromY((P) => solveISLM(base, P).Y, pDomain);
  const curPts = pointsFromY((P) => solveISLM(cur, P).Y, pDomain);
  const yDomain = domainFrom([...basePts, ...curPts].map((p) => p.x).concat([base.Y, cur.Y]), 0.08);
  const rDomain = [0, 8];
  const islmChart = lineChart({
    title: "1. IS-LM detrás de un punto de DA",
    subtitle: "Al cambiar P, cambia M/P y se desplaza LM. Cada P entrega un (Y, r).",
    xLabel: "Producto Y",
    yLabel: "Tasa de interés r",
    xDomain: yDomain,
    yDomain: rDomain,
    shifts: [{ basePoints: samplePoints((Y) => (base.n + base.k * Y - base.realM) / base.l, yDomain), newPoints: samplePoints((Y) => (cur.n + cur.k * Y - cur.realM) / cur.l, yDomain), color: COLORS.blue, opacity: 0.13 }],
    curves: [
      { label: "IS", color: COLORS.coral, points: samplePoints((Y) => (cur.A - (1 - cur.c) * Y) / cur.b, yDomain) },
      { label: "LM a P", color: COLORS.blue, points: samplePoints((Y) => (cur.n + cur.k * Y - cur.realM) / cur.l, yDomain) },
      { label: "LM base", color: COLORS.base, dash: "7 6", points: samplePoints((Y) => (base.n + base.k * Y - base.realM) / base.l, yDomain) },
    ],
    crossGuides: [
      { orientation: "v", x: cur.Y, color: COLORS.teal, label: `Y = ${fmt(cur.Y, 1)}` },
      { orientation: "h", y: cur.r, color: COLORS.amber, label: `r = ${fmt(cur.r, 2)}%` },
    ],
    markers: [{ x: cur.Y, y: cur.r, label: `P = ${fmt(cur.P, 2)}`, color: COLORS.teal, guides: true, pulse: true }],
    arrows: moveArrow({ x: base.Y, y: base.r }, { x: cur.Y, y: cur.r }, "ΔP → ΔLM", COLORS.teal),
  });
  const adChart = lineChart({
    title: "2. Demanda agregada derivada",
    subtitle: "Cada punto de DA es un equilibrio IS-LM para un nivel de precios.",
    xLabel: "Producto Y",
    yLabel: "Nivel de precios P",
    xDomain: yDomain,
    yDomain: pDomain,
    shifts: [{ basePoints: basePts, newPoints: curPts, color: COLORS.teal, opacity: 0.15 }],
    curves: [
      { label: "DA base", color: COLORS.base, dash: "7 6", points: basePts },
      { label: "DA nueva", color: COLORS.teal, points: curPts },
    ],
    crossGuides: [
      { orientation: "v", x: cur.Y, color: COLORS.teal, label: `Y = ${fmt(cur.Y, 1)}` },
      { orientation: "h", y: cur.P, color: COLORS.violet, label: `P = ${fmt(cur.P, 2)}` },
    ],
    markers: [
      { x: base.Y, y: base.P, label: "Base", color: COLORS.base, guides: true },
      { x: cur.Y, y: cur.P, label: "Nuevo", color: COLORS.teal, guides: true, pulse: true },
    ],
    arrows: moveArrow({ x: base.Y, y: base.P }, { x: cur.Y, y: cur.P }, "punto DA", COLORS.teal),
  });
  const tablePts = [1.2, 1.8, 2.4, 3.0, 3.6].map((P) => ({ P, Y: solveISLM(cur, P).Y }));
  const adBars = barChart({
    title: "3. Puntos de la DA nueva (5 niveles de P)",
    subtitle: "Menor P aumenta saldos reales y eleva Y demandado: barras crecen al bajar P.",
    yLabel: "Producto",
    bars: tablePts.map((p, i) => ({ label: `P=${fmt(p.P, 1)}`, base: solveISLM(base, p.P).Y, value: p.Y, color: [COLORS.teal, COLORS.blue, COLORS.green, COLORS.amber, COLORS.coral][i] })),
    wide: true,
  });
  const equations = [
    {
      label: "Saldos reales y nivel de precios",
      tag: "M/P",
      formula: "M / P",
      baseHTML: `M/P = ${termHTML(base.M, base.M, 1)} / ${termHTML(base.P, base.P, 2)} = <b>${fmt(base.realM, 2)}</b>`,
      curHTML: `M/P = ${termHTML(base.M, cur.M, 1)} / ${termHTML(base.P, cur.P, 2)} = <b>${fmt(cur.realM, 2)}</b>`,
      note: "Si P sube, M/P baja, LM se contrae y Y demandado cae: pendiente negativa de DA.",
    },
    {
      label: "Producto demandado",
      tag: "Y(P) por IS-LM",
      formula: "Y(P) = [A − b·n/ℓ + b·(M/P)/ℓ] / [(1 − c) + b·k/ℓ]",
      baseHTML: `Y(${termHTML(base.P, base.P, 2)}) = <b>${fmt(base.Y, 2)}</b>`,
      curHTML: `Y(${termHTML(base.P, cur.P, 2)}) = <b>${fmt(cur.Y, 2)}</b>`,
    },
    {
      label: "Choques que mueven toda la DA",
      tag: "ΔG, ΔT, ΔM, Δa, Δh",
      formula: "Política fiscal o monetaria expansiva ⇒ DA → derecha",
      baseHTML: `Para P=2: Y_base = <b>${fmt(solveISLM(base, 2).Y, 2)}</b>`,
      curHTML: `Para P=2: Y_nuevo = <b>${fmt(solveISLM(cur, 2).Y, 2)}</b>`,
      note: "El movimiento sobre la DA (cambia P) es distinto del desplazamiento de la DA (cambian A o M).",
    },
  ];
  return {
    formulas: ["P ↓ ⇒ M/P ↑ ⇒ LM → ⇒ Y ↑", "DA: pares (P, Y) compatibles con IS-LM"],
    links: [
      {
        from: "Precio P",
        variable: "M/P",
        base: base.realM,
        value: cur.realM,
        color: COLORS.blue,
        to: "LM",
        note: "El precio cambia saldos reales y desplaza LM.",
      },
      {
        from: "Equilibrio IS-LM",
        variable: "Par (P, Y)",
        base: base.Y,
        value: cur.Y,
        color: COLORS.teal,
        to: "Demanda agregada",
        note: "Ese mismo producto se marca como punto de la curva DA para el precio elegido.",
      },
    ],
    charts: islmChart + adChart + adBars,
    equations,
    steps: [
      `Con P = ${fmt(cur.P, 2)}, los saldos reales son ${fmt(cur.realM, 2)} y determinan la posición de LM.`,
      `Al repetir el equilibrio IS-LM para varios precios aparece una DA con pendiente negativa.`,
      `Los choques fiscales o monetarios desplazan toda la DA: el producto demandado actual queda en ${fmt(cur.Y, 2)}.`,
    ],
    rows: [
      row("Nivel de precios P", base.P, cur.P, 2),
      row("Producto demandado Y", base.Y, cur.Y, 2),
      row("Tasa de interés r", base.r, cur.r, 2, "%"),
      row("Saldos reales M/P", base.realM, cur.realM, 2),
    ],
    shocks: {
      title: "Estática comparativa · Demanda agregada (DA) derivada del IS-LM",
      subtitle: "Cada punto de la DA es un equilibrio IS-LM resuelto para un nivel de precios. Mover IS o LM exógenamente desplaza toda la DA.",
      columns: [
        { key: "ad", label: "DA" },
        { key: "Y", label: "Y demandado" },
        { key: "P", label: "P (en eje)" },
      ],
      rows: [
        { shock: "↑ G  (fiscal expansiva)", effects: { ad: "up", Y: "up", P: "flat" }, note: "DA → derecha" },
        { shock: "↓ T  (impuestos)", effects: { ad: "up", Y: "up", P: "flat" } },
        { shock: "↑ a o ↑ h  (gasto autónomo)", effects: { ad: "up", Y: "up", P: "flat" } },
        { shock: "↑ M  (monetaria expansiva)", effects: { ad: "up", Y: "up", P: "flat" } },
        { shock: "↓ n  (menos demanda autónoma de dinero)", effects: { ad: "up", Y: "up", P: "flat" } },
        { shock: "↑ P  (sube nivel de precios)", effects: { ad: "flat", Y: "down", P: "up" }, note: "movimiento sobre DA" },
        { shock: "↓ P  (baja nivel de precios)", effects: { ad: "flat", Y: "up", P: "down" } },
      ],
    },
  };
}

function computeMF(p) {
  const realM = p.M / p.P;
  const A = p.a - p.c * p.T + p.h - p.b * p.rStar + p.G + p.z + p.tb;
  const Ylm = (realM - p.n + p.l * p.rStar) / p.k;
  const YisAtPeg = (A + p.phi * (p.qPeg - 1)) / (1 - p.c);
  let Y, q, MEndogenous;
  if (p.mode === "fixed") {
    Y = YisAtPeg;
    q = p.qPeg;
    MEndogenous = p.P * (p.n + p.k * Y - p.l * p.rStar);
  } else {
    Y = Ylm;
    q = 1 + ((1 - p.c) * Y - A) / p.phi;
    MEndogenous = p.M;
  }
  const NX = p.z + p.tb + p.phi * (q - 1);
  const C = p.a + p.c * (Y - p.T);
  const S = Y - C - p.G;
  const I = p.h - p.b * p.rStar;
  const SmI = S - I;
  return { ...p, realM: MEndogenous / p.P, A, Y, q, r: p.rStar, MEndogenous, NX, Ylm, C, S, I, SmI };
}

function renderMF(base, cur) {
  const yDomain = [55, Math.max(175, base.Y, cur.Y) * 1.03];
  const qDomain = domainFrom([base.q, cur.q, cur.qPeg, 0.4, 2.2], 0.06);
  const rDomain = [0, 8];
  const isCurve = (p, Y) => 1 + ((1 - p.c) * Y - p.A) / p.phi;
  const moneyX = domainFrom([base.realM, cur.realM, base.n + base.k * base.Y, cur.n + cur.k * cur.Y, 25, 110], 0.12, true);
  const C_Y = COLORS.teal;
  const C_Q = COLORS.violet;
  const C_R = COLORS.amber;
  const ldBaseFn = (r) => base.n + base.k * base.Y - base.l * r;
  const ldCurFn = (r) => cur.n + cur.k * cur.Y - cur.l * r;
  const charts = [
    lineChart({
      title: "1. Mundell-Fleming · IS* y LM*",
      subtitle: cur.mode === "fixed"
        ? "Tipo de cambio fijo: q anclado al peg, M es endógeno para sostener la paridad."
        : "Tipo de cambio flexible: LM* es vertical (fija Y); q ajusta para cerrar IS*.",
      xLabel: "Producto Y",
      yLabel: "TCR / tipo de cambio q",
      xDomain: yDomain,
      yDomain: qDomain,
      shifts: [{ basePoints: samplePoints((Y) => isCurve(base, Y), yDomain), newPoints: samplePoints((Y) => isCurve(cur, Y), yDomain), color: COLORS.coral, opacity: 0.13 }],
      curves: [
        { label: "IS* base", color: COLORS.base, dash: "7 6", points: samplePoints((Y) => isCurve(base, Y), yDomain) },
        { label: "IS* nueva", color: COLORS.coral, points: samplePoints((Y) => isCurve(cur, Y), yDomain) },
      ],
      vLines: [
        { x: base.Y, label: "", color: COLORS.base, dash: "7 6" },
        { x: cur.Y, label: cur.mode === "fixed" ? `Y peg = ${fmt(cur.Y, 1)}` : `LM* en Y = ${fmt(cur.Y, 1)}`, color: C_Y },
      ],
      hLines: cur.mode === "fixed" ? [{ y: cur.qPeg, label: `peg = ${fmt(cur.qPeg, 2)}`, color: C_Q }] : [],
      crossGuides: [{ orientation: "h", y: cur.q, color: C_Q, label: `q = ${fmt(cur.q, 2)}` }],
      markers: [
        { x: base.Y, y: base.q, label: "Base", color: COLORS.base, guides: true, dy: -16 },
        { x: cur.Y, y: cur.q, label: "Nuevo", color: C_Q, guides: true, dy: 18, pulse: true },
      ],
      arrows: moveArrow({ x: base.Y, y: base.q }, { x: cur.Y, y: cur.q }, cur.mode === "fixed" ? "peg → ΔM" : "q ajusta", C_Q),
      wide: true,
    }),
    lineChart({
      title: "2. Mercado monetario con r = r*",
      subtitle: "La movilidad de capitales ancla la tasa doméstica en r*.",
      xLabel: "Saldos reales",
      yLabel: "Tasa de interés",
      xDomain: moneyX,
      yDomain: rDomain,
      shifts: [{ basePoints: pointsFromY(ldBaseFn, rDomain), newPoints: pointsFromY(ldCurFn, rDomain), color: COLORS.blue, opacity: 0.14 }],
      curves: [
        { label: "Ld base", color: COLORS.base, dash: "7 6", points: pointsFromY(ldBaseFn, rDomain) },
        { label: "Ld nueva", color: COLORS.blue, points: pointsFromY(ldCurFn, rDomain) },
      ],
      vLines: [
        { x: base.realM, label: "", color: COLORS.base, dash: "7 6" },
        { x: cur.realM, label: cur.mode === "fixed" ? `M/P endógeno = ${fmt(cur.realM, 2)}` : `M/P = ${fmt(cur.realM, 2)}`, color: COLORS.blue },
      ],
      hLines: [{ y: cur.rStar, label: `r* = ${fmt(cur.rStar, 2)}%`, color: C_R }],
      crossGuides: [{ orientation: "h", y: cur.rStar, color: C_R, label: "" }],
      markers: [{ x: cur.realM, y: cur.rStar, label: "Equilibrio", color: C_R, guides: true, pulse: true }],
      arrows: moveArrow({ x: base.realM, y: base.rStar }, { x: cur.realM, y: cur.rStar }, "ΔM/P", COLORS.blue),
    }),
    (function () {
      const nxVals = [base.NX, cur.NX, base.SmI, cur.SmI];
      const xDom = domainFrom(nxVals.concat([0]), 0.25);
      const nxBaseFn = (q) => base.z + base.tb + base.phi * (q - 1);
      const nxCurFn = (q) => cur.z + cur.tb + cur.phi * (q - 1);
      return lineChart({
        title: "3. Mercado de divisas · S − I y XN",
        subtitle: "El TCR ajusta hasta que las salidas netas de capital (S − I) se igualan con XN(q).",
        xLabel: "S − I  /  XN  (flujo de divisas)",
        yLabel: "TCR / tipo de cambio q",
        xDomain: xDom,
        yDomain: qDomain,
        shifts: [{ basePoints: pointsFromY(nxBaseFn, qDomain), newPoints: pointsFromY(nxCurFn, qDomain), color: COLORS.green, opacity: 0.13 }],
        curves: [
          { label: "XN base", color: COLORS.base, dash: "7 6", points: pointsFromY(nxBaseFn, qDomain) },
          { label: "XN nueva", color: COLORS.green, points: pointsFromY(nxCurFn, qDomain) },
        ],
        vLines: [
          { x: base.SmI, label: "", color: COLORS.base, dash: "7 6" },
          { x: cur.SmI, label: `S − I = ${fmt(cur.SmI, 2)}`, color: COLORS.blue },
        ],
        hLines: cur.mode === "fixed" ? [{ y: cur.qPeg, label: `peg = ${fmt(cur.qPeg, 2)}`, color: C_Q }] : [],
        crossGuides: [{ orientation: "h", y: cur.q, color: C_Q, label: `q = ${fmt(cur.q, 2)}` }],
        markers: [
          { x: base.NX, y: base.q, label: "Base", color: COLORS.base, guides: true, dy: -16 },
          { x: cur.NX, y: cur.q, label: cur.mode === "fixed" ? "XN ≠ S−I (ΔM)" : "XN = S − I", color: C_Q, guides: true, dy: 18, pulse: true },
        ],
        arrows: moveArrow({ x: base.NX, y: base.q }, { x: cur.NX, y: cur.q }, cur.mode === "fixed" ? "BC absorbe brecha" : "q cierra brecha", C_Q),
      });
    })(),
    barChart({
      title: "4. Resultado externo y monetario",
      subtitle: "El régimen cambiario reasigna potencia entre política fiscal, monetaria y comercial.",
      yLabel: "Nivel",
      bars: [
        { label: "Y", base: base.Y, value: cur.Y, color: C_Y },
        { label: "q", base: base.q, value: cur.q, color: C_Q, digits: 2 },
        { label: "XN", base: base.NX, value: cur.NX, color: COLORS.green },
        { label: "S − I", base: base.SmI, value: cur.SmI, color: COLORS.blue },
        { label: "M", base: base.MEndogenous, value: cur.MEndogenous, color: COLORS.coral },
      ],
      wide: true,
    }),
  ].join("");
  const regimeText =
    cur.mode === "fixed"
      ? `Con tipo de cambio fijo, el banco central acomoda M hasta ${fmt(cur.MEndogenous, 2)} para sostener q = ${fmt(cur.q, 2)}.`
      : `Con tipo de cambio flexible, q se mueve hasta ${fmt(cur.q, 2)} y la oferta monetaria fija Y vía LM*.`;
  const equations = [
    {
      label: "IS* (mercado de bienes en abierta pequeña)",
      tag: "Y(1−c) = A + φ(q − 1)",
      formula: "Y · (1 − c) = (a − cT + h − b·r* + G + z + TB) + φ(q − 1)",
      baseHTML: `${termHTML(base.Y, base.Y, 1)}·(1 − ${termHTML(base.c, base.c, 2)}) = ${termHTML(base.A, base.A, 2)} + ${termHTML(base.phi, base.phi, 1)}·(${termHTML(base.q, base.q, 2)} − 1)`,
      curHTML: `${termHTML(base.Y, cur.Y, 1)}·(1 − ${termHTML(base.c, cur.c, 2)}) = ${termHTML(base.A, cur.A, 2)} + ${termHTML(base.phi, cur.phi, 1)}·(${termHTML(base.q, cur.q, 2)} − 1)`,
    },
    {
      label: "LM* (mercado de dinero con r = r*)",
      tag: "M/P = n + k·Y − ℓ·r*",
      formula: "M / P = n + k · Y − ℓ · r*",
      baseHTML: `${termHTML(base.realM, base.realM, 2)} = ${termHTML(base.n, base.n, 1)} + ${termHTML(base.k, base.k, 2)}·${termHTML(base.Y, base.Y, 1)} − ${termHTML(base.l, base.l, 1)}·${termHTML(base.rStar, base.rStar, 2, "%")}`,
      curHTML: `${termHTML(base.realM, cur.realM, 2)} = ${termHTML(base.n, cur.n, 1)} + ${termHTML(base.k, cur.k, 2)}·${termHTML(base.Y, cur.Y, 1)} − ${termHTML(base.l, cur.l, 1)}·${termHTML(base.rStar, cur.rStar, 2, "%")}`,
      note: cur.mode === "fixed"
        ? "Régimen fijo: M se acomoda para sostener q. La política monetaria pierde potencia."
        : "Régimen flexible: M es exógeno y LM* determina Y.",
    },
    {
      label: cur.mode === "fixed" ? "Y de equilibrio (q = peg)" : "Y de equilibrio (LM* fija Y)",
      tag: cur.mode === "fixed" ? "Y(1−c) = A + φ(peg−1)" : "Y = (M/P − n + ℓ·r*)/k",
      formula: cur.mode === "fixed"
        ? "Y = [A + φ(qPeg − 1)] / (1 − c)"
        : "Y = (M/P − n + ℓ · r*) / k",
      baseHTML: cur.mode === "fixed"
        ? `Y = [${termHTML(base.A, base.A, 2)} + ${termHTML(base.phi, base.phi, 1)}·(${termHTML(base.qPeg, base.qPeg, 2)} − 1)] / (1 − ${termHTML(base.c, base.c, 2)}) = <b>${fmt(base.Y, 2)}</b>`
        : `Y = (${termHTML(base.realM, base.realM, 2)} − ${termHTML(base.n, base.n, 1)} + ${termHTML(base.l, base.l, 1)}·${termHTML(base.rStar, base.rStar, 2, "%")}) / ${termHTML(base.k, base.k, 2)} = <b>${fmt(base.Y, 2)}</b>`,
      curHTML: cur.mode === "fixed"
        ? `Y = [${termHTML(base.A, cur.A, 2)} + ${termHTML(base.phi, cur.phi, 1)}·(${termHTML(base.qPeg, cur.qPeg, 2)} − 1)] / (1 − ${termHTML(base.c, cur.c, 2)}) = <b>${fmt(cur.Y, 2)}</b>`
        : `Y = (${termHTML(base.realM, cur.realM, 2)} − ${termHTML(base.n, cur.n, 1)} + ${termHTML(base.l, cur.l, 1)}·${termHTML(base.rStar, cur.rStar, 2, "%")}) / ${termHTML(base.k, cur.k, 2)} = <b>${fmt(cur.Y, 2)}</b>`,
    },
    {
      label: "Tipo de cambio o dinero endógeno",
      tag: cur.mode === "fixed" ? "M endógeno" : "q endógeno",
      formula: cur.mode === "fixed"
        ? "M = P · (n + k·Y − ℓ·r*)"
        : "q = 1 + [(1 − c)·Y − A] / φ",
      baseHTML: cur.mode === "fixed"
        ? `M = ${termHTML(base.P, base.P, 2)}·(${termHTML(base.n, base.n, 1)} + ${termHTML(base.k, base.k, 2)}·${termHTML(base.Y, base.Y, 1)} − ${termHTML(base.l, base.l, 1)}·${termHTML(base.rStar, base.rStar, 2, "%")}) = <b>${fmt(base.MEndogenous, 2)}</b>`
        : `q = 1 + [(1 − ${termHTML(base.c, base.c, 2)})·${termHTML(base.Y, base.Y, 1)} − ${termHTML(base.A, base.A, 2)}] / ${termHTML(base.phi, base.phi, 1)} = <b>${fmt(base.q, 2)}</b>`,
      curHTML: cur.mode === "fixed"
        ? `M = ${termHTML(base.P, cur.P, 2)}·(${termHTML(base.n, cur.n, 1)} + ${termHTML(base.k, cur.k, 2)}·${termHTML(base.Y, cur.Y, 1)} − ${termHTML(base.l, cur.l, 1)}·${termHTML(base.rStar, cur.rStar, 2, "%")}) = <b>${fmt(cur.MEndogenous, 2)}</b>`
        : `q = 1 + [(1 − ${termHTML(base.c, cur.c, 2)})·${termHTML(base.Y, cur.Y, 1)} − ${termHTML(base.A, cur.A, 2)}] / ${termHTML(base.phi, cur.phi, 1)} = <b>${fmt(cur.q, 2)}</b>`,
    },
  ];
  return {
    formulas: ["IS*: Y = C(Y-T) + I(r*) + G + XN(q)", "LM*: M/P = L(r*, Y)", "Mercado de divisas: S − I = XN(q)", "Flexible: q ajusta · Fijo: M ajusta"],
    links: [
      {
        from: "2. Mercado monetario",
        variable: cur.mode === "fixed" ? "M endógeno" : "Y de LM*",
        base: cur.mode === "fixed" ? base.MEndogenous : base.Ylm,
        value: cur.mode === "fixed" ? cur.MEndogenous : cur.Ylm,
        color: COLORS.blue,
        to: "1. IS* y LM*",
        note: cur.mode === "fixed" ? "El BC ajusta M para sostener q = peg." : "LM* vertical fija el producto Y de corto plazo.",
      },
      {
        from: "1. IS* y LM*",
        variable: "q de equilibrio",
        base: base.q,
        value: cur.q,
        color: C_Q,
        to: "3. S − I = XN",
        note: "Ese mismo q se proyecta como TCR en el mercado de divisas.",
      },
      {
        from: "Ahorro · Inversión",
        variable: "S − I",
        base: base.SmI,
        value: cur.SmI,
        color: COLORS.blue,
        to: "3. XN(q)",
        note: "La línea vertical muestra cuánta divisa hay que colocar afuera; XN(q) la absorbe.",
      },
    ],
    charts,
    equations,
    steps: [
      `(1) Movilidad perfecta de capitales fija r doméstica = r* = ${fmt(cur.rStar, 2, "%")}.`,
      `(2) ${cur.mode === "fixed" ? `Bajo TCR fijo, el peg q = ${fmt(cur.qPeg, 2)} ancla IS*; el producto se ubica en Y = ${fmt(cur.Y, 1)} y el banco central acomoda M = ${fmt(cur.MEndogenous, 2)} para sostener la paridad.` : `Bajo TCR flexible, LM* (vertical) determina Y = ${fmt(cur.Y, 1)}; el TCR salta hasta q = ${fmt(cur.q, 2)} para cerrar IS*.`}`,
      `(3) El consumo se ubica en C = ${fmt(cur.C, 2)} y la inversión I(r*) en ${fmt(cur.I, 2)}, con lo que las salidas netas de capital S − I = ${fmt(cur.SmI, 2)}.`,
      `(4) En el mercado de divisas, XN = ${fmt(cur.NX, 2)} ${cur.mode === "fixed" ? "queda determinado por q peg; cualquier diferencia con S − I la cubre el banco central comprando o vendiendo reservas." : "se iguala a S − I por el ajuste de q."}`,
      `(5) ΔY = ${signed(cur.Y - base.Y, 2)}, Δq = ${signed(cur.q - base.q, 2)}, ΔXN = ${signed(cur.NX - base.NX, 2)} respecto al escenario base.`,
    ],
    rows: [
      row("Producto Y", base.Y, cur.Y, 2),
      row("Tasa internacional r*", base.rStar, cur.rStar, 2, "%"),
      row("Consumo C", base.C, cur.C, 2),
      row("Inversión I(r*)", base.I, cur.I, 2),
      row("Ahorro nacional S", base.S, cur.S, 2),
      row("S − I (salidas netas de capital)", base.SmI, cur.SmI, 2),
      row("TCR / tipo de cambio q", base.q, cur.q, 2),
      row("Exportaciones netas XN", base.NX, cur.NX, 2),
      row("Saldos reales M/P", base.realM, cur.realM, 2),
      row("Dinero requerido M", base.MEndogenous, cur.MEndogenous, 2),
    ],
    shocks: cur.mode === "fixed"
      ? {
          title: "Estática comparativa · Mundell-Fleming con TCR FIJO",
          subtitle: "Con paridad fija, el banco central pierde política monetaria autónoma (M se vuelve endógena para sostener q).",
          columns: [
            { key: "Y", label: "Y" },
            { key: "q", label: "q" },
            { key: "XN", label: "XN" },
            { key: "M", label: "M (endóg.)" },
          ],
          rows: [
            { shock: "↑ G  (fiscal expansiva)", effects: { Y: "up", q: "flat", XN: "down", M: "up" }, note: "el BC compra divisas para evitar la apreciación" },
            { shock: "↓ T  (impuestos)", effects: { Y: "up", q: "flat", XN: "down", M: "up" } },
            { shock: "↑ M  (intento de monetaria expansiva)", effects: { Y: "flat", q: "flat", XN: "flat", M: "flat" }, note: "el BC esteriliza para mantener el peg" },
            { shock: "↑ TB  (proteccionismo)", effects: { Y: "up", q: "flat", XN: "up", M: "up" } },
            { shock: "Devaluación (↑ peg)", effects: { Y: "up", q: "up", XN: "up", M: "up" } },
            { shock: "↓ r*  (cae tasa internacional)", effects: { Y: "up", q: "flat", XN: "up", M: "up" } },
          ],
        }
      : {
          title: "Estática comparativa · Mundell-Fleming con TCR FLEXIBLE",
          subtitle: "Con tasa internacional dada y movilidad perfecta, LM* (vertical) fija Y; q ajusta para cerrar IS*.",
          columns: [
            { key: "Y", label: "Y" },
            { key: "q", label: "q" },
            { key: "XN", label: "XN" },
            { key: "M", label: "M" },
          ],
          rows: [
            { shock: "↑ G  (fiscal expansiva)", effects: { Y: "flat", q: "down", XN: "down", M: "flat" }, note: "crowding-out total vía revaluación" },
            { shock: "↓ T  (impuestos)", effects: { Y: "flat", q: "down", XN: "down", M: "flat" } },
            { shock: "↑ M  (monetaria expansiva)", effects: { Y: "up", q: "up", XN: "up", M: "up" }, note: "depreciación expansiva" },
            { shock: "↑ TB  (proteccionismo)", effects: { Y: "flat", q: "down", XN: "flat", M: "flat" }, note: "compensa con revaluación" },
            { shock: "↓ r*  (cae tasa internacional)", effects: { Y: "up", q: "up", XN: "up", M: "flat" } },
            { shock: "↑ z  (XN autónoma)", effects: { Y: "flat", q: "down", XN: "flat", M: "flat" } },
          ],
        },
  };
}

const models = [
  {
    id: "pib",
    title: "Identidad del PIB y gasto agregado",
    source: "Presentaciones 05-07",
    subtitle: "Modelo contable inicial: mide cómo consumo, inversión, gasto público y sector externo componen el producto.",
    defaults: { C: 60, I: 22, G: 25, X: 18, M: 20 },
    controls: [
      { type: "group", label: "Componentes" },
      { key: "C", label: "Consumo C", min: 20, max: 100, step: 1 },
      { key: "I", label: "Inversión I", min: 5, max: 55, step: 1 },
      { key: "G", label: "Gasto público G", min: 5, max: 60, step: 1 },
      { key: "X", label: "Exportaciones X", min: 0, max: 55, step: 1 },
      { key: "M", label: "Importaciones M", min: 0, max: 55, step: 1 },
    ],
    compute: computePib,
    render: renderPib,
  },
  {
    id: "production",
    title: "Economía cerrada LP: ingreso y factores",
    source: "Presentación 08",
    subtitle: "Producto potencial, mercados de factores y distribución del ingreso bajo precios flexibles y pleno empleo.",
    defaults: { A: 1, K: 120, L: 100, alpha: 0.35 },
    controls: [
      { type: "group", label: "Producción" },
      { key: "A", label: "Tecnología A", min: 0.65, max: 1.45, step: 0.01 },
      { key: "K", label: "Capital K", min: 60, max: 210, step: 1 },
      { key: "L", label: "Trabajo L", min: 55, max: 170, step: 1 },
      { key: "alpha", label: "Participación del capital α", min: 0.2, max: 0.55, step: 0.01 },
    ],
    compute: computeProduction,
    render: renderProduction,
  },
  {
    id: "closed",
    title: "Economía cerrada LP: gasto, ahorro e inversión",
    source: "Presentaciones 09-11",
    subtitle: "La tasa de interés equilibra ahorro nacional e inversión; incluye la versión modificada donde el ahorro responde a r.",
    defaults: { Y: 100, G: 22, T: 20, a: 12, c: 0.65, h: 35, b: 6, d: 0 },
    controls: [
      { type: "group", label: "Oferta y política fiscal" },
      { key: "Y", label: "Producto potencial Y", min: 70, max: 140, step: 1 },
      { key: "G", label: "Gasto público G", min: 5, max: 45, step: 1 },
      { key: "T", label: "Impuestos T", min: 5, max: 45, step: 1 },
      { type: "group", label: "Demanda privada" },
      { key: "a", label: "Consumo autónomo a", min: 0, max: 30, step: 1 },
      { key: "c", label: "PMC c", min: 0.35, max: 0.9, step: 0.01 },
      { key: "h", label: "Inversión autónoma h", min: 10, max: 70, step: 1 },
      { key: "b", label: "Sensibilidad de I a r", min: 2, max: 12, step: 0.5 },
      { key: "d", label: "Sensibilidad de C a r", min: 0, max: 4, step: 0.1 },
    ],
    compute: computeClosed,
    render: renderClosed,
  },
  {
    id: "money",
    title: "Oferta monetaria y multiplicador bancario",
    source: "Presentaciones 12-14",
    subtitle: "Modelo de creación monetaria: banco central, sector financiero y hogares determinan M.",
    defaults: { B: 300, ed: 0.4, rd: 0.1 },
    controls: [
      { key: "B", label: "Base monetaria B", min: 120, max: 520, step: 10 },
      { key: "ed", label: "Efectivo / depósitos", min: 0.05, max: 0.9, step: 0.01 },
      { key: "rd", label: "Reservas / depósitos", min: 0.04, max: 0.42, step: 0.01 },
    ],
    compute: computeMoney,
    render: renderMoney,
  },
  {
    id: "inflation",
    title: "Dinero, inflación, Fisher y Baumol-Tobin",
    source: "Presentaciones 15-17",
    subtitle: "Teoría cuantitativa, neutralidad monetaria, inflación esperada y demanda de saldos reales.",
    defaults: { M: 100, V: 5, Y: 500, mu: 0.08, vu: 0, g: 0.03, r: 0.04, F: 2 },
    controls: [
      { type: "group", label: "Nivel de precios" },
      { key: "M", label: "Dinero M", min: 40, max: 190, step: 1 },
      { key: "V", label: "Velocidad V", min: 2, max: 9, step: 0.1 },
      { key: "Y", label: "Producto real Y", min: 250, max: 850, step: 10 },
      { type: "group", label: "Tasas" },
      { key: "mu", label: "Crecimiento de M", min: -0.05, max: 0.35, step: 0.005 },
      { key: "vu", label: "Crecimiento de V", min: -0.08, max: 0.16, step: 0.005 },
      { key: "g", label: "Crecimiento real g", min: -0.04, max: 0.12, step: 0.005 },
      { key: "r", label: "Tasa real r", min: 0.005, max: 0.12, step: 0.005 },
      { key: "F", label: "Costo de ir al banco F", min: 0.4, max: 7, step: 0.1 },
    ],
    compute: computeInflation,
    render: renderInflation,
  },
  {
    id: "small-open",
    title: "Economía abierta pequeña LP",
    source: "Presentaciones 19-21",
    subtitle: "La economía toma r* como dada; el TCR ajusta para que S - I sea igual a XN. Linealización válida cerca de TCR = 1.",
    defaults: { Y: 100, a: 10, c: 0.62, T: 18, G: 22, h: 34, b: 5, rStar: 3, z: -2, tb: 0, phi: 12 },
    controls: [
      { type: "group", label: "Ahorro e inversión" },
      { key: "a", label: "Consumo autónomo a", min: 2, max: 24, step: 1 },
      { key: "h", label: "Inversión autónoma h", min: 18, max: 50, step: 1 },
      { key: "G", label: "Gasto público G", min: 12, max: 32, step: 1 },
      { key: "T", label: "Impuestos T", min: 8, max: 30, step: 1 },
      { key: "rStar", label: "Tasa internacional r*", min: 1, max: 6, step: 0.1 },
      { type: "group", label: "Sector externo" },
      { key: "z", label: "XN autónomas z", min: -10, max: 8, step: 0.5 },
      { key: "tb", label: "Barreras comerciales TB", min: -5, max: 8, step: 0.5 },
      { key: "phi", label: "Sensibilidad de XN al TCR", min: 6, max: 18, step: 0.5 },
    ],
    compute: computeSmallOpen,
    render: renderSmallOpen,
  },
  {
    id: "large-open",
    title: "Economía abierta grande LP",
    source: "Presentación 22",
    subtitle: "Tres gráficos conectados: CF(r), mercado financiero S = I + CF y TCR que iguala CF con XN. Linealización válida cerca de TCR = 1.",
    defaults: { Y: 100, a: 10, c: 0.62, T: 18, G: 22, h: 34, b: 5, cf0: 18, k: 4, z: -2, tb: 0, phi: 12 },
    controls: [
      { type: "group", label: "Ahorro e inversión" },
      { key: "a", label: "Consumo autónomo a", min: 2, max: 24, step: 1 },
      { key: "h", label: "Inversión autónoma h", min: 18, max: 50, step: 1 },
      { key: "G", label: "Gasto público G", min: 12, max: 32, step: 1 },
      { key: "T", label: "Impuestos T", min: 8, max: 30, step: 1 },
      { type: "group", label: "Capitales y comercio" },
      { key: "cf0", label: "CF autónomo", min: 6, max: 30, step: 1 },
      { key: "k", label: "Sensibilidad de CF a r", min: 2, max: 8, step: 0.5 },
      { key: "z", label: "XN autónomas z", min: -10, max: 8, step: 0.5 },
      { key: "tb", label: "Barreras comerciales TB", min: -5, max: 8, step: 0.5 },
      { key: "phi", label: "Sensibilidad de XN al TCR", min: 6, max: 18, step: 0.5 },
    ],
    compute: computeLargeOpen,
    render: renderLargeOpen,
  },
  {
    id: "unemployment",
    title: "Empleo, desempleo natural y rigidez salarial",
    source: "Presentaciones 23-25",
    subtitle: "Stock de desempleo, tasas de separación y enganche, búsqueda, espera y salario mínimo/eficiencia.",
    defaults: { s: 0.04, f: 0.3, markup: 0, union: 0, eff: 0, training: 0, benefit: 0, demand: 100, supply: 25, eta: 9, gamma: 7 },
    controls: [
      { type: "group", label: "Flujos" },
      { key: "s", label: "Separación s", min: 0.01, max: 0.14, step: 0.005 },
      { key: "f", label: "Enganche f", min: 0.05, max: 0.65, step: 0.005 },
      { key: "training", label: "Capacitación / información", min: 0, max: 0.18, step: 0.005 },
      { key: "benefit", label: "Seguro de desempleo", min: 0, max: 0.18, step: 0.005 },
      { type: "group", label: "Rigidez salarial" },
      { key: "markup", label: "Salario mínimo sobre w*", min: 0, max: 0.65, step: 0.01 },
      { key: "union", label: "Presión sindical", min: 0, max: 0.35, step: 0.01 },
      { key: "eff", label: "Salario de eficiencia", min: 0, max: 0.35, step: 0.01 },
    ],
    compute: computeUnemployment,
    render: renderUnemployment,
  },
  {
    id: "cycles",
    title: "Ciclos económicos, DA-OA y Ley de Okun",
    source: "Presentaciones 27",
    subtitle: "Producto observado versus potencial, brecha del producto, desempleo natural y desempleo coyuntural.",
    defaults: { Ypot: 100, uNatural: 8, okun: 2, demandShock: 0, supplyShock: 0 },
    controls: [
      { key: "Ypot", label: "Producto potencial Y*", min: 80, max: 125, step: 1 },
      { key: "uNatural", label: "Desempleo natural", min: 3, max: 16, step: 0.1 },
      { key: "okun", label: "Coeficiente de Okun β", min: 1.2, max: 3.5, step: 0.1 },
      { key: "demandShock", label: "Choque de demanda", min: -30, max: 30, step: 1 },
      { key: "supplyShock", label: "Choque de oferta adverso", min: -25, max: 35, step: 1 },
    ],
    compute: computeCycles,
    render: renderCycles,
  },
  {
    id: "is",
    title: "Modelo IS y cruz keynesiana",
    source: "Presentaciones 29, 31 y multiplicadores",
    subtitle: "Equilibrio de bienes de corto plazo con precios fijos, gasto planeado y desplazamientos de IS.",
    defaults: { a: 18, c: 0.65, T: 18, h: 35, b: 6, G: 22, r: 3 },
    controls: [
      { key: "a", label: "Consumo autónomo a", min: 0, max: 35, step: 1 },
      { key: "c", label: "PMC c", min: 0.35, max: 0.88, step: 0.01 },
      { key: "T", label: "Impuestos T", min: 0, max: 40, step: 1 },
      { key: "h", label: "Inversión autónoma h", min: 10, max: 65, step: 1 },
      { key: "b", label: "Sensibilidad de I a r", min: 2, max: 12, step: 0.5 },
      { key: "G", label: "Gasto público G", min: 5, max: 55, step: 1 },
      { key: "r", label: "Tasa de interés r", min: 0.5, max: 7, step: 0.1 },
    ],
    compute: computeIS,
    render: renderIS,
  },
  {
    id: "lm",
    title: "Modelo LM y preferencia por liquidez",
    source: "Presentación 32",
    subtitle: "Equilibrio del mercado de saldos reales y desplazamientos de la LM.",
    defaults: { M: 120, P: 2, n: 20, k: 0.45, l: 8, Y: 120 },
    controls: [
      { key: "M", label: "Oferta nominal M", min: 50, max: 220, step: 1 },
      { key: "P", label: "Nivel de precios P", min: 0.8, max: 4, step: 0.05 },
      { key: "n", label: "Demanda autónoma n", min: 0, max: 55, step: 1 },
      { key: "k", label: "Sensibilidad a Y", min: 0.15, max: 0.9, step: 0.01 },
      { key: "l", label: "Sensibilidad a r", min: 3, max: 16, step: 0.5 },
      { key: "Y", label: "Producto Y", min: 60, max: 180, step: 1 },
    ],
    compute: computeLM,
    render: renderLM,
  },
  {
    id: "islm",
    title: "Modelo IS-LM",
    source: "Presentación 33",
    subtitle: "Interacción entre el mercado de bienes y el mercado de dinero en economía cerrada de corto plazo.",
    defaults: { a: 18, c: 0.65, T: 18, h: 35, b: 6, G: 22, M: 120, P: 2, n: 20, k: 0.45, l: 8 },
    controls: [
      { type: "group", label: "IS" },
      { key: "a", label: "Consumo autónomo a", min: 0, max: 35, step: 1 },
      { key: "h", label: "Inversión autónoma h", min: 10, max: 65, step: 1 },
      { key: "G", label: "Gasto público G", min: 5, max: 55, step: 1 },
      { key: "T", label: "Impuestos T", min: 0, max: 40, step: 1 },
      { type: "group", label: "LM" },
      { key: "M", label: "Oferta nominal M", min: 50, max: 220, step: 1 },
      { key: "P", label: "Nivel de precios P", min: 0.8, max: 4, step: 0.05 },
      { key: "n", label: "Demanda autónoma n", min: 0, max: 55, step: 1 },
    ],
    compute: solveISLM,
    render: renderISLM,
  },
  {
    id: "ad",
    title: "IS-LM y demanda agregada",
    source: "Presentación 34",
    subtitle: "La DA se deriva resolviendo IS-LM para distintos niveles de precios.",
    defaults: { a: 18, c: 0.65, T: 18, h: 35, b: 6, G: 22, M: 120, P: 2, n: 20, k: 0.45, l: 8 },
    controls: [
      { key: "P", label: "Nivel de precios P", min: 0.9, max: 4, step: 0.05 },
      { key: "M", label: "Oferta nominal M", min: 50, max: 220, step: 1 },
      { key: "a", label: "Consumo autónomo a", min: 0, max: 35, step: 1 },
      { key: "h", label: "Inversión autónoma h", min: 10, max: 65, step: 1 },
      { key: "G", label: "Gasto público G", min: 5, max: 55, step: 1 },
      { key: "T", label: "Impuestos T", min: 0, max: 40, step: 1 },
      { key: "n", label: "Demanda autónoma de dinero n", min: 0, max: 55, step: 1 },
    ],
    compute: solveISLM,
    render: renderAD,
  },
  {
    id: "mf",
    title: "Mundell-Fleming",
    source: "Presentaciones 34-36",
    subtitle: "Economía abierta pequeña de corto plazo con r = r*: efectos de política bajo tipo de cambio flexible o fijo. Linealización válida cerca de q = 1.",
    defaults: { mode: "flex", a: 18, c: 0.65, T: 18, h: 35, b: 5, G: 22, M: 120, P: 2, n: 20, k: 0.55, l: 8, rStar: 3, z: -8, tb: 0, phi: 14, qPeg: 1 },
    controls: [
      { type: "segmented", key: "mode", label: "Régimen cambiario", options: [{ label: "Flexible", value: "flex" }, { label: "Fijo", value: "fixed" }] },
      { type: "group", label: "Política y entorno" },
      { key: "G", label: "Gasto público G", min: 12, max: 32, step: 1 },
      { key: "T", label: "Impuestos T", min: 8, max: 28, step: 1 },
      { key: "M", label: "Oferta monetaria M", min: 80, max: 180, step: 1 },
      { key: "rStar", label: "Tasa internacional r*", min: 1, max: 6, step: 0.1 },
      { key: "tb", label: "Política comercial TB", min: -5, max: 10, step: 0.5 },
      { key: "qPeg", label: "Paridad fija q", min: 0.7, max: 1.4, step: 0.01 },
      { type: "group", label: "Parámetros" },
      { key: "a", label: "Consumo autónomo a", min: 8, max: 30, step: 1 },
      { key: "h", label: "Inversión autónoma h", min: 22, max: 50, step: 1 },
      { key: "z", label: "XN autónomas z", min: -14, max: 4, step: 0.5 },
    ],
    compute: computeMF,
    render: renderMF,
  },
];

const state = Object.fromEntries(models.map((m) => [m.id, clone(m.defaults)]));

function renderControls(model, params) {
  let groupOpen = false;
  const controls = model.controls
    .map((control) => {
      if (control.type === "group") {
        groupOpen = true;
        return `<h3 class="control-group-title">${esc(control.label)}</h3>`;
      }
      if (control.type === "segmented") {
        return `<div class="slider-row">
          <div class="slider-label"><span>${esc(control.label)}</span><span class="slider-value">${esc(params[control.key])}</span></div>
          <div class="segmented">
            ${control.options
              .map(
                (opt) =>
                  `<button class="segment-btn ${params[control.key] === opt.value ? "active" : ""}" data-segment="${model.id}:${control.key}:${opt.value}" type="button">${esc(opt.label)}</button>`,
              )
              .join("")}
          </div>
        </div>`;
      }
      const value = params[control.key];
      return `<div class="slider-row">
        <label class="slider-label" for="${model.id}-${control.key}">
          <span>${esc(control.label)}</span>
          <span class="slider-value">${fmt(value, control.step < 1 ? 2 : 1, control.unit || "")}</span>
        </label>
        <input id="${model.id}-${control.key}" data-slider="${model.id}:${control.key}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${value}" />
        ${control.help ? `<p class="slider-help">${esc(control.help)}</p>` : ""}
      </div>`;
    })
    .join("");
  return `<aside class="controls-panel">
    <div class="controls-head">
      <h2 class="controls-title">Choques y parámetros</h2>
      <button class="reset-btn" data-reset="${model.id}" type="button">Restablecer</button>
    </div>
    ${controls}
  </aside>`;
}

function render() {
  const model = models.find((m) => m.id === activeModelId) || models[0];
  const params = state[model.id];
  const base = model.compute(clone(model.defaults));
  const cur = model.compute(clone(params));
  const view = model.render(base, cur, params);
  const tabs = models
    .map((m) => `<button type="button" class="tab-btn ${m.id === model.id ? "active" : ""}" data-tab="${m.id}">${esc(m.title.replace("Economía ", "").replace("Modelo ", ""))}</button>`)
    .join("");

  app.innerHTML = `<div class="app">
    <header class="topbar">
      <div class="topbar-inner">
        <div>
          <p class="brand-kicker">Macroeconomía aplicada · simuladores teóricos</p>
          <h1 class="brand-title">Laboratorio interactivo de modelos macroeconómicos</h1>
          <p class="brand-note">Todos los escenarios usan unidades normalizadas y no representan datos de ninguna economía real.</p>
        </div>
        <div class="status-strip">
          <span class="status-pill">${models.length} módulos</span>
          <span class="status-pill">Sliders + curvas + tablas</span>
        </div>
      </div>
      <nav class="tabs" aria-label="Modelos macroeconómicos">${tabs}</nav>
    </header>
    <main class="content">
      <section class="model-head">
        <div>
          <h2 class="model-title">${esc(model.title)}</h2>
          <p class="model-subtitle">${esc(model.subtitle)}</p>
        </div>
        <div class="source-badge">${esc(model.source)}</div>
      </section>
      <section class="model-layout">
        ${renderControls(model, params)}
        <div class="visuals">
          ${formulas(view.formulas)}
          ${connectionPanel(view.links)}
          <div class="charts-grid">${view.charts}</div>
          ${equationsPanel(view.equations || [])}
          ${explainPanel(model, params, view.steps)}
          ${shocksTablePanel(view.shocks)}
          ${tablePanel(view.rows, "Base = valores iniciales del simulador; Nuevo = escenario definido por los sliders.")}
        </div>
      </section>
    </main>
  </div>`;

  bindEvents();
  const tabsEl = document.querySelector(".tabs");
  const activeTab = document.querySelector(".tab-btn.active");
  if (tabsEl && activeTab) {
    tabsEl.scrollLeft = activeTab.offsetLeft - tabsEl.clientWidth / 2 + activeTab.clientWidth / 2;
  }
  window.scrollTo({ left: 0 });
}

function bindEvents() {
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeModelId = btn.dataset.tab;
      render();
    });
  });
  document.querySelectorAll("[data-slider]").forEach((input) => {
    input.addEventListener("input", () => {
      const [modelId, key] = input.dataset.slider.split(":");
      state[modelId][key] = Number(input.value);
      render();
    });
  });
  document.querySelectorAll("[data-reset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modelId = btn.dataset.reset;
      const model = models.find((m) => m.id === modelId);
      state[modelId] = clone(model.defaults);
      render();
    });
  });
  document.querySelectorAll("[data-segment]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [modelId, key, value] = btn.dataset.segment.split(":");
      state[modelId][key] = value;
      render();
    });
  });
}

render();
