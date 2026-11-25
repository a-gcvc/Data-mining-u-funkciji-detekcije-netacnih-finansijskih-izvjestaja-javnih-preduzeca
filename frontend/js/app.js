/* ==========================================================
   Finora: logika stranice
   1 Postavke · 2 Pomoćne funkcije · 3 Brojevi · 4 Primjeri ·
   5 Pregledi · 6 Obrazac · 7 Rezultati · 8 CSV · 9 Pokretanje
   ========================================================== */
/* 1. Postavke */
const API = location.protocol === "file:" ? "http://127.0.0.1:8000" : "";
let INFO,
  CSVROWS = [];
const charts = {};
const ICONS = {
  "Bilans uspjeha": "fa-file-invoice-dollar",
  "Bilans stanja: imovina": "fa-building-columns",
  "Bilans stanja: obaveze": "fa-scale-balanced",
  "Tok gotovine": "fa-money-bill-transfer",
};
const CYCLE = {
  unos: "Unosite bilansne pozicije za tekuću i prethodnu godinu u KM: prihode, rashode, imovinu, obaveze i novčani tok. Možete unijeti jedno preduzeće ili učitati CSV.",
  omjeri:
    "Iz unesenih pozicija izračunava se 19 finansijskih omjera: zaduženost, likvidnost, marža, potraživanja u odnosu na prihode, rast prihoda i imovine i drugi.",
  // "{N}" se zamjenjuje stvarnim brojem izvještaja iz /api/info u init() - ne hardkodirati broj ovdje
  model:
    "Logistička regresija na 19 finansijskih omjera, naučena na {N} izvještaja javnih preduzeća s pozitivnim ili negativnim mišljenjem, određuje rizik negativnog mišljenja. Vrednovana je grupnom unakrsnom validacijom i vremenskim testom.",
  procjena:
    "Rezultat je pozitivna ili negativna procjena, uz percentil rizika u odnosu na uzorak i tačnost te procjene u prošlosti. To je pomoć pri planiranju revizije, a ne dokaz prevare.",
};
// kratka, laička objašnjenja ključnih omjera (prikazuju se kao tooltip uz naziv omjera u rezultatima)
const OMJER_OPISI = {
  zaduzenost_t: "Udio ukupnih obaveza (kratkoročnih i dugoročnih) u ukupnoj imovini. Veća vrijednost znači veću zaduženost.",
  kratk_obaveze_udio_t: "Udio kratkoročnih (dospijevaju do godinu dana) obaveza u ukupnoj imovini.",
  likvidnost_t: "Obrtna imovina u odnosu na kratkoročne obaveze. Veća vrijednost znači lakše pokrivanje tekućih obaveza.",
  marza_t: "Udio razlike prihoda i poslovnih rashoda u prihodu od prodaje (poslovna marža).",
  potraz_prihod_t: "Potraživanja od kupaca u odnosu na prihod od prodaje. Veća vrijednost može ukazivati na sporiju naplatu.",
  rast_prihoda: "Promjena prihoda od prodaje u odnosu na prethodnu godinu.",
  obrtna_udio: "Udio obrtne imovine u ukupnoj imovini preduzeća.",
};

/* 2. Pomoćne funkcije */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
const fmt = (v) => (v === null ? "–" : Number(v).toLocaleString("bs-BA", { maximumFractionDigits: 2 }));
async function post(url, body, isForm) {
  const r = await fetch(API + url, {
    method: "POST",
    headers: isForm ? {} : { "Content-Type": "application/json" },
    body,
  });
  const d = await r.json();
  if (!r.ok)
    throw new Error(
      typeof d.detail === "string" ? d.detail : "Provjerite unos: sva polja moraju biti brojevi.",
    );
  return d;
}
const loading = (on) => ($("#loading").hidden = !on);

