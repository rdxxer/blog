/* 멀티플레이 색 맞히기
   - 제출 전 guess 미리보기 없음
   - 제출 후 잠깐(기본 2초) guess 색 보여준 다음:
     - 마지막 플레이어면 -> 바로 결과 화면
     - 아니면 -> 5초 오버레이 후 다음 플레이어
*/

function log(...args) {
  const ts = new Date().toISOString().slice(11, 23)
  console.log(`[ColorGame ${ts}]`, ...args)
}

const $ = (sel) => document.querySelector(sel)

const els = {
  // views
  viewSetup: $('#viewSetup'),
  viewGame: $('#viewGame'),
  viewResults: $('#viewResults'),

  // setup
  numPlayers: $('#numPlayers'),
  timeLimit: $('#timeLimit'),
  playerNames: $('#playerNames'),
  startBtn: $('#startBtn'),

  // game
  turnPill: $('#turnPill'),
  playerTitle: $('#playerTitle'),
  timerText: $('#timerText'),
  targetMeta: $('#targetMeta'),
  targetSwatch: $('#targetSwatch'),
  modePill: $('#modePill'),
  guessSwatch: $('#guessSwatch'),

  rgbInputs: $('#rgbInputs'),
  hslInputs: $('#hslInputs'),
  r: $('#r'),
  g: $('#g'),
  b: $('#b'),
  h: $('#h'),
  s: $('#s'),
  l: $('#l'),

  guessForm: $('#guessForm'),
  submitBtn: $('#submitBtn'),
  resultBox: $('#resultBox'),

  // overlay
  overlay: $('#overlay'),
  overlayTitle: $('#overlayTitle'),
  overlayTime: $('#overlayTime'),

  // results
  resultsTbody: $('#resultsTable tbody'),
  restartBtn: $('#restartBtn'),
}

const REVEAL_AFTER_SUBMIT_MS = 2000 // 제출 색 보여주는 시간(원하면 3000 등으로)
const OVERLAY_WAIT_SEC = 5 // 다음 사람 준비 시간
const TIMEOUT_PAUSE_MS = 800 // 시간초과 후 너무 휙 넘어가지 않게 살짝만

const state = {
  mode: 'rgb',
  timeLimitSec: 25,
  players: [], // { name, targetRGB, guessRGB, de, score, status }
  currentIdx: 0,

  timerId: null,
  phase: 'idle', // idle | guessing | reveal | overlay | done
  overlayId: null,
  postTurnId: null,
}

function clamp(x, lo, hi) {
  const v = Number.isFinite(x) ? x : lo
  return Math.min(hi, Math.max(lo, v))
}

function showView(which) {
  els.viewSetup.classList.toggle('hidden', which !== 'setup')
  els.viewGame.classList.toggle('hidden', which !== 'game')
  els.viewResults.classList.toggle('hidden', which !== 'results')
  log('showView:', which)
}

function isLastTurn() {
  return state.currentIdx === state.players.length - 1
}

function clearPostTurnTimer() {
  if (state.postTurnId) {
    clearTimeout(state.postTurnId)
    state.postTurnId = null
    log('postTurn timer cleared')
  }
}

/* -----------------------------
   색 생성/표현
----------------------------- */
function randomRGB() {
  return {
    r: Math.floor(Math.random() * 256),
    g: Math.floor(Math.random() * 256),
    b: Math.floor(Math.random() * 256),
  }
}
function rgbToCss(rgb) {
  return `rgb(${clamp(Math.round(rgb.r), 0, 255)}, ${clamp(
    Math.round(rgb.g),
    0,
    255
  )}, ${clamp(Math.round(rgb.b), 0, 255)})`
}

/* -----------------------------
   HSL <-> RGB
----------------------------- */
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360
  s = clamp(s, 0, 100) / 100
  l = clamp(l, 0, 100) / 100

  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))

  let r1 = 0,
    g1 = 0,
    b1 = 0
  if (0 <= hp && hp < 1) [r1, g1, b1] = [c, x, 0]
  else if (1 <= hp && hp < 2) [r1, g1, b1] = [x, c, 0]
  else if (2 <= hp && hp < 3) [r1, g1, b1] = [0, c, x]
  else if (3 <= hp && hp < 4) [r1, g1, b1] = [0, x, c]
  else if (4 <= hp && hp < 5) [r1, g1, b1] = [x, 0, c]
  else [r1, g1, b1] = [c, 0, x]

  const m = l - c / 2
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  }
}

