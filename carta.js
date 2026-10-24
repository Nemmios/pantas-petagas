/* =====================================================================
   PANTAS Petagas — carta ringkas (SVG) untuk laporan HEM
   Warna ikut peranan (pemboleh ubah CSS --viz-*), tanpa pustaka luar.
   ===================================================================== */
const CARTA = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const warnaPeratus = p => (p >= 95 ? "var(--hijau)" : p >= 90 ? "var(--oren)" : "var(--merah)");

  // ---------- 1. Trend harian (garis) ----------
  // data: { label: ["1","2",...], tarikh: [...], siri: [{ nama, warna, nilai: [..|null], th: [..] }], sasaran: 95 }
  function trend(el, data) {
    const W = Math.max(300, el.clientWidth || 600), H = 230, kiri = 34, kanan = 64, atas = 14, bawah = 26;
    const semua = data.siri.flatMap(s => s.nilai).filter(v => v != null);
    if (!semua.length) { el.innerHTML = `<div class="muat">Tiada data kehadiran bagi bulan ini.</div>`; return; }
    const yMin = Math.min(90, Math.floor(Math.min(...semua) / 5) * 5), yMax = 100;
    const n = data.label.length, lebar = W - kiri - kanan, tinggi = H - atas - bawah;
    const x = i => kiri + (n === 1 ? lebar / 2 : (i * lebar) / (n - 1));
    const y = v => atas + ((yMax - v) / (yMax - yMin)) * tinggi;
    let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Trend peratus kehadiran harian">`;
    for (let v = yMin; v <= yMax; v += 5) {
      svg += `<line x1="${kiri}" x2="${W - kanan}" y1="${y(v)}" y2="${y(v)}" stroke="var(--viz-grid)" stroke-width="1"/>
        <text x="${kiri - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--teks-2)">${v}%</text>`;
    }
    if (data.sasaran) svg += `<line x1="${kiri}" x2="${W - kanan}" y1="${y(data.sasaran)}" y2="${y(data.sasaran)}" stroke="var(--teks-2)" stroke-dasharray="4 4" stroke-width="1"/>`;
    const langkah = Math.ceil(n / Math.max(1, Math.floor(lebar / 34)));
    data.label.forEach((l, i) => { if ((i % langkah === 0 && (n - 1 - i >= langkah || i === n - 1)) || i === n - 1) svg += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--teks-2)">${esc(l)}</text>`; });
    data.siri.forEach(s => {
      let d = "", mula = true;
      s.nilai.forEach((v, i) => { if (v == null) { mula = true; return; } d += `${mula ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; mula = false; });
      svg += `<path d="${d}" fill="none" stroke="${s.warna}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      s.nilai.forEach((v, i) => { if (v != null) svg += `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${s.warna}" stroke="var(--kad)" stroke-width="2"/>`; });
      const akhir = s.nilai.map((v, i) => [v, i]).filter(p => p[0] != null).pop();
      if (akhir && data.siri.length > 1) svg += `<text x="${x(akhir[1]) + 8}" y="${y(akhir[0]) + 4}" font-size="11.5" font-weight="600" fill="var(--teks)">${esc(s.nama)}</text>`;
    });
    svg += `<line class="c-garis" x1="0" x2="0" y1="${atas}" y2="${H - bawah}" stroke="var(--teks-2)" stroke-width="1" visibility="hidden"/>
      <rect x="${kiri}" y="${atas}" width="${lebar}" height="${tinggi}" fill="transparent" class="c-kawasan"/></svg>`;
    el.style.position = "relative";
    el.innerHTML = svg + `<div class="c-tip" hidden></div>`;
    const tip = el.querySelector(".c-tip"), garis = el.querySelector(".c-garis"), kawasan = el.querySelector(".c-kawasan"), svgEl = el.querySelector("svg");
    const gerak = ev => {
      const r = svgEl.getBoundingClientRect(), px = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - kiri) / lebar) * (n - 1))));
      garis.setAttribute("x1", x(i)); garis.setAttribute("x2", x(i)); garis.setAttribute("visibility", "visible");
      tip.hidden = false;
      tip.innerHTML = `<b>${esc(data.tarikh[i])}</b>` + data.siri.map(s => `<div><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${s.warna};margin-right:6px"></span>${esc(s.nama)}: <b>${s.nilai[i] == null ? "—" : s.nilai[i].toFixed(1) + "%"}</b>${s.nilai[i] == null ? "" : ` · ${s.th[i]} TH`}</div>`).join("");
      const kiriPx = (x(i) / W) * r.width;
      tip.style.left = Math.min(Math.max(0, kiriPx - 70), r.width - 160) + "px";
    };
    kawasan.addEventListener("pointermove", gerak); kawasan.addEventListener("pointerdown", gerak);
    kawasan.addEventListener("pointerleave", () => { tip.hidden = true; garis.setAttribute("visibility", "hidden"); });
  }

  // ---------- 2. Kedudukan kelas (plot titik, terendah dahulu) ----------
  // baris: [{ kelas, peratus, guru, th, hari }]
  function kedudukan(el, baris) {
    const ada = baris.filter(b => b.peratus != null).sort((a, b) => a.peratus - b.peratus), tiada = baris.filter(b => b.peratus == null);
    if (!ada.length) { el.innerHTML = `<div class="muat">Tiada kelas yang ada rekod bagi bulan ini.</div>`; return; }
    const W = Math.max(300, el.clientWidth || 600), labelW = 112, nilaiW = 50, baris_h = 24, atas = 22;
    const H = atas + ada.length * baris_h + 6;
    const xMin = Math.min(85, Math.floor(Math.min(...ada.map(b => b.peratus)) / 5) * 5), lebar = W - labelW - nilaiW;
    const x = v => labelW + ((v - xMin) / (100 - xMin)) * lebar;
    let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Kedudukan kelas ikut peratus kehadiran">`;
    for (let v = xMin; v <= 100; v += 5) svg += `<line x1="${x(v)}" x2="${x(v)}" y1="${atas - 4}" y2="${H - 4}" stroke="var(--viz-grid)"/>
      <text x="${x(v)}" y="${atas - 8}" text-anchor="middle" font-size="11" fill="var(--teks-2)">${v}%</text>`;
    [90, 95].forEach(v => { if (v > xMin) svg += `<line x1="${x(v)}" x2="${x(v)}" y1="${atas - 4}" y2="${H - 4}" stroke="var(--teks-2)" stroke-dasharray="3 3"/>`; });
    ada.forEach((b, i) => {
      const cy = atas + i * baris_h + baris_h / 2;
      svg += `<g><title>${esc(b.kelas)} · ${b.peratus}% · ${b.th} TH dalam ${b.hari} hari · ${esc(b.guru || "")}</title>
        <text x="${labelW - 8}" y="${cy + 4}" text-anchor="end" font-size="11.5" fill="var(--teks)">${esc(b.kelas.length > 14 ? b.kelas.slice(0, 13) + "…" : b.kelas)}</text>
        <line x1="${x(xMin)}" x2="${x(b.peratus)}" y1="${cy}" y2="${cy}" stroke="var(--viz-grid)" stroke-width="2"/>
        <circle cx="${x(b.peratus)}" cy="${cy}" r="5.5" fill="${warnaPeratus(b.peratus)}" stroke="var(--kad)" stroke-width="2"/>
        <text x="${W - 4}" y="${cy + 4}" text-anchor="end" font-size="12" font-weight="600" fill="var(--teks)">${b.peratus.toFixed(1)}%</text></g>`;
    });
    el.innerHTML = svg + `</svg>` + (tiada.length ? `<p class="nota" style="margin:6px 0 0">Tiada rekod: ${tiada.map(b => esc(b.kelas)).join(", ")}</p>` : "");
  }

  // ---------- 3. Pecahan sebab (bar mendatar, bermula dari sifar) ----------
  // baris: [{ kategori, bil }]
  function pecahan(el, baris, label = k => k) {
    const jumlah = baris.reduce((a, b) => a + b.bil, 0);
    if (!jumlah) { el.innerHTML = `<div class="muat">Tiada murid tidak hadir bagi bulan ini.</div>`; return; }
    const maks = Math.max(...baris.map(b => b.bil));
    el.innerHTML = baris.map(b => {
      const amaran = b.kategori === "BELUM ADA SEBAB" || b.kategori === "PONTENG";
      return `<div class="c-bar" title="${esc(label(b.kategori))}: ${b.bil} hari (${Math.round((100 * b.bil) / jumlah)}%)">
        <span class="c-bar-label">${esc(label(b.kategori))}${amaran ? " ⚠" : ""}</span>
        <span class="c-bar-trek"><span style="width:${Math.max(2, (100 * b.bil) / maks)}%;background:${amaran ? "var(--merah)" : "var(--viz-1)"}"></span></span>
        <span class="c-bar-nilai"><b>${b.bil}</b> <small>${Math.round((100 * b.bil) / jumlah)}%</small></span></div>`;
    }).join("");
  }

  return { trend, kedudukan, pecahan, warnaPeratus };
})();
