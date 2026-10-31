// Quiz Defteri — uygulama mantığı.
// Hangi sayfanın çizileceğine adres çubuğundaki "#"'den sonraki kısım karar verir
// (hash routing): "#/" İçindekiler, "#/quiz/yeni-3" Yeni Quiz 3, "#/exam" deneme gibi.
// Soru çözme ve deneme, sayfaları çevrilen bir kitapta (StPageFlip) gösterilir;
// İçindekiler, deneme ayarları ve sonuç tek bir defter sayfasıdır.

const DATA = window.QUIZ_DATA;
const app = document.getElementById("app");
const LETTERS = "abcd";

// ===== Veriye hızlı erişim =====
// "eski-4" -> quiz, "eski-4-12" -> soru; her soru kendi quizini, her quiz kendi kaynağını bilir
const quizById = {};
const questionById = {};
for (const source of DATA.sources) {
  for (const quiz of source.quizzes) {
    quiz.source = source;
    quizById[quiz.id] = quiz;
    for (const q of quiz.questions) {
      q.quiz = quiz;
      questionById[q.id] = q;
    }
  }
}
const allQuizzes = DATA.sources.flatMap((s) => s.quizzes);
const idsOf = (quizzes) => quizzes.flatMap((quiz) => quiz.questions.map((q) => q.id));

// ===== Kayıt (localStorage) =====
// answers: her sorunun son sonucu, pos: her listede kalınan soru, order: karıştırılmış
// listelerin sırası, exam: süren ya da biten son deneme, marked: köşesi kıvrılan sorular
const STORE_KEY = "quiz-defteri";
const store = loadStore();

function loadStore() {
  const empty = { answers: {}, pos: {}, order: {}, exam: null, marked: {} };
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(STORE_KEY)) };
  } catch (e) {
    return empty;
  }
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
}

function record(qid, correct) {
  store.answers[qid] = { correct };
  save();
}

const wrongIds = () =>
  Object.keys(store.answers).filter((id) => questionById[id] && !store.answers[id].correct);
const markedIds = () => Object.keys(store.marked).filter((id) => questionById[id]);

// ===== Yardımcılar =====

// Soru metinleri HTML'e yazılmadan önce < > & " karakterleri zararsız hale getirilir
function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Fisher–Yates karıştırma: her sıralama eşit olasılıkla çıkar
function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const shortSource = (quiz) => quiz.source.title.split(" ")[0]; // "Yeni Quizler" -> "Yeni"

// ===== Fosforlu kalem rengi (tarayıcıda hatırlanır) =====

const PENS = {
  sarı: ["rgba(250, 214, 60, 0.55)", "rgba(235, 190, 30, 0.6)"],
  yeşil: ["rgba(140, 220, 110, 0.5)", "rgba(100, 190, 80, 0.55)"],
  pembe: ["rgba(245, 130, 175, 0.45)", "rgba(230, 95, 150, 0.5)"],
  turuncu: ["rgba(250, 165, 70, 0.5)", "rgba(235, 135, 40, 0.55)"],
  mavi: ["rgba(110, 185, 240, 0.45)", "rgba(70, 155, 225, 0.5)"],
};

const pensEl = document.getElementById("pens");
pensEl.innerHTML = Object.entries(PENS).map(([name, [color]]) =>
  `<button type="button" class="pen-swatch" data-pen="${name}" title="${name} kalem"
     style="--c:${color.replace(/[\d.]+\)$/, "1)")}"></button>`).join("");

function setPen(name) {
  const root = document.documentElement.style;
  root.setProperty("--hl", PENS[name][0]);
  root.setProperty("--hl-edge", PENS[name][1]);
  pensEl.querySelectorAll(".pen-swatch").forEach((b) => b.classList.toggle("on", b.dataset.pen === name));
  try { localStorage.setItem("pen", name); } catch (e) {}
}

pensEl.addEventListener("click", (e) => {
  const swatch = e.target.closest("[data-pen]");
  if (swatch) setPen(swatch.dataset.pen);
});

try {
  const saved = localStorage.getItem("pen");
  setPen(saved in PENS ? saved : "sarı");
} catch (e) {
  setPen("sarı");
}

// ===== Soru görünümü (çalışma, deneme ve sonuç ekranı ortak kullanır) =====
// o.selected: işaretlenen şık, o.drawing: kalemi yeni çekilen şık (animasyon bir kez oynar),
// o.revealed: cevap gösterildi mi, o.action: şıkka tıklanınca çalışacak işlem, o.i: sayfa numarası
function questionHtml(q, o) {
  const tag = { mc: "Çoktan seçmeli", tf: "Doğru / yanlış", open: "Açık uçlu" }[q.type];
  let html = `<p class="q-meta">${tag} · ${shortSource(q.quiz)} quiz ${q.quiz.no}, soru ${q.no}</p>`;
  if (o.past) html += `<p class="past">Bu soruyu daha önce ${o.past.correct ? "doğru" : "yanlış"} yapmıştın.</p>`;
  html += `<p class="q-text">${esc(q.text)}</p>`;

  if (q.type === "open") {
    if (o.revealed) html += `<p class="label-sc">Örnek cevap</p><p class="explanation">${esc(q.explanation)}</p>`;
  } else {
    html += `<ol class="options">${q.options.map((text, k) => {
      const cls = [
        k === o.selected && "chosen",
        k === o.drawing && "draw",
        o.revealed && k === q.answer && "correct",
        o.revealed && k === o.selected && o.selected !== q.answer && "wrong",
      ].filter(Boolean).join(" ");
      return `
        <li><button type="button" class="option ${cls}" data-action="${o.action}" data-i="${o.i}" data-k="${k}" ${o.revealed ? "disabled" : ""}>
          ${q.type === "mc" ? `<span class="letter">${LETTERS[k]})</span>` : ""}
          <span class="option-text"><span class="ink">${esc(text)}</span></span>
        </button></li>`;
    }).join("")}</ol>`;
    if (o.revealed) html += feedbackHtml(q, o.selected);
  }

  if (o.revealed && q.uncertain) {
    html += `<p class="uncertain">⚠ Bu cevap kesin değil, notlarından kontrol et.${
      q.uncertainNote ? ` <em>${esc(q.uncertainNote)}</em>` : ""}</p>`;
  }
  return html;
}