/* -----------------------------
   ΔE(1976) 계산
   sRGB -> linear -> XYZ(D65) -> Lab
----------------------------- */
function srgbToLinear(c) {
  c = clamp(c, 0, 255) / 255
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
function rgbToXyz({ r, g, b }) {
  const R = srgbToLinear(r)
  const G = srgbToLinear(g)
  const B = srgbToLinear(b)

  const X = R * 0.4124564 + G * 0.3575761 + B * 0.1804375
  const Y = R * 0.2126729 + G * 0.7151522 + B * 0.072175
  const Z = R * 0.0193339 + G * 0.119192 + B * 0.9503041
  return { X, Y, Z }
}
function fLab(t) {
  const delta = 6 / 29
  return t > Math.pow(delta, 3)
    ? Math.cbrt(t)
    : t / (3 * Math.pow(delta, 2)) + 4 / 29
}
function xyzToLab({ X, Y, Z }) {
  const Xn = 0.95047,
    Yn = 1.0,
    Zn = 1.08883 // D65
  const fx = fLab(X / Xn)
  const fy = fLab(Y / Yn)
  const fz = fLab(Z / Zn)
  const L = 116 * fy - 16
  const a = 500 * (fx - fy)
  const b = 200 * (fy - fz)
  return { L, a, b }
}
function deltaE76(rgb1, rgb2) {
  const lab1 = xyzToLab(rgbToXyz(rgb1))
  const lab2 = xyzToLab(rgbToXyz(rgb2))
  const dL = lab1.L - lab2.L
  const da = lab1.a - lab2.a
  const db = lab1.b - lab2.b
  return Math.sqrt(dL * dL + da * da + db * db)
}
function scoreFromDeltaE(de) {
  if (!Number.isFinite(de)) return 0
  return clamp(100 - de, 0, 100)
}

/* -----------------------------
   입력
----------------------------- */
function setInputsEnabled(on) {
  const all = [
    els.r,
    els.g,
    els.b,
    els.h,
    els.s,
    els.l,
    ...document.querySelectorAll("input[name='mode']"),
  ]
  all.forEach((x) => x && (x.disabled = !on))
  els.submitBtn.disabled = !on
}

function setMode(mode) {
  state.mode = mode
  els.modePill.textContent = mode.toUpperCase()
  els.rgbInputs.classList.toggle('hidden', mode !== 'rgb')
  els.hslInputs.classList.toggle('hidden', mode !== 'hsl')
  log('setMode:', mode)
}

function readGuessAsRGB() {
  if (state.mode === 'rgb') {
    return {
      r: clamp(parseFloat(els.r.value), 0, 255),
      g: clamp(parseFloat(els.g.value), 0, 255),
      b: clamp(parseFloat(els.b.value), 0, 255),
    }
  }
  const h = clamp(parseFloat(els.h.value), 0, 360)
  const s = clamp(parseFloat(els.s.value), 0, 100)
  const l = clamp(parseFloat(els.l.value), 0, 100)
  return hslToRgb(h, s, l)
}

/* -----------------------------
   타이머
----------------------------- */
function stopTimer() {
  if (state.timerId) {
    clearInterval(state.timerId)
    state.timerId = null
    log('stopTimer')
  }
}

function startTimer(seconds) {
  stopTimer()
  const start = performance.now()

  const render = (leftMs) => {
    const s = Math.max(0, leftMs) / 1000
    els.timerText.textContent = s.toFixed(1) + 's'
  }

  render(seconds * 1000)
  log('startTimer:', seconds, 'sec')

  state.timerId = setInterval(() => {
    const elapsed = performance.now() - start
    const left = Math.floor(seconds * 1000 - elapsed)
    render(left)

    if (left <= 0) {
      stopTimer()
      onTimeout()
    }
  }, 100)
}

/* -----------------------------
   Setup
----------------------------- */
function buildNameInputs(n) {
  els.playerNames.innerHTML = ''
  for (let i = 0; i < n; i++) {
    const wrap = document.createElement('div')
    wrap.className = 'field'
    const lab = document.createElement('label')
    lab.textContent = `Player ${i + 1}`
    const inp = document.createElement('input')
    inp.type = 'text'
    inp.placeholder = `Player ${i + 1}`
    inp.maxLength = 24
    wrap.appendChild(lab)
    wrap.appendChild(inp)
    els.playerNames.appendChild(wrap)
  }
  log('buildNameInputs:', n)
}

function getPlayerNames(n) {
  const inputs = els.playerNames.querySelectorAll('input')
  const names = []
  for (let i = 0; i < n; i++) {
    const raw = inputs[i]?.value ?? ''
    names.push(raw.trim() || `Player ${i + 1}`)
  }
  return names
}

function initGameFromSetup() {
  const n = clamp(parseInt(els.numPlayers.value, 10), 1, 50)
  const t = clamp(parseInt(els.timeLimit.value, 10), 3, 300)

  state.timeLimitSec = t
  const names = getPlayerNames(n)

  state.players = names.map((name) => ({
    name,
    targetRGB: null,
    guessRGB: null,
    de: Infinity,
    score: 0,
    status: '미진행',
  }))

  state.currentIdx = 0
  state.phase = 'idle'
  log('initGameFromSetup:', { n, t, names })
}

function startGame() {
  initGameFromSetup()
  showView('game')
  startTurn()
}

/* -----------------------------
   Swatch 보여주기/숨기기
----------------------------- */
function hideGuessSwatch() {
  els.guessSwatch.classList.add('placeholder')
  els.guessSwatch.style.background = ''
}

function revealGuessSwatch(rgb) {
  els.guessSwatch.classList.remove('placeholder')
  els.guessSwatch.style.background = rgbToCss(rgb)
}

/* -----------------------------
   게임 진행
----------------------------- */
function startTurn() {
  clearPostTurnTimer()
  clearOverlayInterval()

  const p = state.players[state.currentIdx]
  if (!p) return

  state.phase = 'guessing'

  p.targetRGB = randomRGB()
  p.guessRGB = null
  p.de = Infinity
  p.score = 0
  p.status = '진행중'

  els.turnPill.textContent = `Turn ${state.currentIdx + 1} / ${
    state.players.length
  }`
  els.playerTitle.textContent = p.name
  els.targetMeta.textContent = 'random'
  els.targetSwatch.style.background = rgbToCss(p.targetRGB)

  hideGuessSwatch()

  // 입력값 초기화
  els.r.value = 128
  els.g.value = 128
  els.b.value = 128
  els.h.value = 180
  els.s.value = 50
  els.l.value = 50

  setInputsEnabled(true)
  els.resultBox.textContent = '제출하면 내 색이 공개됨.'

  log('startTurn:', state.currentIdx, p.name, 'targetRGB=', p.targetRGB)

  startTimer(state.timeLimitSec)
}

function submitCurrent() {
  if (state.phase !== 'guessing') return

  const p = state.players[state.currentIdx]
  if (!p) return

  stopTimer()
  setInputsEnabled(false)

  const guess = readGuessAsRGB()
  const target = p.targetRGB

  const guessRGB = {
    r: Math.round(guess.r),
    g: Math.round(guess.g),
    b: Math.round(guess.b),
  }
  const de = deltaE76(guessRGB, target)
  const score = scoreFromDeltaE(de)

  p.guessRGB = guessRGB
  p.de = de
  p.score = score
  p.status = '성공'

  // 제출 후에만 내 색 공개
  revealGuessSwatch(guessRGB)

  els.resultBox.innerHTML =
    `<div><b>저장 완료!</b></div>` +
    `<div>ΔE: <b>${de.toFixed(2)}</b> / 점수: <b>${score.toFixed(1)}</b></div>`

  log('submitCurrent:', p.name, { de, score, guessRGB, targetRGB: target })

  // ✅ 오버레이 뜨기 전에, 내 색 보여줄 시간 확보
  state.phase = 'reveal'
  clearPostTurnTimer()
  state.postTurnId = setTimeout(() => {
    if (isLastTurn()) {
      // 마지막이면 오버레이 없이 바로 결과로
      finishGame()
    } else {
      // 아니면 오버레이로 넘어감
      beginOverlay()
    }
  }, REVEAL_AFTER_SUBMIT_MS)
}

function onTimeout() {
  if (state.phase !== 'guessing') return

  const p = state.players[state.currentIdx]
  if (!p) return

  stopTimer()
  setInputsEnabled(false)

  p.guessRGB = null
  p.de = Infinity
  p.score = 0
  p.status = '시간초과'

  hideGuessSwatch()
  els.resultBox.innerHTML = `<div><b>시간초과!</b></div>`

  log('timeout:', p.name)

  // 시간초과는 굳이 오래 보여줄 건 없어서 짧게만
  state.phase = 'reveal'
  clearPostTurnTimer()
  state.postTurnId = setTimeout(() => {
    if (isLastTurn()) finishGame()
    else beginOverlay()
  }, TIMEOUT_PAUSE_MS)
}

/* -----------------------------
   오버레이(다음 사람 준비) - 마지막엔 절대 안 뜸
----------------------------- */
function beginOverlay() {
  state.phase = 'overlay'
  showOverlayForNext(OVERLAY_WAIT_SEC)
}

function clearOverlayInterval() {
  if (state.overlayId) {
    clearInterval(state.overlayId)
    state.overlayId = null
    log('overlay cleared')
  }
}

function showOverlayForNext(seconds) {
  // 여기 호출되는 경우는 "마지막이 아님"이 보장됨
  clearOverlayInterval()

  els.overlay.classList.remove('hidden')
  els.overlayTitle.textContent = '다음 사람 준비'

  let left = seconds
  els.overlayTime.textContent = String(left)

  log('overlay start:', { seconds })

  state.overlayId = setInterval(() => {
    left -= 1
    els.overlayTime.textContent = String(Math.max(0, left))
    if (left <= 0) {
      clearOverlayInterval()
      els.overlay.classList.add('hidden')
      goNext()
    }
  }, 1000)
}

function goNext() {
  state.currentIdx += 1
  if (state.currentIdx >= state.players.length) {
    finishGame()
    return
  }
  log('goNext -> next turn:', state.currentIdx)
  startTurn()
}

function finishGame() {
  state.phase = 'done'
  stopTimer()
  clearOverlayInterval()
  clearPostTurnTimer()
  log('finishGame')
  renderResults()
  showView('results')
}

/* -----------------------------
   결과 렌더링
----------------------------- */
function renderResults() {
  const arr = state.players
    .map((p, i) => ({ ...p, idx: i }))
    .sort((a, b) => {
      const fa = Number.isFinite(a.de),
        fb = Number.isFinite(b.de)
      if (fa && fb) return a.de - b.de
      if (fa && !fb) return -1
      if (!fa && fb) return 1
      return 0
    })

  els.resultsTbody.innerHTML = ''

  arr.forEach((p, rank) => {
    const tr = document.createElement('tr')

    const tdRank = document.createElement('td')
    tdRank.textContent = String(rank + 1)

    const tdName = document.createElement('td')
    tdName.textContent = p.name

    const tdDe = document.createElement('td')
    tdDe.textContent = Number.isFinite(p.de) ? p.de.toFixed(2) : '∞'

    const tdScore = document.createElement('td')
    tdScore.textContent = p.score.toFixed(1)

    const tdStatus = document.createElement('td')
    tdStatus.textContent = p.status

    const tdTarget = document.createElement('td')
    const tbox = document.createElement('div')
    tbox.className = 'swatchMini'
    tbox.style.background = p.targetRGB ? rgbToCss(p.targetRGB) : 'transparent'
    tdTarget.appendChild(tbox)

    const tdGuess = document.createElement('td')
    const gbox = document.createElement('div')
    gbox.className = 'swatchMini'
    gbox.style.background = p.guessRGB ? rgbToCss(p.guessRGB) : 'transparent'
    tdGuess.appendChild(gbox)

    tr.appendChild(tdRank)
    tr.appendChild(tdName)
    tr.appendChild(tdDe)
    tr.appendChild(tdScore)
    tr.appendChild(tdStatus)
    tr.appendChild(tdTarget)
    tr.appendChild(tdGuess)

    els.resultsTbody.appendChild(tr)
  })

  log('renderResults done')
}

/* -----------------------------
   이벤트
----------------------------- */
function wireModeRadios() {
  document.querySelectorAll("input[name='mode']").forEach((radio) => {
    radio.addEventListener('change', (e) => setMode(e.target.value))
  })
}

els.numPlayers.addEventListener('input', () => {
  const n = clamp(parseInt(els.numPlayers.value, 10), 1, 50)
  buildNameInputs(n)
})

els.startBtn.addEventListener('click', () => {
  log('Start button clicked')
  startGame()
})

els.guessForm.addEventListener('submit', (e) => {
  e.preventDefault()
  submitCurrent()
})

els.restartBtn.addEventListener('click', () => {
  log('Restart button clicked')
  stopTimer()
  clearOverlayInterval()
  clearPostTurnTimer()

  state.players = []
  state.currentIdx = 0
  state.phase = 'idle'

  showView('setup')
})

/* 초기화 */
;(function init() {
  log('init')
  buildNameInputs(clamp(parseInt(els.numPlayers.value, 10), 1, 50))
  wireModeRadios()
  setMode('rgb')
  showView('setup')
})()
