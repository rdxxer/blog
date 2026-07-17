"use strict";

const DATA_URL = "data/answers.json";
const SVG_DIRECTORY = "kanji/";

const screens = {
  home: document.querySelector("#home-screen"),
  quiz: document.querySelector("#quiz-screen"),
  result: document.querySelector("#result-screen"),
};

const elements = {
  gradeGrid: document.querySelector("#grade-grid"),
  quizGrade: document.querySelector("#quiz-grade"),
  progress: document.querySelector("#progress"),
  kanjiStage: document.querySelector("#kanji-stage"),
  loading: document.querySelector("#loading"),
  answerPanel: document.querySelector("#answer-panel"),
  judgement: document.querySelector("#judgement"),
  radicalCharacter: document.querySelector("#radical-character"),
  radicalStrokes: document.querySelector("#radical-strokes"),
  primaryButton: document.querySelector("#primary-button"),
  backButton: document.querySelector("#back-button"),
  resultGrade: document.querySelector("#result-grade"),
  accuracy: document.querySelector("#accuracy"),
  scoreDetail: document.querySelector("#score-detail"),
  wrongCount: document.querySelector("#wrong-count"),
  wrongList: document.querySelector("#wrong-list"),
  retryButton: document.querySelector("#retry-button"),
  homeButton: document.querySelector("#home-button"),
};

const state = {
  data: null,
  gradeKey: null,
  questions: [],
  index: 0,
  selectedPathIds: new Set(),
  strokeElements: new Map(),
  answerVisible: false,
  correctCount: 0,
  wrongAnswers: [],
  renderToken: 0,
};

init();

async function init() {
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) {
      throw new Error(`問題データを読み込めませんでした (${response.status})`);
    }
    state.data = await response.json();
    renderGradeButtons();
  } catch (error) {
    elements.gradeGrid.innerHTML = `<p class="load-error">${escapeHtml(error.message)}</p>`;
  }

  elements.primaryButton.addEventListener("click", handlePrimaryButton);
  elements.backButton.addEventListener("click", showHome);
  elements.homeButton.addEventListener("click", showHome);
  elements.retryButton.addEventListener("click", () => startQuiz(state.gradeKey));
}

function renderGradeButtons() {
  const fragment = document.createDocumentFragment();

  for (const gradeKey of state.data._meta.gradeOrder) {
    const grade = state.data.grades[gradeKey];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "grade-button";
    button.dataset.grade = gradeKey;
    button.innerHTML = `
      <span class="grade-label">${escapeHtml(grade.label)}</span>
      <span class="grade-count">新出 ${grade.count}字</span>
    `;
    button.addEventListener("click", () => startQuiz(gradeKey));
    fragment.append(button);
  }

  elements.gradeGrid.replaceChildren(fragment);
}

function startQuiz(gradeKey) {
  const grade = state.data.grades[gradeKey];
  if (!grade) return;

  state.gradeKey = gradeKey;
  state.questions = shuffle([...grade.kanji]);
  state.index = 0;
  state.correctCount = 0;
  state.wrongAnswers = [];
  state.answerVisible = false;
  elements.quizGrade.textContent = grade.label;
  showScreen("quiz");
  renderQuestion();
}

async function renderQuestion() {
  const token = ++state.renderToken;
  const kanji = currentKanji();
  const answer = state.data.answers[kanji];

  state.selectedPathIds = new Set();
  state.strokeElements = new Map();
  state.answerVisible = false;

  elements.progress.textContent = `${state.index + 1} / ${state.questions.length}`;
  elements.answerPanel.hidden = true;
  elements.judgement.className = "judgement";
  elements.primaryButton.textContent = "答えを見る";
  elements.primaryButton.disabled = true;
  elements.kanjiStage.innerHTML = '<div class="loading">読み込み中…</div>';

  try {
    const response = await fetch(`${SVG_DIRECTORY}${answer.svgFile}`);
    if (!response.ok) {
      throw new Error(`SVGを読み込めませんでした (${response.status})`);
    }
    const rawSvg = await response.text();
    if (token !== state.renderToken) return;

    const svg = parseSvg(rawSvg);
    prepareInteractiveSvg(svg);
    elements.kanjiStage.replaceChildren(svg);
    elements.primaryButton.disabled = false;
    prefetchNextSvg();
  } catch (error) {
    if (token !== state.renderToken) return;
    elements.kanjiStage.innerHTML = `<div class="load-error">${escapeHtml(error.message)}</div>`;
    elements.primaryButton.disabled = true;
  }
}

