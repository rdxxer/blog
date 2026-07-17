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
  hitElements: new Map(),
  answerVisible: false,
  correctCount: 0,
  wrongAnswers: [],
  renderToken: 0,
  dragSelection: null,
  suppressStrokeClick: false,
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
  state.hitElements = new Map();
  state.dragSelection = null;
  state.suppressStrokeClick = false;
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
    state.hitElements.set(pathId, hitPath);

    hitPath.addEventListener("click", () => {
      if (state.suppressStrokeClick) return;
      toggleStroke(pathId, hitPath);
    });
    hitPath.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleStroke(pathId, hitPath);
      }
    });

    path.after(hitPath);
  }

  const selectionRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  selectionRect.classList.add("selection-rect");
  selectionRect.setAttribute("pointer-events", "none");
  hideSelectionRect(selectionRect);
  svg.append(selectionRect);

  installDragSelection(svg, selectionRect);
}

function installDragSelection(svg, selectionRect) {
  const dragThreshold = 6;

  svg.addEventListener("pointerdown", (event) => {
    if (state.answerVisible || event.button !== 0 || state.dragSelection) return;

    const hitPath = event.target instanceof Element
      ? event.target.closest(".hit-line")
      : null;

    state.dragSelection = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPoint: clientPointToSvg(svg, event.clientX, event.clientY),
      clickPathId: hitPath?.dataset.pathId || null,
      dragging: false,
    };

    svg.setPointerCapture(event.pointerId);
  });

  svg.addEventListener("pointermove", (event) => {
    const drag = state.dragSelection;
    if (!drag || drag.pointerId !== event.pointerId || state.answerVisible) return;

    const distance = Math.hypot(
      event.clientX - drag.startClientX,
      event.clientY - drag.startClientY,
    );

    if (!drag.dragging && distance < dragThreshold) return;

    drag.dragging = true;
    event.preventDefault();

    const currentPoint = clientPointToSvg(svg, event.clientX, event.clientY);
    updateSelectionRect(selectionRect, normalizedRect(drag.startPoint, currentPoint));
  });

  svg.addEventListener("pointerup", (event) => {
    finishDragSelection(svg, selectionRect, event);
  });

  svg.addEventListener("pointercancel", (event) => {
    finishDragSelection(svg, selectionRect, event, true);
  });

  svg.addEventListener("lostpointercapture", () => {
    // pointerup 처리 밖에서 캡처가 강제로 사라진 경우에도
    // 투명 오버레이와 드래그 상태가 남지 않게 한다.
    cancelDragSelection(selectionRect);
  });
}

function finishDragSelection(svg, selectionRect, event, cancelled = false) {
  const drag = state.dragSelection;
  if (!drag || drag.pointerId !== event.pointerId) return;

  let selectionBounds = null;
  let clickPathId = null;

  try {
    if (drag.dragging && !cancelled && !state.answerVisible) {
      event.preventDefault();
      const currentPoint = clientPointToSvg(svg, event.clientX, event.clientY);
      selectionBounds = normalizedRect(drag.startPoint, currentPoint);
    } else if (!cancelled && !state.answerVisible) {
      clickPathId = drag.clickPathId;
    }
  } finally {
    // 획 교차 판정에서 문제가 생기더라도 먼저 드래그 UI를 완전히 정리한다.
    state.dragSelection = null;
    hideSelectionRect(selectionRect);

    if (svg.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }
  }

  // 포인터 캡처를 사용하면 브라우저의 click 대상이 개별 획이 아니라 SVG가 될 수 있다.
  // 드래그하지 않은 경우에는 pointerdown 때 눌렀던 획을 여기서 직접 토글한다.
  if (clickPathId) {
    const hitPath = state.hitElements.get(clickPathId);
    if (hitPath) toggleStroke(clickPathId, hitPath);

    // 일부 브라우저가 추가로 생성하는 native click에 의한 이중 토글을 막는다.
    state.suppressStrokeClick = true;
    window.setTimeout(() => {
      state.suppressStrokeClick = false;
    }, 0);
    return;
  }

  if (!selectionBounds) return;

  selectStrokesInRect(selectionBounds);

  // 드래그 종료 직후 브라우저가 생성하는 click이 마지막 획을 다시 토글하지 않게 한다.
  state.suppressStrokeClick = true;
  window.setTimeout(() => {
    state.suppressStrokeClick = false;
  }, 0);
}

function cancelDragSelection(selectionRect) {
  state.dragSelection = null;
  hideSelectionRect(selectionRect);
}

function hideSelectionRect(selectionRect) {
  selectionRect.style.display = "none";
  selectionRect.setAttribute("width", "0");
  selectionRect.setAttribute("height", "0");
}

function selectStrokesInRect(rect) {
  for (const [pathId, path] of state.strokeElements) {
    let intersects = false;

    try {
      intersects = pathIntersectsRect(path, rect);
    } catch (error) {
      console.warn(`画 ${pathId} の範囲判定をスキップしました`, error);
    }

    if (!intersects) continue;

    state.selectedPathIds.add(pathId);
    path.classList.add("is-selected");
    state.hitElements.get(pathId)?.setAttribute("aria-pressed", "true");
  }
}

function pathIntersectsRect(path, rect) {
  const bbox = path.getBBox();
  if (!rectsIntersect(rect, bbox)) return false;

  if (
    bbox.x >= rect.x &&
    bbox.y >= rect.y &&
    bbox.x + bbox.width <= rect.x + rect.width &&
    bbox.y + bbox.height <= rect.y + rect.height
  ) {
    return true;
  }

  const length = path.getTotalLength();
  const sampleStep = 1.5;

  for (let distance = 0; distance < length; distance += sampleStep) {
    if (pointInRect(path.getPointAtLength(distance), rect)) return true;
  }

  return pointInRect(path.getPointAtLength(length), rect);
}

function clientPointToSvg(svg, clientX, clientY) {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;

  const matrix = svg.getScreenCTM();
  if (!matrix) return { x: 0, y: 0 };
  return point.matrixTransform(matrix.inverse());
}

function normalizedRect(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function updateSelectionRect(selectionRect, rect) {
  selectionRect.style.display = "";
  selectionRect.setAttribute("x", rect.x);
  selectionRect.setAttribute("y", rect.y);
  selectionRect.setAttribute("width", rect.width);
  selectionRect.setAttribute("height", rect.height);
}

function rectsIntersect(left, right) {
  return !(
    left.x + left.width < right.x ||
    right.x + right.width < left.x ||
    left.y + left.height < right.y ||
    right.y + right.height < left.y
  );
}

function pointInRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
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
