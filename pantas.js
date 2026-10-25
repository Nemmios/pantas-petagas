/* =====================================================================
   PANTAS Petagas — Pantau Kehadiran Pantas
   Fail kongsi: tetapan, klien Supabase ringan (REST + Auth), utiliti
   ===================================================================== */
const PANTAS = (() => {
  const URL_SB = "https://cgddwlscylvxbwkwbgzk.supabase.co";
  const KUNCI = "sb_publishable_9mHWI4BxESDLswhJ-DmgOw_wEYV9oAZ"; // kunci awam (selamat dikongsi)
  const KUNCI_SESI = "pantas.sesi";
  const WA_ADMIN = "60148658027";   // nombor WhatsApp Admin PANTAS (untuk "Lupa kata laluan")

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
    if (/should be different from the old/i.test(m)) return "Kata laluan baharu mesti berbeza daripada kata laluan lama.";
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
    get perluTukar() { return !!(sesi && sesi.user && sesi.user.user_metadata && sesi.user.user_metadata.perlu_tukar); },
    async tukarKata(baru) {
      await segarkan();
      const r = await fetch(`${URL_SB}/auth/v1/user`, { method: "PUT", headers: kepala(),
        body: JSON.stringify({ password: baru, data: { perlu_tukar: false } }) })
        .catch(e => { throw new Error(terjemahRalat(e.message)); });
      if (!r.ok) await bacaRalat(r);
      const u = await r.json();
      if (sesi) { sesi.user = u && u.id ? u : { ...sesi.user, user_metadata: { ...(sesi.user.user_metadata || {}), perlu_tukar: false } }; simpan.set(KUNCI_SESI, sesi); }
    },
    async pengguna() {
      if (!sesi) return null;
      let r;
      try { r = await db.pilih("pengguna", `select=id,nama,peranan,kelas_id,nama_jadual&id=eq.${sesi.user.id}`); }
      catch { r = await db.pilih("pengguna", `select=id,nama,peranan,kelas_id&id=eq.${sesi.user.id}`); } // lajur nama_jadual belum wujud
      if (this.perluTukar) await dialogTukarKata(true);     // kata laluan sementara daripada admin
      return r && r[0] ? r[0] : null;
    },
  };

  // ---------- dialog kata laluan ----------
  function tirai(html) {
    const t = el(`<div class="tirai" role="dialog" aria-modal="true"><div class="kad dialog">${html}</div></div>`);
    document.body.appendChild(t); return t;
  }
  function dialogTukarKata(wajib = false) {
    return new Promise(selesai => {
      const t = tirai(`<h2>${wajib ? "Tetapkan kata laluan baharu" : "Tukar kata laluan"}</h2>
        <p class="nota">${wajib ? "Anda log masuk dengan kata laluan sementara. Sila tetapkan kata laluan baharu anda sendiri sebelum meneruskan." : "Kata laluan baharu sekurang-kurangnya 6 aksara."}</p>
        <label for="tkBaru">Kata laluan baharu</label><input id="tkBaru" type="password" autocomplete="new-password" minlength="6">
        <label for="tkUlang">Ulang kata laluan baharu</label><input id="tkUlang" type="password" autocomplete="new-password" minlength="6">
        <div class="tk-mesej"></div>
        <button class="btn utama penuh tk-simpan" type="button">Simpan kata laluan</button>
        ${wajib ? "" : `<button class="btn garis penuh tk-batal" type="button" style="margin-top:8px">Batal</button>`}`);
      const mesej = m => (t.querySelector(".tk-mesej").innerHTML = m ? `<div class="mesej ralat">${esc(m)}</div>` : "");
      t.querySelector("#tkBaru").focus();
      t.querySelector(".tk-simpan").addEventListener("click", async () => {
        const a = t.querySelector("#tkBaru").value, b = t.querySelector("#tkUlang").value;
        if (a.length < 6) return mesej("Kata laluan mesti sekurang-kurangnya 6 aksara.");
        if (a !== b) return mesej("Kedua-dua kata laluan tidak sama.");
        const btn = t.querySelector(".tk-simpan"); btn.disabled = true;
        try { await auth.tukarKata(a); t.remove(); toast("Kata laluan baharu disimpan"); selesai(true); }
        catch (e) { mesej(e.message); btn.disabled = false; }
      });
      const batal = t.querySelector(".tk-batal");
      if (batal) batal.addEventListener("click", () => { t.remove(); selesai(false); });
    });
  }
  function dialogLupaKata(emel = "") {
    const teks = `Assalamualaikum. Saya ${emel ? `(${emel}) ` : ""}terlupa kata laluan PANTAS Petagas. Mohon set semula. Terima kasih.`;
    const t = tirai(`<h2>Lupa kata laluan?</h2>
      <p class="nota">Hubungi <b>Admin PANTAS</b> sekolah. Admin akan memberi anda <b>kata laluan sementara</b>.
        Selepas log masuk dengannya, anda akan diminta menetapkan kata laluan baharu sendiri.</p>
      <textarea rows="4" readonly>${esc(teks)}</textarea>
      <div class="baris" style="margin-top:10px">
        <button class="btn garis lk-salin" type="button">Salin mesej</button>
        <a class="btn wa" target="_blank" rel="noopener" href="https://wa.me/${WA_ADMIN}?text=${encodeURIComponent(teks)}">WhatsApp Admin</a>
      </div>
      <button class="btn garis penuh lk-tutup" type="button" style="margin-top:10px">Tutup</button>`);
    t.querySelector(".lk-salin").addEventListener("click", () => salin(teks).then(() => toast("Mesej disalin")));
    t.querySelector(".lk-tutup").addEventListener("click", () => t.remove());
  }

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
  function salinLama(teks) {
    const a = document.createElement("textarea"); a.value = teks; a.setAttribute("readonly", ""); a.style.position = "fixed"; a.style.opacity = "0";
    document.body.appendChild(a); a.select();
    try { document.execCommand("copy"); } finally { a.remove(); }
  }
  function salin(teks) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(teks).catch(() => salinLama(teks));
    salinLama(teks); return Promise.resolve();
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
           el, esc, namaPendek, toast, salin, telWa, muatTurunCsv, pautMurid, dialogTukarKata, dialogLupaKata };
})();