/* 3. Parsiranje brojeva */
function parseBroj(s) {
  // prihvata 2500000, 2.500.000, 2,500,000, -1.200.000, 2.500.000,50
  s = s
    .trim()
    .replace(/[\s'’]/g, "")
    .replace("−", "-");
  if (s === "") return null;
  if (!/^[-+]?[\d.,]+$/.test(s)) return NaN;
  const d = s.lastIndexOf("."),
    c = s.lastIndexOf(",");
  let t;
  if (d >= 0 && c >= 0) {
    const dec = d > c ? "." : ",",
      th = dec === "." ? "," : ".";
    t = s.split(th).join("").replace(dec, ".");
  } else if (d >= 0 || c >= 0) {
    const sep = d >= 0 ? "." : ",",
      parts = s.replace(/^[-+]/, "").split(sep);
    if (parts.length > 2) {
      if (!parts.slice(1).every((x) => x.length === 3)) return NaN;
      t = s.split(sep).join("");
    } else if (/^\d{1,3}$/.test(parts[0]) && parts[1].length === 3) t = s.split(sep).join("");
    else t = s.replace(sep, ".");
  } else t = s;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/* 4. Primjeri (izmišljene vrijednosti, u KM) */
const EXAMPLES = {
  A: {
    prihod_prodaja_t: 30000000,
    prihod_prodaja_t1: 28500000,
    poslovni_rashodi_t: 28500000,
    poslovni_rashodi_t1: 27800000,
    poslovna_imovina_t: 50000000,
    poslovna_imovina_t1: 48000000,
    obrtna_imovina_t: 15000000,
    obrtna_imovina_t1: 14000000,
    nekretnine_oprema_t: 30000000,
    nekretnine_oprema_t1: 29500000,
    potrazivanja_kupci_t: 4000000,
    potrazivanja_kupci_t1: 3800000,
    kratk_fin_plasmani_t: 1000000,
    kratk_obaveze_t: 6000000,
    kratk_obaveze_t1: 5800000,
    dugor_obaveze_t: 8000000,
    dugor_obaveze_t1: 8500000,
    novcani_tok_poslovni_t: 2500000,
  },
  B: {
    prihod_prodaja_t: 12000000,
    prihod_prodaja_t1: 14000000,
    poslovni_rashodi_t: 15500000,
    poslovni_rashodi_t1: 14500000,
    poslovna_imovina_t: 40000000,
    poslovna_imovina_t1: 42000000,
    obrtna_imovina_t: 4000000,
    obrtna_imovina_t1: 6000000,
    nekretnine_oprema_t: 30000000,
    nekretnine_oprema_t1: 32000000,
    potrazivanja_kupci_t: 5000000,
    potrazivanja_kupci_t1: 2500000,
    kratk_fin_plasmani_t: 0,
    kratk_obaveze_t: 25000000,
    kratk_obaveze_t1: 18000000,
    dugor_obaveze_t: 10000000,
    dugor_obaveze_t1: 12000000,
    novcani_tok_poslovni_t: -1200000,
  },
};

function fillExample(key) {
  $$("#polja input").forEach((i) => {
    const v = EXAMPLES[key][i.name];
    i.value = v === undefined ? "" : v.toLocaleString("de-DE");
    i.parentElement.classList.remove("error");
  });
  $$("#polja .error-message").forEach((e) => (e.textContent = ""));
  $("#greska").textContent = "";
}

/* 5. Pregledi */
function show(view) {
  for (const v of ["hero", "how", "app"]) $("#" + v).hidden = v !== view;
  $("#topbar").hidden = view === "hero";
  $$(".stepper .step").forEach((s) => s.classList.toggle("active", s.dataset.go === view));
  window.scrollTo(0, 0);
}
$$("[data-go]").forEach((b) => (b.onclick = () => show(b.dataset.go)));
$("#start").onclick = () => show("app");
$("#howbtn").onclick = () => show("how");
$$(".cycle-step").forEach((s) => {
  s.onclick = () => {
    $$(".cycle-step").forEach((x) => x.classList.remove("active"));
    s.classList.add("active");
    $("#cycle-desc").textContent = CYCLE[s.dataset.step];
  };
});
function switchTab(n) {
  for (const k of [1, 2]) {
    $("#p" + k).hidden = k !== n;
    $("#tb" + k).setAttribute("aria-selected", k === n);
  }
  $("#results").hidden = true;
}
$("#tb1").onclick = () => switchTab(1);
$("#tb2").onclick = () => switchTab(2);
$("#primjerA").onclick = () => fillExample("A");
$("#primjerB").onclick = () => fillExample("B");
$("#novo").onclick = () => {
  $("#results").hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
};

/* 6. Obrazac */
function field(name, p, isCurrent) {
  const wrap = el("div", "half");
  wrap.append(
    el(
      "small",
      "",
      p.t1 ? (isCurrent ? "Tekuća godina (t)" : "Prethodna godina (t-1)") : "Tekuća godina (t)",
    ),
  );
  const input = el("input");
  Object.assign(input, {
    type: "text",
    inputMode: "decimal",
    autocomplete: "off",
    placeholder: "npr. 2.500.000",
    maxLength: 24, // dovoljno za iznose do biliona KM sa separatorima; sprečava apsurdno dug unos
    name,
  });
  input.dataset.oznaka = p.naziv + (isCurrent ? " (t)" : " (t-1)");
  const err = el("span", "error-message");
  err.id = "err-" + name;
  // validacija odmah pri napuštanju polja (ne čekati slanje forme) - slova/simboli se
  // odmah prijave, a ispravni brojevi se preformatiraju u grupisani prikaz (npr. 2.500.000)
  input.addEventListener("blur", () => {
    if (input.value.trim() === "") {
      err.textContent = "";
      wrap.classList.remove("error");
      return;
    }
    const n = parseBroj(input.value);
    const bad = Number.isNaN(n);
    err.textContent = bad ? "Neispravan broj, npr. 2.500.000 ili -1200000" : "";
    wrap.classList.toggle("error", bad);
    if (!bad && n !== null) input.value = n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
  });
  wrap.append(input, err);
  return wrap;
}
function buildForm() {
  const groups = {};
  for (const p of INFO.pozicije) (groups[p.grupa] ||= []).push(p);
  for (const [name, items] of Object.entries(groups)) {
    // <details>/<summary> umjesto diva: sekcije se mogu sklopiti (korisno na mobitelu), a
    // na desktopu su po default-u otvorene (open), pa se ponašanje ne mijenja za postojeće korisnike.
    const section = el("details", "form-section");
    section.open = true;
    const summary = el("summary");
    summary.append(
      el("i", "fas " + (ICONS[name] || "fa-table")),
      el("span", "", name),
      el("i", "fas fa-chevron-down chevron"),
    );
    section.append(summary);
    const body = el("div", "form-section-body");
    for (const p of items) {
      const group = el("div", "input-group");
      group.append(el("label", "", p.naziv));
      const row = el("div", "input-row");
      row.append(field(p.t, p, true));
      if (p.t1) row.append(field(p.t1, p, false));
      group.append(row);
      body.append(group);
    }
    section.append(body);
    $("#polja").append(section);
  }
}
$("#forma").addEventListener("reset", () => {
  $$("#polja .error-message").forEach((e) => (e.textContent = ""));
  $$("#polja .half").forEach((g) => g.classList.remove("error"));
  $("#greska").textContent = "";
  $("#results").hidden = true;
});
$("#forma").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("#greska").textContent = "";
  const values = {};
  let first = null;
  $$("#polja input").forEach((input) => {
    const n = parseBroj(input.value);
    const bad = Number.isNaN(n);
    const err = $("#err-" + input.name);
    err.textContent = bad ? "Neispravan broj, npr. 2.500.000 ili -1200000" : "";
    input.parentElement.classList.toggle("error", bad); // .half - direktni roditelj input-a
    if (bad && !first) first = input;
    values[input.name] = bad ? null : n;
  });
  if (first) {
    first.focus();
    return;
  }
  loading(true);
  try {
    showResult(await post("/api/predict", JSON.stringify({ vrijednosti: values })));
  } catch (error) {
    $("#greska").textContent = error.message;
  } finally {
    loading(false);
  }
});

/* 7. Rezultati */
function donut(id, data, colors, labels) {
  if (typeof Chart === "undefined") return;
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart($("#" + id), {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: { cutout: "72%", plugins: { legend: { display: false } } },
  });
}
function gauges(list) {
  const host = $("#gauges");
  host.replaceChildren();
  for (const o of list) {
    const vals = [o.vrijednost, o.medijan_uzorak, o.medijan_povisen].filter((v) => v !== null);
    const lo = Math.min(...vals),
      hi = Math.max(...vals),
      span = hi - lo || 1;
    const pos = (v) => (v === null ? null : 4 + ((v - lo) / span) * 92);
    const g = el("div", "gauge");
    const head = el("div", "g-head");
    const nazivWrap = el("span", "g-naziv");
    const infoIco = el("i", "fas fa-circle-info info-ico");
    if (OMJER_OPISI[o.omjer]) infoIco.title = OMJER_OPISI[o.omjer];
    infoIco.tabIndex = 0;
    nazivWrap.append(el("span", "", o.naziv), infoIco);
    head.append(nazivWrap, el("b", "", fmt(o.vrijednost)));
    const track = el("div", "g-track");
    for (const [cls, v] of [
      ["hi", o.medijan_povisen],
      ["med", o.medijan_uzorak],
      ["firm", o.vrijednost],
    ]) {
      if (v === null) continue;
      const m = el("i", "m " + cls);
      m.style.left = pos(v) + "%";
      m.title = fmt(v);
      track.append(m);
    }
    // medijani su uvijek vidljivi ispod trake (ne samo na hover, bitno za dodir na mobitelu)
    const foot = el("div", "g-foot");
    foot.append(
      el("span", "", `Medijan uzorka: ${fmt(o.medijan_uzorak)}`),
      el("span", "", `Povišen rizik: ${fmt(o.medijan_povisen)}`),
    );
    g.append(head, track, foot);
    host.append(g);
  }
}
// napomena koja se prikazuje uz svaki rezultat: model nije učio na mišljenju s rezervom/suzdržavanjem,
// pa je procjena manje pouzdana baš za takve (granične) slučajeve - ključno ograničenje striktne definicije.
const NAPOMENA_GRANICNI_SLUCAJEVI =
  "Model je treniran da razdvoji preduzeća s pozitivnim od preduzeća s negativnim mišljenjem. Za preduzeća " +
  "čija bi stvarna situacija bila bliža mišljenju s rezervom ili suzdržavanju od mišljenja, procjena je " +
  "znatno manje pouzdana.";

function showResult(d) {
  const bad = d.procjena === "negativno";
  const share = Math.round(d.pouzdanost * 100);
  const color = bad ? "#d8573f" : "#2b9a72";
  $("#results").hidden = false;
  $("#riskcard").className = "risk-card " + (bad ? "bad" : "ok");
  $("#risk-icon").className = "fas " + (bad ? "fa-triangle-exclamation" : "fa-circle-check");
  $("#risk-text").textContent = bad ? "Vjerovatnije NEGATIVNO mišljenje" : "Vjerovatnije POZITIVNO mišljenje";
  $("#risk-reco").textContent =
    (bad
      ? "Preduzeće je kandidat za veći prioritet pri planiranju revizije; to nije dokaz prevare, niti zamjena za rad revizora."
      : "To ne znači da nema problema, niti da revizija nije potrebna.") +
    " " +
    NAPOMENA_GRANICNI_SLUCAJEVI;
  // Krug 1: gdje je ovo preduzeće u odnosu na ostale izvještaje po riziku (plain-jezik prije grafikona)
  $("#lead-pct").textContent =
    `Rizik ovog preduzeća je viši nego kod ${d.percentil}% izvještaja u uzorku ` +
    `(kategorija rizika: "${d.kategorija_rizika}").`;
  donut("chartPct", [d.percentil, 100 - d.percentil], [color, "#efebe0"], ["Rizik viši od", "Ostatak uzorka"]);
  $("#center-pct").innerHTML = `${d.percentil}<small>percentil</small>`;
  // Krug 2: koliko je OVA kategorija (ne ovo preduzeće pojedinačno) bila tačna ranije, iz historijskih podataka
  $("#lead-rel").textContent =
    `Od ranijih izvještaja u istoj kategoriji rizika, procjena se pokazala tačnom u ${share} od 100 slučajeva ` +
    `(nije vjerovatnoća za ovo konkretno preduzeće, nego iskustvo iz uzorka na kojem je model razvijen).`;
  donut("chartRel", [share, 100 - share], [color, "#cfeee3"], ["Tačno u prošlosti", "Netačno u prošlosti"]);
  $("#center-rel").innerHTML = `${share}/100<small>ranije tačno</small>`;
  gauges(d.usporedba_omjera);
  $("#warns").replaceChildren(...d.upozorenja.map((w) => el("div", "warn", w)));
  $("#results").scrollIntoView({ behavior: "smooth" });
}

/* 8. Više preduzeća (CSV) */
$("#posalji").onclick = async () => {
  $("#greska2").textContent = "";
  const file = $("#datoteka").files[0];
  if (!file) {
    $("#greska2").textContent = "Odaberite CSV datoteku.";
    return;
  }
  const fd = new FormData();
  fd.append("datoteka", file);
  loading(true);
  try {
    CSVROWS = (await post("/api/predict-csv", fd, true)).redovi;
  } catch (error) {
    $("#greska2").textContent = error.message;
    return;
  } finally {
    loading(false);
  }
  const table = el("table");
  table.innerHTML =
    "<thead><tr><th>Rang</th><th>ID</th><th>Procjena</th><th>Kategorija</th><th>Percentil</th><th>Upozorenja</th></tr></thead>";
  const body = el("tbody");
  for (const r of CSVROWS) {
    const tr = el("tr");
    for (const t of [
      r.rang,
      r.id,
      r.procjena === "negativno" ? "Negativno" : "Pozitivno",
      r.kategorija_rizika,
      r.percentil,
      r.upozorenja.join(" "),
    ])
      tr.append(el("td", "", t));
    body.append(tr);
  }
  table.append(body);
  $("#tabela").replaceChildren(table);
  $("#preuzmi").hidden = false;
};
$("#preuzmi").onclick = () => {
  const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  const lines = [
    "rang,id,procjena,kategorija_rizika,percentil,upozorenja",
    ...CSVROWS.map((r) =>
      [r.rang, q(r.id), r.procjena, r.kategorija_rizika, r.percentil, q(r.upozorenja.join(" "))].join(","),
    ),
  ];
  const a = el("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv" }));
  a.download = "rangiranje_rizika.csv";
  a.click();
};

/* 9. Pokretanje */
async function init() {
  try {
    INFO = await (await fetch(API + "/api/info")).json();
  } catch (e) {
    $("#greska").textContent = "Backend nije dostupan. Pokrenite: uvicorn main:app --reload";
    return;
  }
  buildForm();
  const m = INFO.model;
  $("#auc").textContent = m.cv_auc.toFixed(2).replace(".", ",");
  $("#chip-izvjestaji").textContent = m.n_izvjestaja;
  $("#chip-preduzeca").textContent = m.n_preduzeca;
  $("#chip-godine").textContent = `${m.godine[0]}–${m.godine[1]}`;
  // NAPOMENA: skraćeni, interni naziv modela (m.naziv, npr. "LR | S6 omjeri") se namjerno NE prikazuje
  // korisniku nigdje na stranici - puni, razumljiv naziv ("logistička regresija na 19 finansijskih
  // omjera") naveden je u panelu "O projektu".
  CYCLE.model = CYCLE.model.replace("{N}", m.n_izvjestaja);
}
init();