function parseSvg(rawSvg) {
  const withoutDeclaration = rawSvg
    .replace(/<\?xml[\s\S]*?\?>/i, "")
    .replace(/<!DOCTYPE[\s\S]*?\]>/i, "")
    .replace(/<!DOCTYPE[^>]*>/i, "");

  const documentNode = new DOMParser().parseFromString(withoutDeclaration, "image/svg+xml");
  const parseError = documentNode.querySelector("parsererror");
  if (parseError) {
    throw new Error("SVGの解析に失敗しました");
  }

  const svg = documentNode.documentElement;
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.setAttribute("viewBox", svg.getAttribute("viewBox") || "0 0 109 109");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${currentKanji()}の画。部首に当たる画を選択してください。`);

  for (const group of [...svg.querySelectorAll("g")]) {
    if ((group.id || "").includes("StrokeNumbers")) {
      group.remove();
    }
  }

  return document.importNode(svg, true);
}

function prepareInteractiveSvg(svg) {
  const paths = [...svg.querySelectorAll("path[id]")];

  for (const path of paths) {
    const pathId = path.id;
    path.classList.add("stroke-line");
    path.removeAttribute("style");
    state.strokeElements.set(pathId, path);

    const hitPath = path.cloneNode(false);
    hitPath.removeAttribute("id");
    hitPath.removeAttribute("style");
    hitPath.classList.remove("stroke-line");
    hitPath.classList.add("hit-line");
    hitPath.dataset.pathId = pathId;
    hitPath.setAttribute("role", "button");
    hitPath.setAttribute("tabindex", "0");
    hitPath.setAttribute("aria-label", `${strokeNumberFromId(pathId)}画目`);
    hitPath.setAttribute("aria-pressed", "false");

    hitPath.addEventListener("click", () => toggleStroke(pathId, hitPath));
    hitPath.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleStroke(pathId, hitPath);
      }
    });

    path.after(hitPath);
  }
}

function toggleStroke(pathId, hitPath) {
  if (state.answerVisible) return;

  const path = state.strokeElements.get(pathId);
  if (!path) return;

  if (state.selectedPathIds.has(pathId)) {
    state.selectedPathIds.delete(pathId);
    path.classList.remove("is-selected");
    hitPath.setAttribute("aria-pressed", "false");
  } else {
    state.selectedPathIds.add(pathId);
    path.classList.add("is-selected");
    hitPath.setAttribute("aria-pressed", "true");
  }
}

function handlePrimaryButton() {
  if (state.answerVisible) {
    if (state.index + 1 >= state.questions.length) {
      showResult();
    } else {
      state.index += 1;
      renderQuestion();
    }
    return;
  }

  revealAnswer();
}

function revealAnswer() {
  const kanji = currentKanji();
  const answer = state.data.answers[kanji];
  const correctPathIds = new Set(answer.radical.pathIds);
  const isCorrect = setsEqual(state.selectedPathIds, correctPathIds);

  state.answerVisible = true;
  if (isCorrect) {
    state.correctCount += 1;
  } else {
    state.wrongAnswers.push({
      kanji,
      radical: answer.radical.element,
    });
  }

  for (const [pathId, path] of state.strokeElements) {
    path.classList.remove("is-selected");
    if (correctPathIds.has(pathId)) {
      path.classList.add("is-correct");
    } else if (state.selectedPathIds.has(pathId)) {
      path.classList.add("is-wrong");
    }
  }

  for (const hitPath of elements.kanjiStage.querySelectorAll(".hit-line")) {
    hitPath.removeAttribute("tabindex");
  }

  elements.judgement.textContent = isCorrect ? "正解" : "不正解";
  elements.judgement.className = `judgement ${isCorrect ? "correct" : "wrong"}`;
  elements.radicalCharacter.textContent = answer.radical.element;
  elements.radicalStrokes.textContent = `部首に当たる画：${answer.radical.strokeNumbers.join("・")}画目`;
  elements.answerPanel.hidden = false;
  elements.primaryButton.textContent = state.index + 1 >= state.questions.length ? "結果を見る" : "次へ";
}

function showResult() {
  const total = state.questions.length;
  const percent = total === 0 ? 0 : (state.correctCount / total) * 100;
  const grade = state.data.grades[state.gradeKey];

  elements.resultGrade.textContent = grade.label;
  elements.accuracy.textContent = `${formatPercent(percent)}%`;
  elements.scoreDetail.textContent = `${total}問中 ${state.correctCount}問正解`;
  elements.wrongCount.textContent = `${state.wrongAnswers.length}字`;
  renderWrongAnswers();
  showScreen("result");
}

function renderWrongAnswers() {
  const fragment = document.createDocumentFragment();

  if (state.wrongAnswers.length === 0) {
    const message = document.createElement("p");
    message.className = "perfect-message";
    message.textContent = "全問正解！";
    fragment.append(message);
  } else {
    for (const item of state.wrongAnswers) {
      const card = document.createElement("div");
      card.className = "wrong-item";
      card.innerHTML = `
        <span class="wrong-kanji">${escapeHtml(item.kanji)}</span>
        <span class="wrong-radical">部首：${escapeHtml(item.radical)}</span>
      `;
      fragment.append(card);
    }
  }

  elements.wrongList.replaceChildren(fragment);
}

function showHome() {
  state.renderToken += 1;
  showScreen("home");
}

function showScreen(name) {
  for (const [screenName, element] of Object.entries(screens)) {
    element.hidden = screenName !== name;
  }
  window.scrollTo({ top: 0, behavior: "auto" });
}

function currentKanji() {
  return state.questions[state.index];
}

function prefetchNextSvg() {
  const nextKanji = state.questions[state.index + 1];
  if (!nextKanji) return;
  const nextAnswer = state.data.answers[nextKanji];
  fetch(`${SVG_DIRECTORY}${nextAnswer.svgFile}`).catch(() => {});
}

function setsEqual(left, right) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function shuffle(values) {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

function strokeNumberFromId(pathId) {
  return pathId.match(/-s(\d+)$/)?.[1] || "?";
}

function formatPercent(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