function feedbackHtml(q, choice) {
  const right = q.type === "mc" ? `${LETTERS[q.answer]}) ${q.options[q.answer]}` : q.options[q.answer];
  let html;
  if (choice == null) html = `<p class="feedback bad">Boş bıraktın. Doğru cevap: ${esc(right)}</p>`;
  else if (choice === q.answer) html = `<p class="feedback ok">Doğru.</p>`;
  else html = `<p class="feedback bad">Yanlış. Doğru cevap: ${esc(right)}</p>`;
  if (q.explanation) html += `<p class="explanation">${esc(q.explanation)}</p>`;
  return html;
}

// ===== Kitap (StPageFlip) =====
// Kitapta her soru bir sayfa. "Tüm sorular" 752 sayfa olduğu için sayfaların içi
// sadece açık sayfanın yakınındayken doldurulur (lazy rendering).

let book = null;

// Sayfa ölçüsü ekrana göre: genişlik en fazla 700px, yükseklik çizgi aralığının tam katı
function pageSize() {
  const w = Math.min(700, window.innerWidth - 24);
  const rows = Math.floor((window.innerHeight - 170) / 28);
  const maxRows = Math.floor((w * (window.innerWidth < 600 ? 2 : 1.45)) / 28);
  return { w, h: Math.max(18, Math.min(rows, maxRows)) * 28 };
}

function mountBook(shell, { count, start, render, onFlip }) {
  const { w, h } = pageSize();
  shell.style.width = w + "px";
  shell.style.height = h + "px";
  shell.innerHTML = `<div class="book">${Array.from({ length: count }, (_, i) =>
    `<div class="page paper" data-i="${i}" style="width:${w}px;height:${h}px"></div>`).join("")}</div>`;
  const pages = [...shell.querySelectorAll(".page")];
  book = { shell, pages, count, render, onFlip, w, h, rendered: new Set(), dir: 1 };
  ensurePages(start);

  const flip = new St.PageFlip(shell.firstElementChild, {
    width: w, height: h, size: "fixed", usePortrait: true, showCover: false,
    flippingTime: 900, maxShadowOpacity: 0.6, drawShadow: true,
    showPageCorners: false, useMouseEvents: false, startPage: start,
  });
  book.flip = flip;
  flip.loadFromHTML(pages);
  flip.on("flip", (e) => {
    // yıkılmış kitabın geç gelen olayını yok say (book artık başka bir örnek olabilir)
    if (!book || e.object !== book.flip || flip !== book.flip) return;
    ensurePages(e.data);
    onFlip(e.data);
  });

  // İleri çevrilen sayfanın arka yüzü için kütüphane sayfanın kopyasını ekler;
  // kopyadaki yazıları gizle ki arkada aynalı yazı görünmesin
  const originals = new Set(pages);
  book.observer = new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => {
    if (n.classList?.contains("page") && !originals.has(n) && book?.dir > 0) n.classList.add("page-back");
  })));
  book.observer.observe(shell, { childList: true, subtree: true });

  bindTurnGestures(shell);
}

function unmountBook() {
  if (!book) return;
  book.observer.disconnect();
  const old = book;
  book = null; // önce null: animasyon biterken gelen "flip" olayı yok sayılır (eski sırayı kayda yazmasın)
  // çalışan çevirme animasyonunu bitir ki yarım kalıp sonradan tetiklenmesin
  try { old.flip.getRender().finishAnimation(); } catch (e) {}
  try { old.flip.destroy(); } catch (e) {}
}

function ensurePages(i) {
  for (let k = i - 1; k <= i + 2; k++) {
    if (k >= 0 && k < book.count && !book.rendered.has(k)) renderPage(k);
  }
}

function renderPage(k) {
  const page = book.pages[k];
  page.innerHTML = book.render(k);
  book.rendered.add(k);
  fit(page);
  // kütüphane sayfanın stilini her çizimde baştan yazıyor; açık sayfayı hemen yeniden çizdir
  if (book.flip && k === currentPage()) book.flip.update();
}

const currentPage = () => book.flip.getCurrentPageIndex();

function turn(dir) {
  if (!book) return;
  book.dir = dir;
  dir > 0 ? book.flip.flipNext("bottom") : book.flip.flipPrev("bottom");
}

function goToPage(n) {
  if (!book) return;
  // animasyon sürerken turnToPage çakışır; önce çevirmeyi bitir
  if (book.flip.getState() !== "read") book.flip.getRender().finishAnimation();
  ensurePages(n);
  book.flip.turnToPage(n);
  book.onFlip(n);
}

