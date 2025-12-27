/* 색 맞히기 게임 (RGB/HSL)
   변경사항:
   - 라운드 표시 제거
   - 제출하면 정답 값 자동 공개
   - 제출 후에만 "다음 색상" 버튼으로 진행 가능 (자동 진행 없음)
   - footer 제거 (HTML에서)
*/

console.log('[ColorGame] script loaded')

const $ = (sel) => document.querySelector(sel)

const els = {
  targetSwatch: $('#targetSwatch'),
  guessSwatch: $('#guessSwatch'),
  targetHint: $('#targetHint'),
  guessHint: $('#guessHint'),
  resultBox: $('#resultBox'),

  rgbInputs: $('#rgbInputs'),
  hslInputs: $('#hslInputs'),
  modePill: $('#modePill'),

  form: $('#guessForm'),
  nextBtn: $('#nextBtn'),

  r: $('#r'),
  g: $('#g'),
  b: $('#b'),
  h: $('#h'),
  s: $('#s'),
  l: $('#l'),

  bestScore: $('#bestScore'),
  avgScore: $('#avgScore'),
  lastDE: $('#lastDE'),
  tries: $('#tries'),
}

const state = {
  mode: 'rgb',
  targetRGB: { r: 0, g: 0, b: 0 },
  scores: [],
  submitted: false,
}

function clamp(x, lo, hi) {
  const v = Number.isFinite(x) ? x : lo
  return Math.min(hi, Math.max(lo, v))
}

function rgbToCss({ r, g, b }) {
  return `rgb(${clamp(Math.round(r), 0, 255)}, ${clamp(
    Math.round(g),
    0,
    255
  )}, ${clamp(Math.round(b), 0, 255)})`
}

function randomRGB() {
  const r = Math.floor(Math.random() * 256)
  const g = Math.floor(Math.random() * 256)
  const b = Math.floor(Math.random() * 256)
  return { r, g, b }
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

function rgbToHsl(r, g, b) {
  r = clamp(r, 0, 255) / 255
  g = clamp(g, 0, 255) / 255
  b = clamp(b, 0, 255) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min

  let h = 0
  if (d === 0) h = 0
  else if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4

  h = Math.round((h * 60 + 360) % 360)

  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))

  return { h, s: Math.round(s * 100), l: Math.round(l * 100) }
}

/* -----------------------------
   ΔE (Lab) 계산용 변환
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
  const Xn = 0.95047
  const Yn = 1.0
  const Zn = 1.08883

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

function rgbDistance(rgb1, rgb2) {
  const dr = rgb1.r - rgb2.r
  const dg = rgb1.g - rgb2.g
  const db = rgb1.b - rgb2.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function scoreFromDeltaE(de) {
  return clamp(100 - de, 0, 100)
}

/* -----------------------------
   UI + 게임 로직
----------------------------- */
function setMode(mode) {
  state.mode = mode
  console.log('[ColorGame] setMode:', mode)

  els.modePill.textContent = mode.toUpperCase()
  if (mode === 'rgb') {
    els.rgbInputs.classList.remove('hidden')
    els.hslInputs.classList.add('hidden')
  } else {
    els.hslInputs.classList.remove('hidden')
    els.rgbInputs.classList.add('hidden')
  }

  updateGuessPreview()
}

function newProblem() {
  state.targetRGB = randomRGB()
  state.submitted = false

  console.log('[ColorGame] newProblem targetRGB=', state.targetRGB)

  els.targetSwatch.style.background = rgbToCss(state.targetRGB)
  els.targetHint.textContent = '제출하면 정답 RGB/HSL 값이 여기 뜸'
  els.resultBox.textContent =
    '값을 입력하고 제출해봐. (제출 후에만 다음 색상 가능)'

  els.nextBtn.disabled = true
  updateGuessPreview()
}

function readGuessAsRGB() {
  if (state.mode === 'rgb') {
    const r = clamp(parseFloat(els.r.value), 0, 255)
    const g = clamp(parseFloat(els.g.value), 0, 255)
    const b = clamp(parseFloat(els.b.value), 0, 255)
    return { r, g, b }
  }

  const h = clamp(parseFloat(els.h.value), 0, 360)
  const s = clamp(parseFloat(els.s.value), 0, 100)
  const l = clamp(parseFloat(els.l.value), 0, 100)
  return hslToRgb(h, s, l)
}

