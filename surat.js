/* =====================================================================
   PANTAS Petagas — penjana surat amaran (.docx) dalam pelayar
   Templat: amaran_<jenis>_<peringkat>.docx berpenanda {{...}}
   Tanpa perpustakaan luar: baca & tulis fail zip sendiri.
   ===================================================================== */
const SURAT = (() => {
  const BULAN = ["Januari","Februari","Mac","April","Mei","Jun","Julai","Ogos","September","Oktober","November","Disember"];

  // ---------- CRC32 ----------
  const JADUAL = (() => { const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = JADUAL[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  // ---------- baca zip ----------
  async function inflate(u8) {
    const ds = new DecompressionStream("deflate-raw");
    const buf = await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(buf);
  }
  async function bacaZip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error("Fail templat rosak.");
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
    const fail = [];
    for (let i = 0; i < n; i++) {
      const kaedah = dv.getUint16(p + 10, true), saizM = dv.getUint32(p + 20, true);
      const lenN = dv.getUint16(p + 28, true), lenX = dv.getUint16(p + 30, true), lenK = dv.getUint16(p + 32, true);
      const lokal = dv.getUint32(p + 42, true);
      const nama = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + lenN));
      const dMula = lokal + 30 + dv.getUint16(lokal + 26, true) + dv.getUint16(lokal + 28, true);
      let data = u8.subarray(dMula, dMula + saizM);
      if (kaedah === 8) data = await inflate(data);
      else if (kaedah !== 0) throw new Error("Format mampatan templat tidak disokong.");
      fail.push({ nama, data });
      p += 46 + lenN + lenX + lenK;
    }
    return fail;
  }

  // ---------- tulis zip (tanpa mampatan) ----------
  function tulisZip(fail) {
    const enc = new TextEncoder(), bahagian = [], pusat = []; let off = 0;
    for (const f of fail) {
      const nm = enc.encode(f.nama), crc = crc32(f.data), sz = f.data.length;
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, sz, true); h.setUint32(22, sz, true);
      h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
      bahagian.push(new Uint8Array(h.buffer), nm, f.data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true);
      c.setUint32(20, sz, true); c.setUint32(24, sz, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
      pusat.push(new Uint8Array(c.buffer), nm);
      off += 30 + nm.length + sz;
    }
    const saizPusat = pusat.reduce((a, b) => a + b.length, 0);
    const akhir = new DataView(new ArrayBuffer(22));
    akhir.setUint32(0, 0x06054b50, true); akhir.setUint16(8, fail.length, true); akhir.setUint16(10, fail.length, true);
    akhir.setUint32(12, saizPusat, true); akhir.setUint32(16, off, true);
    return new Blob([...bahagian, ...pusat, new Uint8Array(akhir.buffer)],
      { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }

  // ---------- format ----------
  const xml = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  function tarikhPenuh(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    return `${d} ${BULAN[m - 1]} ${y}`;
  }
  function senaraiTarikh(arr) {
    const kump = [];
    for (const t of [...arr].sort()) {
      const [y, m, d] = t.split("-").map(Number), k = `${BULAN[m - 1]} ${y}`;
      const akhir = kump[kump.length - 1];
      if (akhir && akhir.k === k) akhir.h.push(d); else kump.push({ k, h: [d] });
    }
    return kump.map(g => `${g.h.join(", ")} ${g.k}`).join("; ");
  }
  function pecahAlamat(alamat) {
    const b = String(alamat || "").split(",").map(s => s.trim()).filter(Boolean);
    if (b.length <= 1) return [b[0] || "", ""];
    if (b.length === 2) return b;
    return [b.slice(0, b.length - 2).join(", "), b.slice(-2).join(", ")];
  }

  /**
   * d = { jenis, peringkat, no_siri, tarikh_surat, tarikh_tidak_hadir[],
   *       murid:{nama,no_kp,alamat,kelas}, penjaga:"NAMA" | null,
   *       terdahulu:[{peringkat,no_siri,tarikh_surat}] }
   */
  async function jana(d, laluanTemplat = "") {
    const fn = `${laluanTemplat}amaran_${d.jenis.toLowerCase()}_${d.peringkat}.docx`;
    const r = await fetch(fn);
    if (!r.ok) throw new Error("Templat surat tidak dijumpai: " + fn);
    const fail = await bacaZip(await r.arrayBuffer());
    const tarikh = [...d.tarikh_tidak_hadir].sort();
    const [al2, al3] = pecahAlamat(d.murid.alamat);
    const p1 = (d.terdahulu || []).find(x => x.peringkat === 1), p2 = (d.terdahulu || []).find(x => x.peringkat === 2);
    const nilai = {
      SIRI: d.no_siri, TARIKH_SURAT: tarikhPenuh(d.tarikh_surat),
      ALAMAT1: d.penjaga ? d.penjaga : `IBU BAPA/PENJAGA KEPADA ${d.murid.nama}`, ALAMAT2: al2, ALAMAT3: al3,
      NAMA: d.murid.nama, NO_KP: d.murid.no_kp || "", KELAS: d.murid.kelas || "",
      TARIKH_MULA: tarikhPenuh(tarikh[0]), TARIKH_AKHIR: tarikhPenuh(tarikh[tarikh.length - 1]),
      TARIKH_SENARAI: senaraiTarikh(tarikh),
      SIRI1: p1 ? p1.no_siri : "    ", TARIKH1: p1 ? tarikhPenuh(p1.tarikh_surat) : "………………",
      SIRI2: p2 ? p2.no_siri : "    ", TARIKH2: p2 ? tarikhPenuh(p2.tarikh_surat) : "………………",
    };
    const doc = fail.find(f => f.nama === "word/document.xml");
    let s = new TextDecoder().decode(doc.data);
    s = s.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, k) => (k in nilai ? xml(nilai[k]) : m));
    doc.data = new TextEncoder().encode(s);
    return tulisZip(fail);
  }

  function namaFail(d) {
    const per = d.peringkat === 3 ? "Terakhir" : d.peringkat;
    const n = String(d.murid.nama).replace(/\s+(BIN|BINTI|BT|A\/L|A\/P)\s.*$/i, "").replace(/[^A-Za-z0-9]+/g, "_");
    return `Amaran${per}_${d.jenis === "BERKALA" ? "Berkala" : "Berterusan"}_${n}_${d.tarikh_surat}.docx`;
  }

  function muatTurun(blob, nama) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nama;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  return { jana, namaFail, muatTurun, tarikhPenuh, senaraiTarikh, _bacaZip: bacaZip, _tulisZip: tulisZip };
})();