// Sayfa yeniden çizilince eski şık butonu DOM'dan gider; odağı aynı şıkka geri ver
function refocusOption(btn) {
  book.pages[Number(btn.dataset.i)].querySelector(`.option[data-k="${btn.dataset.k}"]`)?.focus({ preventScroll: true });
}

// Sayfaya sığmayan içerikte yazıyı adım adım küçült (satır yüksekliği sabit kalır, çizgiler bozulmaz).
// Ölçüm ekran dışındaki görünmez bir kopya sayfada yapılır; kitap sayfaları her an görünür değildir.
function fit(page) {
  const probe = document.getElementById("probe");
  probe.style.width = book.w + "px";
  probe.style.height = book.h + "px";
  probe.innerHTML = page.innerHTML;
  const inner = probe.querySelector(".page-inner");
  let chosen = 15;
  for (const size of [19, 18, 17, 16, 15]) {
    probe.style.setProperty("--fs", size + "px");
    if (inner.scrollHeight <= inner.clientHeight) {
      chosen = size;
      break;
    }
  }
  // --fs iç kutuya yazılır: kütüphane sayfanın kendi style'ını her çizimde siler
  page.querySelector(".page-inner").style.setProperty("--fs", chosen + "px");
  drawMarks(probe, page);
  // en küçük yazıyla da sığmıyorsa (telefonda çok uzun cevaplar) sayfanın içi kaydırılır
  page.classList.toggle("overflow", inner.scrollHeight > inner.clientHeight);
}

// Fosforlu kalem şeritleri: işaretli şıkkın her satırı ölçülür (görünmez kopya sayfada),
// gerçek sayfaya hafif eğik, düzensiz uçlu bir şerit eklenir. Animasyon transform ile yapılır.
function drawMarks(probe, page) {
  const probeOpts = probe.querySelectorAll(".option");
  const realOpts = page.querySelectorAll(".option");
  probeOpts.forEach((opt, j) => {
    if (!opt.classList.contains("chosen")) return;
    const box = opt.querySelector(".option-text").getBoundingClientRect();
    const rects = [...opt.querySelector(".ink").getClientRects()];
    const seed = [...realOpts[j].dataset.i + realOpts[j].dataset.k].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
    const rnd = (n) => ((Math.sin(seed + n) * 10000) % 1 + 1) % 1; // aynı şık hep aynı şekilde çizilsin
    const draw = realOpts[j].classList.contains("draw");
    realOpts[j].querySelector(".option-text").insertAdjacentHTML("afterbegin", rects.map((r, n) => `
      <span class="mark ${draw ? "draw" : ""}" style="
        left:${r.left - box.left - 4 + rnd(n) * 3}px; top:${r.top - box.top + r.height / 2 - 9 + rnd(n + 9) * 2}px;
        width:${r.width + 6 + rnd(n + 3) * 6}px; --r:${(rnd(n + 5) - 0.5) * 1.6}deg; transform:rotate(var(--r));
        animation-delay:${n * 0.3}s"></span>`).join(""));
  });
}

// Sayfanın sağ %30'una dokununca ileri, sol %30'una dokununca geri; telefonda yatay kaydırma
function bindTurnGestures(el) {
  const zone = (e) => {
    if (e.target.closest("button, a, select, input")) return 0;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    return x > 0.7 ? 1 : x < 0.3 ? -1 : 0;
  };
  el.addEventListener("click", (e) => {
    const z = zone(e);
    if (z) turn(z);
  });
  el.addEventListener("mousemove", (e) => { el.style.cursor = zone(e) ? "pointer" : ""; });

  let start = null;
  el.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    start = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  el.addEventListener("touchend", (e) => {
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(dx < 0 ? 1 : -1);
  });
}

// ===== İçindekiler =====

// İçindekiler'de yarım denemenin durumu; süresi dolmuşsa burada kapatılır
function unfinishedExamHtml() {
  const ex = store.exam;
  if (!ex || ex.finishedAt) return "";
  if (!examValid(ex)) {
    store.exam = null;
    save();
    return "";
  }
  const left = ex.duration ? ex.duration - Math.floor((Date.now() - ex.startedAt) / 1000) : null;
  if (left != null && left <= 0) {
    closeExam(true);
    return "";
  }
  const answered = Object.keys(ex.choices).length;
  return `<p>Yarım deneme: ${answered}/${ex.ids.length} cevaplandı${left != null ? ` · ${formatTime(left)} kaldı` : ""}
    → <a href="#/exam/run">Devam et</a></p>`;
}