function updateGuessPreview() {
  const guess = readGuessAsRGB()
  els.guessSwatch.style.background = rgbToCss(guess)

  const asHsl = rgbToHsl(guess.r, guess.g, guess.b)
  els.guessHint.textContent =
    `미리보기 RGB(${Math.round(guess.r)}, ${Math.round(guess.g)}, ${Math.round(
      guess.b
    )}) / ` + `HSL(${asHsl.h}, ${asHsl.s}%, ${asHsl.l}%)`

  console.log('[ColorGame] preview guessRGB=', guess, 'guessHSL=', asHsl)
}

function updateStats(de, score) {
  state.scores.push(score)
  const best = Math.max(...state.scores)
  const avg = state.scores.reduce((a, b) => a + b, 0) / state.scores.length

  els.bestScore.textContent = best.toFixed(1)
  els.avgScore.textContent = avg.toFixed(1)
  els.lastDE.textContent = de.toFixed(2)
  els.tries.textContent = String(state.scores.length)
}

function submitGuess() {
  if (state.submitted) {
    console.log('[ColorGame] submit ignored (already submitted)')
    return
  }

  const guessRGB = readGuessAsRGB()
  const target = state.targetRGB

  const de = deltaE76(guessRGB, target)
  const dist = rgbDistance(guessRGB, target)
  const score = scoreFromDeltaE(de)

  const dr = Math.round(guessRGB.r - target.r)
  const dg = Math.round(guessRGB.g - target.g)
  const db = Math.round(guessRGB.b - target.b)

  const targetHsl = rgbToHsl(target.r, target.g, target.b)

  console.log('[ColorGame] submit:', {
    guessRGB,
    target,
    de,
    dist,
    score,
    dr,
    dg,
    db,
    targetHsl,
  })

  // 제출하면 정답 값 바로 공개
  els.targetHint.textContent =
    `정답 RGB(${target.r}, ${target.g}, ${target.b}) / ` +
    `HSL(${targetHsl.h}, ${targetHsl.s}%, ${targetHsl.l}%)`

  els.resultBox.innerHTML =
    `<div class="line"><b>점수:</b> ${score.toFixed(1)} / 100</div>` +
    `<div class="line"><b>ΔE(1976):</b> ${de.toFixed(
      2
    )} (작을수록 더 비슷)</div>` +
    `<div class="line"><b>RGB 거리:</b> ${dist.toFixed(2)}</div>` +
    `<div class="line"><b>채널 차이(내값-정답):</b> R ${
      dr >= 0 ? '+' : ''
    }${dr}, ` +
    `G ${dg >= 0 ? '+' : ''}${dg}, B ${db >= 0 ? '+' : ''}${db}</div>` +
    `<div class="line" style="margin-top:6px; color: rgba(233,236,255,.75);">` +
    `이제 <b>다음 색상</b> 눌러서 넘어가면 돼.</div>`

  updateStats(de, score)

  state.submitted = true
  els.nextBtn.disabled = false
}

function nextProblem() {
  if (!state.submitted) {
    console.log('[ColorGame] next blocked (not submitted yet)')
    els.resultBox.textContent = '먼저 제출해야 다음 색상으로 넘어갈 수 있어.'
    return
  }
  console.log('[ColorGame] nextProblem')
  newProblem()
}

/* -----------------------------
   이벤트 연결
----------------------------- */
document.querySelectorAll("input[name='mode']").forEach((radio) => {
  radio.addEventListener('change', (e) => setMode(e.target.value))
})

;['r', 'g', 'b', 'h', 's', 'l'].forEach((id) => {
  const el = $('#' + id)
  el.addEventListener('input', updateGuessPreview)
})

els.form.addEventListener('submit', (e) => {
  e.preventDefault()
  submitGuess()
})

els.nextBtn.addEventListener('click', () => {
  nextProblem()
})

/* 초기화 */
setMode('rgb')
newProblem()
