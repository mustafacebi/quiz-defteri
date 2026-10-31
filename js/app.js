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

  book.flip = new St.PageFlip(shell.firstElementChild, {
    width: w, height: h, size: "fixed", usePortrait: true, showCover: false,
    flippingTime: 900, maxShadowOpacity: 0.6, drawShadow: true,
    showPageCorners: false, useMouseEvents: false, startPage: start,
  });
  book.flip.loadFromHTML(pages);
  book.flip.on("flip", (e) => {
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
  try { book.flip.destroy(); } catch (e) {}
  book = null;
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
}

const currentPage = () => book.flip.getCurrentPageIndex();

function turn(dir) {
  if (!book) return;
  book.dir = dir;
  dir > 0 ? book.flip.flipNext("bottom") : book.flip.flipPrev("bottom");
}

function goToPage(n) {
  ensurePages(n);
  book.flip.turnToPage(n);
  book.onFlip(n);
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
  page.style.setProperty("--fs", chosen + "px");
  // en küçük yazıyla da sığmıyorsa (telefonda çok uzun cevaplar) sayfanın içi kaydırılır
  page.classList.toggle("overflow", inner.scrollHeight > inner.clientHeight);
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

function renderHome() {
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
        <div class="sheet paper stack">
          <h1 class="title">İçindekiler</h1>
          <p class="muted">${idsOf(allQuizzes).length} soru, ${DATA.sources.length} defter.
            ${solved ? `Şimdiye kadar ${solved} tanesini çözdün.` : "Bir bölüm seçerek başla."}</p>
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
          <div class="cover" data-action="open-cover" role="button" aria-label="Defteri aç">
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
  if (list.alwaysShuffled && !store.order[key]) {
    store.order[key] = shuffle(list.base);
    save();
  }
  const saved = store.order[key];
  const ids = saved && saved.length === list.base.length ? saved : list.base;
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
        <a class="back" href="#/">← İçindekiler</a>
        <h1>${esc(s.title)}</h1>
        <p class="sub">${esc(s.subtitle)}</p>
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
        </div>
        <div class="book-shell stack"></div>
        <nav class="pager">
          <button type="button" class="desk-btn" data-action="prev">← Önceki</button>
          <span id="count"></span>
          <button type="button" class="desk-btn" data-action="next">Sonraki →</button>
        </nav>` : `
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
  const pool = idsOf(quizzes).filter((id) => questionById[id].type !== "open");
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

function renderExamRun() {
  const ex = store.exam;
  if (!ex) return (location.hash = "#/exam");
  if (ex.finishedAt) return (location.hash = "#/exam/result");

  unmountBook();
  const { w } = pageSize();
  app.innerHTML = `
    <section class="view" style="max-width:${w + 24}px">
      <div class="desk-head">
        <a class="back" href="#/">← İçindekiler</a>
        <h1>${esc(ex.title)}</h1>
        <p class="sub"><span id="answered"></span> · <span id="timer" class="timer"></span></p>
      </div>
      <div class="book-shell stack"></div>
      <nav class="pager">
        <button type="button" class="desk-btn" data-action="prev">← Önceki</button>
        <span id="count"></span>
        <button type="button" class="desk-btn" data-action="next">Sonraki →</button>
      </nav>
      <div class="grid" id="grid"></div>
      <p class="finish"><button type="button" class="desk-btn primary" data-action="finish-exam">Sınavı bitir</button></p>
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
  app.querySelector("#grid").innerHTML = ex.ids.map((id, k) => `
    <button type="button" class="cell ${ex.choices[id] != null ? "done" : ""} ${k === i ? "current" : ""}"
      data-action="exam-go" data-i="${k}">${k + 1}</button>`).join("");
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
    if (!confirm(blank ? `${blank} soru boş. Sınavı bitirmek istiyor musun?` : "Sınavı bitirmek istiyor musun?")) return;
  }
  clearInterval(timer);
  ex.finishedAt = timeUp ? ex.startedAt + ex.duration * 1000 : Date.now();
  for (const [id, choice] of Object.entries(ex.choices)) {
    store.answers[id] = { correct: choice === questionById[id].answer };
  }
  save();
  location.hash = "#/exam/result";
}

function renderExamResult() {
  const ex = store.exam;
  if (!ex || !ex.finishedAt) return (location.hash = "#/exam");

  let correct = 0, wrong = 0, blank = 0;
  for (const id of ex.ids) {
    const choice = ex.choices[id];
    if (choice == null) blank++;
    else if (choice === questionById[id].answer) correct++;
    else wrong++;
  }
  const total = ex.ids.length;
  const pct = Math.round((100 * correct) / total);
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
  if (!book || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest("input, select, textarea")) return;
  const page = book.pages[currentPage()];
  if (e.key === "ArrowLeft") turn(-1);
  else if (e.key === "ArrowRight") turn(1);
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
router();

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