function renderHome() {
  const examLine = unfinishedExamHtml();
  const solved = Object.keys(store.answers).length;
  const sections = DATA.sources.map((source) => `
    <h2 class="title">${esc(source.title)}</h2>
    <ol class="toc">
      ${source.quizzes.map((quiz) => {
        const done = quiz.questions.filter((q) => store.answers[q.id]).length;
        const n = quiz.questions.length;
        return `
        <li>
          <a href="#/quiz/${quiz.id}">
            <span class="toc-no">${quiz.no}.</span>
            <span class="toc-title">${esc(quiz.title)}</span>
            <span class="toc-dots"></span>
            <span class="toc-count">${done ? `${done} / ${n}` : `${n} soru`}</span>
          </a>
        </li>`;
      }).join("")}
    </ol>
    <p><a class="mix-link" href="#/mix/${source.id}">Bu quizlerin hepsinden karışık →</a></p>`).join(`<p class="ornament" aria-hidden="true">❦</p>`);

  const showCover = !sessionGet("coverOpened");
  app.innerHTML = `
    <section class="view" style="max-width:784px">
      <div class="${showCover ? "cover-scene" : ""}" style="width:100%">
        <div class="sheet paper stack" ${showCover ? "inert" : ""}>
          <h1 class="title">İçindekiler</h1>
          <p class="muted">${idsOf(allQuizzes).length} soru, ${DATA.sources.length} defter.
            ${solved ? `Şimdiye kadar ${solved} tanesini çözdün.` : "Bir bölüm seçerek başla."}</p>
          ${examLine}
          <p>
            <a href="#/exam">Deneme sınavı</a><span class="home-links"><span>·</span></span>
            <a href="#/wrong">Yanlışlarım (${wrongIds().length})</a><span class="home-links"><span>·</span></span>
            <a href="#/marked">İşaretlediklerim (${markedIds().length})</a><span class="home-links"><span>·</span></span>
            <a href="#/mix/all">Tüm sorulardan karışık</a>
          </p>
          ${sections}
          ${solved ? `<p class="gap"><button class="link-button" data-action="reset-progress">İlerlemeyi sıfırla</button></p>` : ""}
        </div>
        ${showCover ? `
          <div class="cover" data-action="open-cover" role="button" tabindex="0" aria-label="Defteri aç">
            <div class="cover-face cover-front">
              <div class="cover-label">
                <div class="t">Quiz Defteri</div>
                <div class="s">BT Etiği · ${idsOf(allQuizzes).length} soru</div>
              </div>
            </div>
            <div class="cover-face cover-back"></div>
          </div>
          <div class="band"></div>
          <p class="cover-hint">Açmak için kapağa dokun</p>` : ""}
      </div>
    </section>`;
}

// Kapak oturum başına bir kez gösterilir
function sessionGet(key) {
  try { return sessionStorage.getItem(key); } catch (e) { return "1"; }
}

function openCover() {
  const scene = app.querySelector(".cover-scene");
  if (!scene || scene.classList.contains("opened")) return;
  scene.classList.add("opened");
  scene.querySelector(".sheet")?.removeAttribute("inert");
  try { sessionStorage.setItem("coverOpened", "1"); } catch (e) {}
  setTimeout(() => scene.querySelectorAll(".cover, .band, .cover-hint").forEach((el) => el.remove()), 1500);
}

// ===== Çalışma modu =====
// Bir "liste" hangi soruların hangi sırayla çözüleceğini tutar.
// Anahtarlar: "quiz:yeni-3", "mix:eski", "mix:all", "wrong", "marked"

function makeList(key) {
  const [kind, id] = key.split(":");
  if (kind === "quiz") {
    const quiz = quizById[id];
    if (!quiz) return null;
    return {
      title: quiz.title,
      subtitle: `${quiz.source.title} · Quiz ${quiz.no}`,
      summary: quiz.summary,
      base: idsOf([quiz]),
      canShuffle: true,
    };
  }
  if (kind === "mix") {
    const source = DATA.sources.find((s) => s.id === id);
    if (id !== "all" && !source) return null;
    return {
      title: source ? `${source.title}, karışık` : "Tüm sorular, karışık",
      subtitle: "Rastgele sırayla",
      base: idsOf(source ? source.quizzes : allQuizzes),
      alwaysShuffled: true,
    };
  }
  if (kind === "wrong") {
    return { title: "Yanlışlarım", subtitle: "Doğru yaptığın soru listeden çıkar", base: wrongIds(),
      empty: "Şu an yanlış yaptığın soru yok. Çözdükçe yanlışların burada toplanır." };
  }
  if (kind === "marked") {
    return { title: "İşaretlediklerim", subtitle: "Köşesini kıvırdığın sorular", base: markedIds(),
      empty: "Henüz işaretlediğin soru yok. Bir sorunun sağ üst köşesine dokunarak köşesini kıvırabilirsin." };
  }
  return null;
}

let session = null; // açık olan çalışma listesi; sayfadan çıkınca sıfırlanır

function startStudy(key) {
  const list = makeList(key);
  if (!list) return renderNotFound();
  // kayıtlı sıra eskimiş olabilir (soru sayısı değişti ya da bir soru silindi)
  const orderOk = (o) => Array.isArray(o) && o.length === list.base.length && o.every((id) => questionById[id]);
  if (list.alwaysShuffled && !orderOk(store.order[key])) {
    store.order[key] = shuffle(list.base);
    save();
  }
  const saved = store.order[key];
  const ids = orderOk(saved) ? saved : list.base;
  const fixed = key === "wrong" || key === "marked";
  const index = fixed ? 0 : Math.min(store.pos[key] || 0, Math.max(ids.length - 1, 0));
  session = { ...list, key, ids, index, shuffled: ids === saved, selected: {}, revealed: {}, drawing: null };
  renderStudyView();
}

