// Quiz Defteri — uygulama mantığı.
// Hangi sayfanın çizileceğine adres çubuğundaki "#"'den sonraki kısım karar verir
// (hash routing): "#/" İçindekiler, "#/quiz/yeni-3" Yeni Quiz 3, "#/exam" deneme gibi.

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
// answers: her sorunun son sonucu, pos: her listede kalınan soru,
// order: karıştırılmış listelerin sırası, exam: süren ya da biten son deneme
const STORE_KEY = "quiz-defteri";
const store = loadStore();

function loadStore() {
  const empty = { answers: {}, pos: {}, order: {}, exam: null };
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

// ===== Soru görünümü (çalışma, deneme ve sonuç ekranı ortak kullanır) =====
// opts.selected: işaretlenen şık, opts.revealed: cevap gösterildi mi,
// opts.action: şıkka tıklanınca çalışacak işlem
function questionHtml(q, opts) {
  const tag = { mc: "Çoktan seçmeli", tf: "Doğru / yanlış", open: "Açık uçlu" }[q.type];
  const meta = `${tag} · ${shortSource(q.quiz)} quiz ${q.quiz.no}, soru ${q.no}`;
  let body = "";

  if (q.type === "open") {
    if (opts.revealed) {
      body = `
        <div class="answer-box">
          <p class="label">Örnek cevap</p>
          <p class="explanation">${esc(q.explanation)}</p>
        </div>`;
    }
  } else {
    const choice = opts.selected;
    body = `<ol class="options">${q.options.map((text, i) => {
      const cls = [
        i === choice && !opts.revealed && "selected",
        opts.revealed && i === q.answer && "correct",
        opts.revealed && i === choice && choice !== q.answer && "wrong",
      ].filter(Boolean).join(" ");
      return `
        <li><button class="option ${cls}" data-action="${opts.action}" data-i="${i}" ${opts.revealed ? "disabled" : ""}>
          ${q.type === "mc" ? `<span class="letter">${LETTERS[i]})</span>` : ""}
          <span class="option-text">${esc(text)}</span>
        </button></li>`;
    }).join("")}</ol>`;
    if (opts.revealed) body += feedbackHtml(q, choice);
  }

  if (opts.revealed && q.uncertain) {
    body += `<p class="uncertain">⚠ Bu cevap kesin değil, notlarından kontrol et.${
      q.uncertainNote ? ` <em>${esc(q.uncertainNote)}</em>` : ""}</p>`;
  }

  return `
    <article class="question">
      <p class="q-meta">${meta}</p>
      <p class="q-text">${esc(q.text)}</p>
      ${body}
    </article>`;
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

// ===== İçindekiler =====

function renderHome() {
  const solved = Object.keys(store.answers).length;
  const wrong = wrongIds().length;
  const sections = DATA.sources.map((source) => `
    <section>
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
      <a class="mix-link" href="#/mix/${source.id}">Bu quizlerin hepsinden karışık →</a>
    </section>`).join(`<p class="ornament" aria-hidden="true">❦</p>`);

  app.innerHTML = `
    <h1 class="title">İçindekiler</h1>
    <p class="muted">${idsOf(allQuizzes).length} soru, ${DATA.sources.length} defter.
      ${solved ? `Şimdiye kadar ${solved} tanesini çözdün.` : "Bir bölüm seçerek başla."}</p>
    <p class="home-links">
      <a href="#/exam">Deneme sınavı</a>
      <span aria-hidden="true">·</span>
      <a href="#/wrong">Yanlışlarım (${wrong})</a>
      <span aria-hidden="true">·</span>
      <a href="#/mix/all">Tüm sorulardan karışık</a>
    </p>
    ${sections}
    ${solved ? `<p class="footer"><button class="link-button" data-action="reset-progress">İlerlemeyi sıfırla</button></p>` : ""}`;
}

// ===== Çalışma modu =====
// Bir "liste" hangi soruların hangi sırayla çözüleceğini tutar.
// Anahtarlar: "quiz:yeni-3", "mix:eski", "mix:all", "wrong"

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
    return { title: "Yanlışlarım", subtitle: "Doğru yaptığın soru listeden çıkar", base: wrongIds() };
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
  const index = key === "wrong" ? 0 : Math.min(store.pos[key] || 0, Math.max(ids.length - 1, 0));
  session = { ...list, key, ids, index, shuffled: ids === saved, selected: {}, revealed: {} };
  renderStudy();
}

const currentQuestion = () => questionById[session.ids[session.index]];

function renderStudy() {
  const s = session;
  const header = `
    <a class="back" href="#/">← İçindekiler</a>
    <h1 class="title">${esc(s.title)}</h1>
    <p class="muted">${esc(s.subtitle)}</p>
    ${s.summary ? `
      <details class="summary">
        <summary>Konu özeti</summary>
        <p>${esc(s.summary)}</p>
      </details>` : ""}`;

  if (!s.ids.length) {
    app.innerHTML = header + `<p>Şu an yanlış yaptığın soru yok. Çözdükçe yanlışların burada toplanır.</p>`;
    return;
  }

  const q = currentQuestion();
  const revealed = s.revealed[q.id];
  const selected = revealed ? revealed.choice : s.selected[q.id];
  const past = store.answers[q.id];

  let middle = "";
  if (q.type === "open") {
    if (!revealed) middle = `<button class="btn primary" data-action="show-open">Cevabı göster</button>`;
  } else if (!revealed) {
    middle = `<button class="btn primary" data-action="check" ${selected == null ? "disabled" : ""}>Cevabı kontrol et</button>`;
  }

  let selfCheck = "";
  if (q.type === "open" && revealed) {
    selfCheck = revealed.result
      ? `<p class="feedback ${revealed.result === "known" ? "ok" : "bad"}">${
          revealed.result === "known" ? "Bildim olarak işaretlendi." : "Bilemedim olarak işaretlendi, yanlışlarına eklendi."}</p>`
      : `<p class="self-check">Kendini değerlendir:
          <button class="btn" data-action="open-known">Bildim</button>
          <button class="btn" data-action="open-unknown">Bilemedim</button></p>`;
  }

  app.innerHTML = header + `
    <div class="toolbar">
      <label>Soru
        <select data-action="jump">${s.ids.map((_, i) =>
          `<option value="${i}" ${i === s.index ? "selected" : ""}>${i + 1}</option>`).join("")}</select>
        / ${s.ids.length}</label>
      ${s.canShuffle ? `<label class="check"><input type="checkbox" data-action="toggle-shuffle" ${s.shuffled ? "checked" : ""}> Karışık sıra</label>` : ""}
      ${s.alwaysShuffled ? `<button class="link-button" data-action="reshuffle">Yeniden karıştır</button>` : ""}
    </div>
    ${past && !revealed ? `<p class="past">Bu soruyu daha önce ${past.correct ? "doğru" : "yanlış"} yapmıştın.</p>` : ""}
    ${questionHtml(q, { selected, revealed: !!revealed, action: "select" })}
    ${selfCheck}
    <nav class="pager">
      <button class="btn" data-action="prev" ${s.index === 0 ? "disabled" : ""}>← Önceki</button>
      ${middle}
      <button class="btn" data-action="next" ${s.index === s.ids.length - 1 ? "disabled" : ""}>Sonraki →</button>
    </nav>`;
}

function goTo(i) {
  session.index = Math.max(0, Math.min(i, session.ids.length - 1));
  if (session.key !== "wrong") {
    store.pos[session.key] = session.index;
    save();
  }
  renderStudy();
  app.querySelector(".toolbar").scrollIntoView({ block: "nearest" });
}

function setOrder(ids) {
  session.ids = ids;
  session.index = 0;
  store.pos[session.key] = 0;
  save();
  renderStudy();
}

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
    <a class="back" href="#/">← İçindekiler</a>
    <h1 class="title">Deneme sınavı</h1>
    <p class="muted">Cevaplar sınav bitince gösterilir. Açık uçlu sorular denemeye girmez.</p>
    ${running ? `<p class="notice">Yarım kalmış bir denemen var. <a href="#/exam/run">Devam et →</a></p>` : ""}
    ${store.exam && store.exam.finishedAt ? `<p class="notice"><a href="#/exam/result">Son denemenin sonucunu gör →</a></p>` : ""}
    <form class="exam-form" data-action="start-exam">
      <label>Kapsam
        <select name="scope">${examScopes().map(([value, label]) =>
          `<option value="${value}">${esc(label)}</option>`).join("")}</select></label>
      <label>Soru sayısı <input name="count" type="number" min="1" value="20"></label>
      <label>Süre (dakika) <input name="minutes" type="number" min="0" value="0">
        <span class="hint">0 yazarsan süre tutulmaz</span></label>
      <button class="btn primary" type="submit">Başla</button>
    </form>`;
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

function renderExamRun() {
  const ex = store.exam;
  if (!ex) return (location.hash = "#/exam");
  if (ex.finishedAt) return (location.hash = "#/exam/result");

  const q = questionById[ex.ids[ex.index]];
  const answered = Object.keys(ex.choices).length;
  app.innerHTML = `
    <div class="exam-head">
      <span>${esc(ex.title)}</span>
      <span id="timer" class="timer"></span>
    </div>
    <p class="muted">Soru ${ex.index + 1} / ${ex.ids.length} · ${answered} cevaplandı</p>
    ${questionHtml(q, { selected: ex.choices[q.id], revealed: false, action: "exam-select" })}
    <nav class="pager">
      <button class="btn" data-action="prev" ${ex.index === 0 ? "disabled" : ""}>← Önceki</button>
      ${ex.choices[q.id] != null ? `<button class="link-button" data-action="exam-clear">Boş bırak</button>` : ""}
      <button class="btn" data-action="next" ${ex.index === ex.ids.length - 1 ? "disabled" : ""}>Sonraki →</button>
    </nav>
    <div class="grid">${ex.ids.map((id, i) => `
      <button class="cell ${ex.choices[id] != null ? "done" : ""} ${i === ex.index ? "current" : ""}"
        data-action="exam-go" data-i="${i}">${i + 1}</button>`).join("")}</div>
    <p><button class="btn primary" data-action="finish-exam">Sınavı bitir</button></p>`;

  clearInterval(timer);
  tick();
  timer = setInterval(tick, 1000);
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

function examGo(i) {
  const ex = store.exam;
  ex.index = Math.max(0, Math.min(i, ex.ids.length - 1));
  save();
  renderExamRun();
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
  const spent = Math.round((ex.finishedAt - ex.startedAt) / 1000);

  app.innerHTML = `
    <a class="back" href="#/">← İçindekiler</a>
    <h1 class="title">Sonuç</h1>
    <p class="muted">${esc(ex.title)} · ${ex.ids.length} soru · ${formatTime(spent)} sürdü</p>
    <p class="score">
      <span class="ok">${correct} doğru</span> ·
      <span class="bad">${wrong} yanlış</span> ·
      ${blank} boş
      <strong>%${Math.round((100 * correct) / ex.ids.length)}</strong>
    </p>
    <p class="actions">
      <a class="btn" href="#/exam">Yeni deneme</a>
      ${wrong ? `<a class="btn" href="#/wrong">Yanlışlarımı çöz</a>` : ""}
    </p>
    <p class="ornament" aria-hidden="true">❦</p>
    ${ex.ids.map((id, i) => `
      <div class="review">
        <span class="review-no">${i + 1}.</span>
        ${questionHtml(questionById[id], { selected: ex.choices[id], revealed: true, action: "none" })}
      </div>`).join("")}`;
}

// ===== Tıklamalar =====
// Her butonda data-action="..." yazar; tek bir dinleyici hangisine tıklandığına bakıp
// aşağıdaki listeden ilgili işlemi çalıştırır (event delegation).

const inExam = () => location.hash === "#/exam/run";

const actions = {
  select(btn) {
    session.selected[currentQuestion().id] = Number(btn.dataset.i);
    renderStudy();
  },
  check() {
    const q = currentQuestion();
    const choice = session.selected[q.id];
    if (choice == null) return;
    session.revealed[q.id] = { choice };
    record(q.id, choice === q.answer);
    renderStudy();
  },
  "show-open"() {
    session.revealed[currentQuestion().id] = {};
    renderStudy();
  },
  "open-known"() {
    const q = currentQuestion();
    session.revealed[q.id].result = "known";
    record(q.id, true);
    renderStudy();
  },
  "open-unknown"() {
    const q = currentQuestion();
    session.revealed[q.id].result = "unknown";
    record(q.id, false);
    renderStudy();
  },
  prev() {
    inExam() ? examGo(store.exam.index - 1) : goTo(session.index - 1);
  },
  next() {
    inExam() ? examGo(store.exam.index + 1) : goTo(session.index + 1);
  },
  jump(select) {
    goTo(Number(select.value));
  },
  "toggle-shuffle"(input) {
    session.shuffled = input.checked;
    if (input.checked) {
      store.order[session.key] = shuffle(session.base);
      setOrder(store.order[session.key]);
    } else {
      delete store.order[session.key];
      setOrder(session.base);
    }
  },
  reshuffle() {
    store.order[session.key] = shuffle(session.base);
    setOrder(store.order[session.key]);
  },
  "exam-select"(btn) {
    const ex = store.exam;
    ex.choices[ex.ids[ex.index]] = Number(btn.dataset.i);
    save();
    renderExamRun();
  },
  "exam-clear"() {
    const ex = store.exam;
    delete ex.choices[ex.ids[ex.index]];
    save();
    renderExamRun();
  },
  "exam-go"(btn) {
    examGo(Number(btn.dataset.i));
  },
  "finish-exam"() {
    finishExam(false);
  },
  "reset-progress"() {
    if (!confirm("Bütün ilerlemen (çözdüğün sorular, yanlışların, denemeler) silinsin mi?")) return;
    Object.assign(store, { answers: {}, pos: {}, order: {}, exam: null });
    save();
    renderHome();
  },
};

app.addEventListener("click", (e) => {
  const el = e.target.closest("button[data-action]");
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
});
app.addEventListener("change", (e) => {
  const el = e.target.closest("[data-action]");
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
});
app.addEventListener("submit", (e) => {
  e.preventDefault();
  startExam(e.target);
});

// Klavye: ← → soru değiştirir, 1-4 şık seçer, Enter cevabı kontrol eder
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest("input, select, textarea")) return;
  if (!session && !inExam()) return;
  const click = (selector) => app.querySelector(selector)?.click();
  if (e.key === "ArrowLeft") click('[data-action="prev"]');
  else if (e.key === "ArrowRight") click('[data-action="next"]');
  else if (e.key >= "1" && e.key <= "4") app.querySelectorAll(".option:not(:disabled)")[e.key - 1]?.click();
  else if (e.key === "Enter" && e.target.tagName !== "BUTTON") click('[data-action="check"], [data-action="show-open"]');
});

// ===== Yönlendirme (routing) =====

function renderNotFound() {
  app.innerHTML = `
    <h1 class="title">Bu sayfa defterde yok</h1>
    <p><a href="#/">İçindekiler'e dön</a></p>`;
}

const routes = [
  [/^#\/?$/, () => renderHome()],
  [/^#\/quiz\/([\w-]+)$/, (m) => startStudy(`quiz:${m[1]}`)],
  [/^#\/mix\/([\w-]+)$/, (m) => startStudy(`mix:${m[1]}`)],
  [/^#\/wrong$/, () => startStudy("wrong")],
  [/^#\/exam$/, () => renderExamSetup()],
  [/^#\/exam\/run$/, () => renderExamRun()],
  [/^#\/exam\/result$/, () => renderExamResult()],
];

function router() {
  clearInterval(timer);
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

// ===== Gündüz / gece =====

const themeButton = document.getElementById("theme-toggle");

function currentTheme() {
  const set = document.documentElement.dataset.theme;
  if (set) return set;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function updateThemeButton() {
  themeButton.textContent = currentTheme() === "dark" ? "Gündüz" : "Gece";
}

themeButton.addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("theme", next); } catch (e) {}
  updateThemeButton();
});

updateThemeButton();
