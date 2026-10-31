// Quiz Defteri — uygulama mantığı.
// Hangi sayfanın çizileceğine adres çubuğundaki "#"'den sonraki kısım karar verir
// (hash routing): "#/" İçindekiler, "#/quiz/yeni-3" Yeni Quiz 3 gibi.

const DATA = window.QUIZ_DATA;
const app = document.getElementById("app");

// Her quize id ile hızlı ulaşmak için bir sözlük kur: "eski-4" -> quiz nesnesi
const quizById = {};
for (const source of DATA.sources) {
  for (const quiz of source.quizzes) {
    quiz.source = source;
    quizById[quiz.id] = quiz;
  }
}

// Soru metinleri HTML'e yazılmadan önce < > & " karakterleri zararsız hale getirilir
function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function countQuestions(quizzes) {
  return quizzes.reduce((sum, quiz) => sum + quiz.questions.length, 0);
}

// ===== Sayfalar =====

function renderHome() {
  const all = DATA.sources.flatMap((s) => s.quizzes);
  const sections = DATA.sources.map((source) => `
    <section>
      <h2 class="title">${esc(source.title)}</h2>
      <ol class="toc">
        ${source.quizzes.map((quiz) => `
          <li>
            <a href="#/quiz/${quiz.id}">
              <span class="toc-no">${quiz.no}.</span>
              <span class="toc-title">${esc(quiz.title)}</span>
              <span class="toc-dots"></span>
              <span class="toc-count">${quiz.questions.length} soru</span>
            </a>
          </li>`).join("")}
      </ol>
      <a class="mix-link" href="#/mix/${source.id}">Bu quizlerin hepsinden karışık →</a>
    </section>`).join(`<p class="ornament" aria-hidden="true">❦</p>`);

  app.innerHTML = `
    <h1 class="title">İçindekiler</h1>
    <p class="muted">${countQuestions(all)} soru, ${DATA.sources.length} defter.
      Bir bölüm seç ya da <a href="#/mix/all">tüm sorulardan karışık</a> çöz.</p>
    ${sections}`;
}

function renderQuiz(id) {
  const quiz = quizById[id];
  if (!quiz) return renderNotFound();

  const types = { mc: 0, tf: 0, open: 0 };
  quiz.questions.forEach((q) => types[q.type]++);
  const parts = [
    types.mc && `${types.mc} çoktan seçmeli`,
    types.tf && `${types.tf} doğru/yanlış`,
    types.open && `${types.open} açık uçlu`,
  ].filter(Boolean);

  app.innerHTML = `
    <a class="back" href="#/">← İçindekiler</a>
    <h1 class="title">${esc(quiz.title)}</h1>
    <p class="muted">${esc(quiz.source.title)} · Quiz ${quiz.no} · ${parts.join(", ")}</p>
    ${quiz.summary ? `
      <details class="summary">
        <summary>Konu özeti</summary>
        <p>${esc(quiz.summary)}</p>
      </details>` : ""}
    <p><em>Sorular bir sonraki adımda burada olacak.</em></p>`;
}

function renderMix(sourceId) {
  const source = DATA.sources.find((s) => s.id === sourceId);
  if (sourceId !== "all" && !source) return renderNotFound();
  const title = source ? `${source.title}: karışık` : "Tüm sorular: karışık";
  const total = countQuestions(source ? source.quizzes : DATA.sources.flatMap((s) => s.quizzes));

  app.innerHTML = `
    <a class="back" href="#/">← İçindekiler</a>
    <h1 class="title">${esc(title)}</h1>
    <p class="muted">${total} soru arasından</p>
    <p><em>Karışık çözme bir sonraki adımda burada olacak.</em></p>`;
}

function renderNotFound() {
  app.innerHTML = `
    <h1 class="title">Bu sayfa defterde yok</h1>
    <p><a href="#/">İçindekiler'e dön</a></p>`;
}

// ===== Yönlendirme (routing) =====

const routes = [
  [/^#\/?$/, () => renderHome()],
  [/^#\/quiz\/([\w-]+)$/, (m) => renderQuiz(m[1])],
  [/^#\/mix\/([\w-]+)$/, (m) => renderMix(m[1])],
];

function router() {
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