function renderStudyView() {
  const s = session;
  unmountBook();
  const { w } = pageSize();
  app.innerHTML = `
    <section class="view" style="max-width:${w + 24}px">
      <div class="desk-head">
        <a class="back" href="#/" title="İçindekiler" aria-label="İçindekiler">←</a>
        <h1>${esc(s.title)}</h1>
        <span class="sub">${esc(s.subtitle)}</span>
      </div>
      ${s.summary ? `
        <details class="note-card">
          <summary>Konu özeti</summary>
          <p>${esc(s.summary)}</p>
        </details>` : ""}
      ${s.ids.length ? `
        <div class="tools">
          <label>Soru
            <select data-action="jump">${s.ids.map((_, i) => `<option value="${i}">${i + 1}</option>`).join("")}</select>
            / ${s.ids.length}</label>
          ${s.canShuffle ? `<label><input type="checkbox" data-action="toggle-shuffle" ${s.shuffled ? "checked" : ""}> Karışık sıra</label>` : ""}
          ${s.alwaysShuffled ? `<button type="button" class="desk-link" data-action="reshuffle">Yeniden karıştır</button>` : ""}
          ${gradableIds(s.ids).length ? `<button type="button" class="desk-link" data-action="quiz-mode">Quiz olarak çöz →</button>` : ""}
        </div>
        <div class="book-shell stack"></div>
        <nav class="pager">
          <button type="button" class="desk-btn" data-action="prev">← Önceki</button>
          <span id="count"></span>
          <button type="button" class="desk-btn" data-action="next">Sonraki →</button>
        </nav>
        <p class="kbd-hint">← → çevir · 1–4 seç · Enter kontrol</p>` : `
        <div class="sheet paper stack"><p>${esc(s.empty)}</p></div>`}
    </section>`;
  if (!s.ids.length) return;

  mountBook(app.querySelector(".book-shell"), {
    count: s.ids.length,
    start: s.index,
    render: studyPageHtml,
    onFlip: (i) => {
      s.index = i;
      if (s.key !== "wrong" && s.key !== "marked") {
        store.pos[s.key] = i;
        save();
      }
      updateStudyChrome();
    },
  });
  updateStudyChrome();
}

function updateStudyChrome() {
  const s = session;
  app.querySelector("#count").textContent = `${s.index + 1} / ${s.ids.length}`;
  app.querySelector('[data-action="jump"]').value = s.index;
  app.querySelector('[data-action="prev"]').disabled = s.index === 0;
  app.querySelector('[data-action="next"]').disabled = s.index === s.ids.length - 1;
}

function studyPageHtml(i) {
  const s = session;
  const q = questionById[s.ids[i]];
  const rev = s.revealed[q.id];
  let actions = "";
  if (q.type === "open") {
    if (!rev) {
      actions = `<button type="button" class="btn primary" data-action="show-open" data-i="${i}">Cevabı göster</button>`;
    } else if (!rev.result) {
      actions = `<span class="muted">Kendini değerlendir:</span>
        <button type="button" class="btn" data-action="open-known" data-i="${i}">Bildim</button>
        <button type="button" class="btn" data-action="open-unknown" data-i="${i}">Bilemedim</button>`;
    } else {
      actions = rev.result === "known"
        ? `<span class="ok"><em>Bildim olarak işaretlendi.</em></span>`
        : `<span class="bad"><em>Bilemedim olarak işaretlendi, yanlışlarına eklendi.</em></span>`;
    }
  } else if (!rev) {
    actions = `<button type="button" class="btn primary" data-action="check" data-i="${i}" ${s.selected[q.id] == null ? "disabled" : ""}>Cevabı kontrol et</button>`;
  }

  return `
    <button type="button" class="dogear ${store.marked[q.id] ? "folded" : ""}" data-action="mark" data-i="${i}"
      title="Köşeyi kıvır: soruyu işaretle" aria-label="Soruyu işaretle"></button>
    <div class="page-inner">
      ${questionHtml(q, {
        selected: s.selected[q.id],
        drawing: s.drawing === q.id ? s.selected[q.id] : null,
        revealed: !!rev,
        past: rev ? null : store.answers[q.id],
        action: "select",
        i,
      })}
      ${actions ? `<p class="actions">${actions}</p>` : ""}
    </div>
    <div class="folio">${i + 1}</div>`;
}

// açık uçlu sorular puanlanmaz; quiz ve deneme sadece şıklı soruları alır
const gradableIds = (ids) => ids.filter((id) => questionById[id].type !== "open");

const pageQuestion = (btn) => questionById[(session ? session.ids : store.exam.ids)[Number(btn.dataset.i)]];

// ===== Deneme sınavı =====

function examScopes() {
  return [
    ["all", "Tüm sorular", allQuizzes],
    ...DATA.sources.map((s) => [`src:${s.id}`, `${s.title} (hepsi)`, s.quizzes]),
    ...allQuizzes.map((quiz) => [`quiz:${quiz.id}`, `${shortSource(quiz)} ${quiz.no}. ${quiz.title}`, [quiz]]),
  ];
}

function renderExamSetup() {
  const running = store.exam && !store.exam.finishedAt;
  app.innerHTML = `
    <section class="view" style="max-width:784px">
      <div class="desk-head"><a class="back" href="#/">← İçindekiler</a></div>
      <div class="sheet paper stack">
        <h1 class="title">Deneme sınavı</h1>
        <p class="muted">Cevaplar sınav bitince gösterilir. Açık uçlu sorular denemeye girmez.</p>
        ${running ? `<p><a href="#/exam/run">Yarım kalmış denemene devam et →</a></p>` : ""}
        ${store.exam && store.exam.finishedAt ? `<p><a href="#/exam/result">Son denemenin sonucunu gör →</a></p>` : ""}
        <form class="exam-form gap" data-action="start-exam">
          <label>Kapsam:
            <select name="scope">${examScopes().map(([value, label]) =>
              `<option value="${value}">${esc(label)}</option>`).join("")}</select></label>
          <label>Soru sayısı: <input name="count" type="number" min="1" value="20"></label>
          <label>Süre (dakika): <input name="minutes" type="number" min="0" value="0">
            <span class="hint">0 yazarsan süre tutulmaz</span></label>
          <p class="actions"><button class="btn primary" type="submit">Başla</button></p>
        </form>
      </div>
    </section>`;
}

