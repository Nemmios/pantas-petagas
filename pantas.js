/* =====================================================================
   PANTAS Petagas — Pantau Kehadiran Pantas
   Fail kongsi: tetapan, klien Supabase ringan (REST + Auth), utiliti
   ===================================================================== */
const PANTAS = (() => {
  const URL_SB = "https://cgddwlscylvxbwkwbgzk.supabase.co";
  const KUNCI = "sb_publishable_9mHWI4BxESDLswhJ-DmgOw_wEYV9oAZ"; // kunci awam (selamat dikongsi)
  const KUNCI_SESI = "pantas.sesi";

  // ---------- storan selamat ----------
  const simpan = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  // ---------- sesi log masuk ----------
  let sesi = simpan.get(KUNCI_SESI);
  function setSesi(s) {
    if (s && s.access_token) {
      sesi = { access_token: s.access_token, refresh_token: s.refresh_token,
               tamat: Date.now() + (s.expires_in || 3600) * 1000, user: s.user };
      simpan.set(KUNCI_SESI, sesi);
    } else { sesi = null; simpan.del(KUNCI_SESI); }
  }

  async function segarkan() {
    if (!sesi || !sesi.refresh_token) return;
    if (Date.now() < sesi.tamat - 60000) return;
    const r = await fetch(`${URL_SB}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST", headers: { apikey: KUNCI, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: sesi.refresh_token }),
    });
    if (r.ok) setSesi(await r.json()); else setSesi(null);
  }

  function kepala(lain = {}) {
    const h = { apikey: KUNCI, "Content-Type": "application/json", ...lain };
    if (sesi && sesi.access_token) h.Authorization = `Bearer ${sesi.access_token}`;
    return h;
  }

  async function bacaRalat(r) {
    let t = "";
    try { const j = await r.json(); t = j.message || j.msg || j.error_description || j.error || JSON.stringify(j); }
    catch { t = r.statusText; }
    const e = new Error(terjemahRalat(t)); e.status = r.status; throw e;
  }

  function terjemahRalat(t) {
    const m = String(t || "");
    if (/Invalid login credentials/i.test(m)) return "E-mel atau kata laluan salah.";
    if (/Email not confirmed/i.test(m)) return "E-mel belum disahkan. Semak peti masuk e-mel anda.";
    if (/User already registered/i.test(m)) return "E-mel ini sudah berdaftar. Sila log masuk.";
    if (/Password should be at least/i.test(m)) return "Kata laluan mesti sekurang-kurangnya 6 aksara.";
    if (/JWT expired/i.test(m)) return "Sesi tamat. Sila log masuk semula.";
    if (/permission denied|row-level security/i.test(m)) return "Tiada kebenaran untuk tindakan ini.";
    if (/Failed to fetch|NetworkError/i.test(m)) return "Tiada sambungan internet. Cuba lagi.";
    return m;
  }

  // ---------- REST (PostgREST) ----------
  async function api(laluan, { method = "GET", body, prefer, raw } = {}) {
    await segarkan();
    const h = kepala(prefer ? { Prefer: prefer } : {});
    let r;
    try {
      r = await fetch(`${URL_SB}/rest/v1/${laluan}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (e) { throw new Error(terjemahRalat(e.message)); }
    if (!r.ok) await bacaRalat(r);
    if (raw) return r;
    const t = await r.text();
    return t ? JSON.parse(t) : null;
  }
  const q = encodeURIComponent;
  // Supabase menghadkan 1,000 baris setiap permintaan — ambil berperingkat sehingga habis
  const SAIZ = 1000;
  async function semuaHalaman(laluan, opts = {}) {
    const hasil = [], sambung = laluan.includes("?") ? "&" : "?";
    for (let mula = 0; mula < 50 * SAIZ; mula += SAIZ) {
      const r = await api(`${laluan}${sambung}limit=${SAIZ}&offset=${mula}`, opts);
      if (!Array.isArray(r)) return r;
      hasil.push(...r);
      if (r.length < SAIZ) break;
    }
    return hasil;
  }
  const db = {
    pilih: (jadual, query = "") => /(^|&)limit=/.test(query) ? api(`${jadual}?${query}`) : semuaHalaman(`${jadual}?${query}`),
    rpcSemua: (fn, arg = {}) => semuaHalaman(`rpc/${fn}`, { method: "POST", body: arg }),
    tambah: (jadual, baris) => api(jadual, { method: "POST", body: baris, prefer: "return=minimal" }),
    upsert: (jadual, baris, konflik, abaikan = false) =>
      api(`${jadual}?on_conflict=${konflik}`, { method: "POST", body: baris,
        prefer: `resolution=${abaikan ? "ignore" : "merge"}-duplicates,return=minimal` }),
    kemaskini: (jadual, query, nilai) => api(`${jadual}?${query}`, { method: "PATCH", body: nilai, prefer: "return=minimal" }),
    padam: (jadual, query) => api(`${jadual}?${query}`, { method: "DELETE", prefer: "return=minimal" }),
    rpc: (fn, arg = {}) => api(`rpc/${fn}`, { method: "POST", body: arg }),
  };

  // ---------- Auth (GoTrue) ----------
  const auth = {
    get sesi() { return sesi; },
    async masuk(emel, kata) {
      const r = await fetch(`${URL_SB}/auth/v1/token?grant_type=password`, {
        method: "POST", headers: { apikey: KUNCI, "Content-Type": "application/json" },
        body: JSON.stringify({ email: emel.trim().toLowerCase(), password: kata }),
      }).catch(e => { throw new Error(terjemahRalat(e.message)); });
      if (!r.ok) await bacaRalat(r);
      setSesi(await r.json());
      return sesi;
    },
    async daftar(emel, kata, nama) {
      const r = await fetch(`${URL_SB}/auth/v1/signup`, {
        method: "POST", headers: { apikey: KUNCI, "Content-Type": "application/json" },
        body: JSON.stringify({ email: emel.trim().toLowerCase(), password: kata, data: { nama: nama.trim().toUpperCase() } }),
      }).catch(e => { throw new Error(terjemahRalat(e.message)); });
      if (!r.ok) await bacaRalat(r);
      const j = await r.json();
      if (j.access_token) setSesi(j);
      return j;
    },
    async keluar() {
      try { await fetch(`${URL_SB}/auth/v1/logout`, { method: "POST", headers: kepala() }); } catch {}
      setSesi(null);
    },
    async pengguna() {
      if (!sesi) return null;
      const r = await db.pilih("pengguna", `select=id,nama,peranan,kelas_id&id=eq.${sesi.user.id}`);
      return r && r[0] ? r[0] : null;
    },
  };

  // ---------- utiliti ----------
  function hariIni() {
    const d = new Date(Date.now() + 8 * 3600 * 1000); // waktu Malaysia
    return d.toISOString().slice(0, 10);
  }
  function tambahHari(iso, n) {
    const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
  }
  const BULAN = ["Jan","Feb","Mac","Apr","Mei","Jun","Jul","Ogo","Sep","Okt","Nov","Dis"];
  const HARI = ["Ahad","Isnin","Selasa","Rabu","Khamis","Jumaat","Sabtu"];
  function tarikhCantik(iso, hari = false) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00Z");
    return `${hari ? HARI[d.getUTCDay()] + ", " : ""}${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  function sesiSekarang() {
    const jam = new Date(Date.now() + 8 * 3600 * 1000).getUTCHours();
    return jam < 12 ? "PAGI" : "PETANG";
  }
  function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function namaPendek(n) {
    return String(n || "").replace(/\s+(BIN|BINTI|BT|B\.|A\/L|A\/P|ANAK)\s+.*$/i, "").trim() || n;
  }
  function toast(msg, jenis = "ok") {
    let t = document.getElementById("toast");
    if (!t) { t = el(`<div id="toast" role="status" aria-live="polite"></div>`); document.body.appendChild(t); }
    t.textContent = msg; t.className = `tunjuk ${jenis}`;
    clearTimeout(t._h); t._h = setTimeout(() => (t.className = ""), 3200);
  }
  function salin(teks) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(teks);
    const a = document.createElement("textarea"); a.value = teks; document.body.appendChild(a); a.select();
    try { document.execCommand("copy"); } finally { a.remove(); }
    return Promise.resolve();
  }
  function telWa(tel) {
    const d = String(tel || "").replace(/\D/g, "");
    if (!d) return null;
    return d.startsWith("60") ? d : "6" + d;
  }
  // nama murid sebagai pautan ke profil murid
  function pautMurid(id, nama) {
    if (!id) return esc(nama);
    return `<a class="pautan-murid" href="murid.html?id=${encodeURIComponent(id)}">${esc(nama)}</a>`;
  }
  function muatTurunCsv(nama, baris) {
    const csv = baris.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const b = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = nama;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  return { URL_SB, KUNCI, db, auth, q, simpan, hariIni, tambahHari, tarikhCantik, sesiSekarang,
           el, esc, namaPendek, toast, salin, telWa, muatTurunCsv, pautMurid };
})();