function startExam(form) {
  if (store.exam && !store.exam.finishedAt && !confirm("Yarım kalan deneme silinecek. Yeni deneme başlasın mı?")) return;
  const [, label, quizzes] = examScopes().find(([value]) => value === form.scope.value);
  const pool = gradableIds(idsOf(quizzes));
  const count = Math.max(1, Math.min(parseInt(form.count.value, 10) || 20, pool.length));
  store.exam = {
    title: label,
    ids: shuffle(pool).slice(0, count),
    choices: {},
    index: 0,
    startedAt: Date.now(),
    duration: Math.max(0, parseInt(form.minutes.value, 10) || 0) * 60,
    finishedAt: null,
  };
  save();
  location.hash = "#/exam/run";
}

let timer = null;
let examDrawing = null;

// kayıtlı denemedeki bir soru artık veride yoksa (soru dosyası güncellendi) deneme kullanılamaz
const examValid = (ex) => ex.ids.length > 0 && ex.ids.every((id) => questionById[id]);

function dropExam() {
  store.exam = null;
  save();
  location.replace("#/exam");
}

function renderExamRun() {
  const ex = store.exam;
  if (!ex || !examValid(ex)) return dropExam();
  if (ex.finishedAt) return location.replace("#/exam/result");

  unmountBook();
  const { w } = pageSize();
  app.innerHTML = `
    <section class="view" style="max-width:${w + 24}px">
      <div class="desk-head">
        <a class="back" href="#/" title="İçindekiler" aria-label="İçindekiler">←</a>
        <h1>${esc(ex.title)}</h1>
        <span class="sub"><span id="answered"></span> · <span id="timer" class="timer"></span></span>
      </div>
      <div class="book-shell stack"></div>
      <nav class="pager">
        <button type="button" class="desk-btn" data-action="prev">← Önceki</button>
        <span id="count"></span>
        <button type="button" class="desk-btn" data-action="next">Sonraki →</button>
      </nav>
      <p class="kbd-hint">← → çevir · 1–4 seç</p>
      <div class="grid" id="grid"></div>
      <p class="finish"><button type="button" class="desk-btn primary" data-action="finish-exam">Testi bitir</button></p>
    </section>`;

  mountBook(app.querySelector(".book-shell"), {
    count: ex.ids.length,
    start: Math.min(ex.index, ex.ids.length - 1),
    render: examPageHtml,
    onFlip: (i) => {
      ex.index = i;
      save();
      updateExamChrome();
    },
  });
  updateExamChrome();

  clearInterval(timer);
  tick();
  timer = setInterval(tick, 1000);
}

function examPageHtml(i) {
  const ex = store.exam;
  const q = questionById[ex.ids[i]];
  const choice = ex.choices[q.id];
  return `
    <div class="page-inner">
      ${questionHtml(q, {
        selected: choice,
        drawing: examDrawing === q.id ? choice : null,
        revealed: false,
        action: "exam-select",
        i,
      })}
      ${choice != null ? `<p class="actions"><button type="button" class="link-button" data-action="exam-clear" data-i="${i}">Boş bırak</button></p>` : ""}
    </div>
    <div class="folio">${i + 1}</div>`;
}

function updateExamChrome() {
  const ex = store.exam;
  const i = ex.index;
  app.querySelector("#count").textContent = `${i + 1} / ${ex.ids.length}`;
  app.querySelector("#answered").textContent = `${Object.keys(ex.choices).length} / ${ex.ids.length} cevaplandı`;
  app.querySelector('[data-action="prev"]').disabled = i === 0;
  app.querySelector('[data-action="next"]').disabled = i === ex.ids.length - 1;
  const grid = app.querySelector("#grid");
  const gridFocused = grid.contains(document.activeElement);
  grid.innerHTML = ex.ids.map((id, k) => `
    <button type="button" class="cell ${ex.choices[id] != null ? "done" : ""} ${k === i ? "current" : ""}"
      data-action="exam-go" data-i="${k}">${k + 1}</button>`).join("");
  if (gridFocused) grid.querySelector(".cell.current")?.focus({ preventScroll: true });
}

// Her saniye çalışır: geçen ya da kalan süreyi yazar, süre bitince sınavı kapatır
function tick() {
  const ex = store.exam;
  const el = document.getElementById("timer");
  if (!ex || ex.finishedAt || !el) return clearInterval(timer);
  const elapsed = Math.floor((Date.now() - ex.startedAt) / 1000);
  if (!ex.duration) {
    el.textContent = formatTime(elapsed);
    return;
  }
  const left = ex.duration - elapsed;
  if (left <= 0) return finishExam(true);
  el.textContent = `${formatTime(left)} kaldı`;
  el.classList.toggle("low", left <= 60);
}

function finishExam(timeUp) {
  const ex = store.exam;
  if (!timeUp) {
    const blank = ex.ids.length - Object.keys(ex.choices).length;
    if (!confirm(blank ? `${blank} soru boş. Testi bitirmek istiyor musun?` : "Testi bitirmek istiyor musun?")) return;
  }
  clearInterval(timer);
  closeExam(timeUp);
  location.replace("#/exam/result");
}

// Denemeyi kapatır ve cevapları kayda işler (yönlendirme yapmaz; İçindekiler de kullanır)
function closeExam(timeUp) {
  const ex = store.exam;
  ex.finishedAt = timeUp ? ex.startedAt + ex.duration * 1000 : Date.now();
  for (const [id, choice] of Object.entries(ex.choices)) {
    store.answers[id] = { correct: choice === questionById[id].answer };
  }
  save();
}

function renderExamResult() {
  const ex = store.exam;
  if (!ex || !examValid(ex)) return dropExam();
  if (!ex.finishedAt) return location.replace("#/exam");

  let correct = 0, wrong = 0, blank = 0;
  for (const id of ex.ids) {
    const choice = ex.choices[id];
    if (choice == null) blank++;
    else if (choice === questionById[id].answer) correct++;
    else wrong++;
  }
  const total = ex.ids.length;
  const pct = total ? Math.round((100 * correct) / total) : 0;
  const note = pct >= 85 ? "Aferin!" : pct >= 70 ? "İyi, devam." : pct >= 50 ? "Biraz daha çalış." : "Tekrar et.";
  const spent = Math.round((ex.finishedAt - ex.startedAt) / 1000);

  app.innerHTML = `
    <section class="view" style="max-width:784px">
      <div class="desk-head"><a class="back" href="#/">← İçindekiler</a></div>
      <div class="sheet paper stack">
        <h1 class="title">Sonuç</h1>
        <p class="muted">${esc(ex.title)} · ${total} soru · ${formatTime(spent)} sürdü</p>
        <div class="grade" aria-label="${correct} / ${total}">
          <svg viewBox="0 0 210 112" aria-hidden="true"><path d="M 150 14 C 205 22, 214 80, 140 98 C 80 110, 14 98, 8 60 C 2 22, 70 6, 128 10 C 150 12, 168 18, 176 24"/></svg>
          <div class="grade-text">${correct}/${total}</div>
        </div>
        <p class="teacher-note">${note}</p>
        <p class="score">
          <span class="ok">${correct} doğru</span> ·
          <span class="bad">${wrong} yanlış</span> ·
          ${blank} boş · %${pct}
        </p>
        <p class="actions">
          <a class="btn" href="#/exam">Yeni deneme</a>
          ${wrong ? `<a class="btn" href="#/wrong">Yanlışlarımı çöz</a>` : ""}
        </p>
        <p class="ornament" aria-hidden="true">❦</p>
        ${ex.ids.map((id, i) => `
          <div class="review">
            <span class="review-no">${i + 1}.</span>
            <div class="q">${questionHtml(questionById[id], { selected: ex.choices[id], revealed: true, action: "none", i })}</div>
          </div>`).join("")}
      </div>
    </section>`;
}

// ===== Tıklamalar =====
// Her butonda data-action="..." yazar; tek bir dinleyici hangisine tıklandığına bakıp
// aşağıdaki listeden ilgili işlemi çalıştırır (event delegation).

const actions = {
  // çalışma
  select(btn) {
    const q = pageQuestion(btn);
    if (session.revealed[q.id]) return;
    session.selected[q.id] = Number(btn.dataset.k);
    session.drawing = q.id;
    renderPage(Number(btn.dataset.i));
    session.drawing = null;
    refocusOption(btn);
  },
  check(btn) {
    const q = pageQuestion(btn);
    const choice = session.selected[q.id];
    if (choice == null) return;
    session.revealed[q.id] = { choice };
    record(q.id, choice === q.answer);
    renderPage(Number(btn.dataset.i));
  },
  "show-open"(btn) {
    session.revealed[pageQuestion(btn).id] = {};
    renderPage(Number(btn.dataset.i));
  },
  "open-known"(btn) {
    const q = pageQuestion(btn);
    session.revealed[q.id].result = "known";
    record(q.id, true);
    renderPage(Number(btn.dataset.i));
  },
  "open-unknown"(btn) {
    const q = pageQuestion(btn);
    session.revealed[q.id].result = "unknown";
    record(q.id, false);
    renderPage(Number(btn.dataset.i));
  },
  mark(btn) {
    const q = pageQuestion(btn);
    if (store.marked[q.id]) delete store.marked[q.id];
    else store.marked[q.id] = true;
    save();
    renderPage(Number(btn.dataset.i));
  },
  prev() { turn(-1); },
  next() { turn(1); },
  jump(select) { goToPage(Number(select.value)); },
  "toggle-shuffle"(input) {
    if (input.checked) store.order[session.key] = shuffle(session.base);
    else delete store.order[session.key];
    session.shuffled = input.checked;
    session.ids = store.order[session.key] || session.base;
    session.index = 0;
    store.pos[session.key] = 0;
    save();
    renderStudyView();
  },
  reshuffle() {
    store.order[session.key] = shuffle(session.base);
    session.ids = store.order[session.key];
    session.index = 0;
    store.pos[session.key] = 0;
    save();
    renderStudyView();
  },

  // deneme
  "exam-select"(btn) {
    const q = pageQuestion(btn);
    store.exam.choices[q.id] = Number(btn.dataset.k);
    save();
    examDrawing = q.id;
    renderPage(Number(btn.dataset.i));
    examDrawing = null;
    refocusOption(btn);
    updateExamChrome();
  },
  "exam-clear"(btn) {
    delete store.exam.choices[pageQuestion(btn).id];
    save();
    renderPage(Number(btn.dataset.i));
    updateExamChrome();
  },
  "exam-go"(btn) { goToPage(Number(btn.dataset.i)); },
  "finish-exam"() { finishExam(false); },
  // açık çalışma listesini süresiz bir teste çevir: cevaplar "Testi bitir" deyince görünür
  "quiz-mode"() {
    const ids = gradableIds(session.ids);
    if (!ids.length) return alert("Bu listede puanlanabilir soru yok.");
    if (store.exam && !store.exam.finishedAt && !confirm("Yarım kalan deneme silinecek. Devam edilsin mi?")) return;
    store.exam = { title: session.title, ids, choices: {}, index: 0, startedAt: Date.now(), duration: 0, finishedAt: null };
    save();
    location.hash = "#/exam/run";
  },

  // genel
  "open-cover"() { openCover(); },
  "reset-progress"() {
    if (!confirm("Bütün ilerlemen (çözdüğün sorular, yanlışların, işaretlerin, denemeler) silinsin mi?")) return;
    Object.assign(store, { answers: {}, pos: {}, order: {}, exam: null, marked: {} });
    save();
    renderHome();
  },
};

app.addEventListener("click", (e) => {
  const el = e.target.closest("button[data-action], .cover[data-action]");
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
});
app.addEventListener("change", (e) => {
  const el = e.target.closest("select[data-action], input[data-action]");
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
});
app.addEventListener("submit", (e) => {
  e.preventDefault();
  startExam(e.target);
});

// Klavye: ← → sayfa çevirir, 1-4 şık seçer, Enter cevabı kontrol eder
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // kapak bir düğme gibi davranır: Enter ya da Boşluk ile açılır
  if (e.target.classList?.contains("cover") && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    openCover();
    return;
  }
  if (!book || e.target.closest("input, select, textarea")) return;
  const page = book.pages[currentPage()];
  // sayfa çevrilirken 1-4 ve Enter yok sayılır; yoksa animasyondaki sayfa değişir
  const reading = book.flip.getState() === "read";
  if (e.key === "ArrowLeft") turn(-1);
  else if (e.key === "ArrowRight") turn(1);
  else if (!reading) return;
  else if (e.key >= "1" && e.key <= "4") page.querySelectorAll(".option:not(:disabled)")[e.key - 1]?.click();
  else if (e.key === "Enter" && e.target.tagName !== "BUTTON") {
    page.querySelector('[data-action="check"], [data-action="show-open"]')?.click();
  }
});

// Ekran genişliği değişirse (telefon yan çevrilince) kitabı yeni ölçüyle yeniden kur
let lastWidth = window.innerWidth;
let resizeTimer;
window.addEventListener("resize", () => {
  if (window.innerWidth === lastWidth) return; // telefonda adres çubuğu açılıp kapanınca sadece yükseklik değişir
  lastWidth = window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (book && session) renderStudyView();
    else if (book && location.hash === "#/exam/run") renderExamRun();
  }, 250);
});

// ===== Yönlendirme (routing) =====

function renderNotFound() {
  app.innerHTML = `
    <section class="view" style="max-width:784px">
      <div class="sheet paper stack">
        <h1 class="title">Bu sayfa defterde yok</h1>
        <p><a href="#/">İçindekiler'e dön</a></p>
      </div>
    </section>`;
}

const routes = [
  [/^#\/?$/, () => renderHome()],
  [/^#\/quiz\/([\w-]+)$/, (m) => startStudy(`quiz:${m[1]}`)],
  [/^#\/mix\/([\w-]+)$/, (m) => startStudy(`mix:${m[1]}`)],
  [/^#\/wrong$/, () => startStudy("wrong")],
  [/^#\/marked$/, () => startStudy("marked")],
  [/^#\/exam$/, () => renderExamSetup()],
  [/^#\/exam\/run$/, () => renderExamRun()],
  [/^#\/exam\/result$/, () => renderExamResult()],
];

function router() {
  clearInterval(timer);
  unmountBook();
  session = null;
  const hash = location.hash || "#/";
  for (const [pattern, render] of routes) {
    const match = hash.match(pattern);
    if (match) {
      render(match);
      window.scrollTo(0, 0);
      return;
    }
  }
  renderNotFound();
}

window.addEventListener("hashchange", router);

// Sayfa ölçümleri (fit) yazı tipine bağlı; fontlar gelmeden çizilirse sığdırma yanlış çıkar.
// Fontlar yüklenince ilk çizim yapılır, ama yavaş ağda sayfa boş kalmasın diye 1,5 sn sınır var.
const fontsLoaded = document.fonts
  ? Promise.all([
      document.fonts.load('16px "EB Garamond"'),
      document.fonts.load('italic 16px "EB Garamond"'),
      document.fonts.load('600 16px "Caveat"'),
    ]).catch(() => {})
  : Promise.resolve();
Promise.race([fontsLoaded, new Promise((resolve) => setTimeout(resolve, 1500))]).then(router);

// ===== Lamba (gece modu) =====

const themeButton = document.getElementById("theme-toggle");
const currentTheme = () => document.documentElement.dataset.theme || "light";

function updateThemeButton() {
  themeButton.textContent = currentTheme() === "dark" ? "Lambayı aç" : "Lambayı kıs";
}

themeButton.addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("theme", next); } catch (e) {}
  updateThemeButton();
});

updateThemeButton();
