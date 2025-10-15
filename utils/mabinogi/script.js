// ===== Utilities: parsing & color math =====

// parse "#RRGGBB" / "#RGB" / "rgb(r,g,b)" / "RRGGBB"
function parseColorInput(str) {
  if (!str) return null
  const s = str.trim().toLowerCase()

  // ✅ 6자리 hex(해시 없이) 허용: "34a853"
  if (/^[0-9a-f]{6}$/.test(s)) {
    const r = parseInt(s.slice(0, 2), 16)
    const g = parseInt(s.slice(2, 4), 16)
    const b = parseInt(s.slice(4, 6), 16)
    return [r, g, b]
  }

  // #RRGGBB / #RGB
  if (s[0] === '#') {
    const hex = s.slice(1)
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16)
      const g = parseInt(hex[1] + hex[1], 16)
      const b = parseInt(hex[2] + hex[2], 16)
      if ([r, g, b].some(Number.isNaN)) return null
      return [r, g, b]
    } else if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      if ([r, g, b].some(Number.isNaN)) return null
      return [r, g, b]
    } else return null
  }

  // rgb(r,g,b)
  const m = s.match(
    /^rgb\s*\(\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*\)$/i
  )
  if (m) {
    let r = clampInt(parseInt(m[1], 10), 0, 255)
    let g = clampInt(parseInt(m[2], 10), 0, 255)
    let b = clampInt(parseInt(m[3], 10), 0, 255)
    if ([r, g, b].some(Number.isNaN)) return null
    return [r, g, b]
  }

  return null
}
function clampInt(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}
function toHex([r, g, b]) {
  const h = (x) => x.toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}
function toRgbStr([r, g, b]) {
  return `rgb(${r}, ${g}, ${b})`
}

// sRGB 8-bit -> linear (0..1)
function srgb8_to_linear(v) {
  const x = v / 255
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
}
// linear (0..1) -> sRGB 8-bit
function linear_to_srgb8(x) {
  const y = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
  return clampInt(Math.round(y * 255), 0, 255)
}

// sRGB (8-bit) -> XYZ (D65)
function srgb_to_xyz(rgb) {
  const [r8, g8, b8] = rgb
  const r = srgb8_to_linear(r8),
    g = srgb8_to_linear(g8),
    b = srgb8_to_linear(b8)
  const X = 0.41239079926595 * r + 0.35758433938387 * g + 0.18048078840183 * b
  const Y = 0.21263900587151 * r + 0.71516867876775 * g + 0.07219231536073 * b
  const Z = 0.01933081871559 * r + 0.11919477979462 * g + 0.95053215224966 * b
  return [X, Y, Z]
}

// XYZ (D65) -> Lab (D65)
function xyz_to_lab([X, Y, Z]) {
  const Xn = 0.95047,
    Yn = 1.0,
    Zn = 1.08883
  const fx = f_xyz(X / Xn),
    fy = f_xyz(Y / Yn),
    fz = f_xyz(Z / Zn)
  const L = 116 * fy - 16
  const a = 500 * (fx - fy)
  const b = 200 * (fy - fz)
  return [L, a, b]
}
function f_xyz(t) {
  const e = 216 / 24389
  const k = 24389 / 27
  return t > e ? Math.cbrt(t) : t * (k / 116) + 16 / 116
}
function rgb_to_lab(rgb) {
  return xyz_to_lab(srgb_to_xyz(rgb))
}

// ΔE76
function deltaE76(lab1, lab2) {
  const dl = lab1[0] - lab2[0],
    da = lab1[1] - lab2[1],
    db = lab1[2] - lab2[2]
  return Math.hypot(dl, da, db)
}

// ΔE2000
function deltaE00(lab1, lab2) {
  const [L1, a1, b1] = lab1,
    [L2, a2, b2] = lab2
  const kL = 1,
    kC = 1,
    kH = 1
  const C1 = Math.hypot(a1, b1),
    C2 = Math.hypot(a2, b2)
  const Cbar = (C1 + C2) / 2
  const G =
    0.5 *
    (1 - Math.sqrt(Math.pow(Cbar, 7) / (Math.pow(Cbar, 7) + Math.pow(25, 7))))
  const a1p = (1 + G) * a1,
    a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1),
    C2p = Math.hypot(a2p, b2)
  const Cbarp = (C1p + C2p) / 2
  const h1p = hp(a1p, b1),
    h2p = hp(a2p, b2)
  const dLp = L2 - L1,
    dCp = C2p - C1p
  let dhp = h2p - h1p
  if (isNaN(h1p) || isNaN(h2p)) dhp = 0
  else if (dhp > 180) dhp -= 360
  else if (dhp < -180) dhp += 360
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(deg2rad(dhp / 2))
  const Lbarp = (L1 + L2) / 2
  let hbarp =
    isNaN(h1p) || isNaN(h2p)
      ? isNaN(h1p)
        ? h2p
        : h1p
      : Math.abs(h1p - h2p) > 180
      ? (h1p + h2p + 360) / 2
      : (h1p + h2p) / 2
  const T =
    1 -
    0.17 * Math.cos(deg2rad(hbarp - 30)) +
    0.24 * Math.cos(deg2rad(2 * hbarp)) +
    0.32 * Math.cos(deg2rad(3 * hbarp + 6)) -
    0.2 * Math.cos(deg2rad(4 * hbarp - 63))
  const Sl =
    1 +
    (0.015 * Math.pow(Lbarp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2))
  const Sc = 1 + 0.045 * Cbarp
  const Sh = 1 + 0.015 * Cbarp * T
  const delthetarad = deg2rad(30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2)))
  const Rc =
    2 * Math.sqrt(Math.pow(Cbarp, 7) / (Math.pow(Cbarp, 7) + Math.pow(25, 7)))
  const Rt = -Rc * Math.sin(delthetarad)
  return Math.sqrt(
    Math.pow(dLp / (kL * Sl), 2) +
      Math.pow(dCp / (kC * Sc), 2) +
      Math.pow(dHp / (kH * Sh), 2) +
      Rt * (dCp / (kC * Sc)) * (dHp / (kH * Sh))
  )
}
function hp(a, b) {
  if (a === 0 && b === 0) return NaN
  const h = (Math.atan2(b, a) * 180) / Math.PI
  return h >= 0 ? h : h + 360
}
function deg2rad(d) {
  return (d * Math.PI) / 180
}

// Display-P3 helpers (표시용)
function srgb_to_displayp3_linear(rgb) {
  const [X, Y, Z] = srgb_to_xyz(rgb)
  const m = [
    [2.493496911941425, -0.9313836179191239, -0.40271078445071684],
    [-0.8294889695615747, 1.7626640603183463, 0.023624685841943577],
    [0.03584583024378447, -0.07617238926804182, 0.9568845240076872],
  ]
  const Rp = m[0][0] * X + m[0][1] * Y + m[0][2] * Z
  const Gp = m[1][0] * X + m[1][1] * Y + m[1][2] * Z
  const Bp = m[2][0] * X + m[2][1] * Y + m[2][2] * Z
  return [clamp01(Rp), clamp01(Gp), clamp01(Bp)]
}
function clamp01(x) {
  return Math.min(1, Math.max(0, x))
}

// ===== State =====
let targetRGB = [0, 0, 0] // sRGB 8-bit
let supportsP3 = false
const el = {
  targetSwatch: document.getElementById('targetSwatch'),
  truthBox: document.getElementById('truthBox'),
  truthHex: document.getElementById('truthHex'),
  truthRgb: document.getElementById('truthRgb'),
  renderSpace: document.getElementById('renderSpace'),
  scoreMetric: document.getElementById('scoreMetric'),
  colorInput: document.getElementById('colorInput'),
  inputSwatch: document.getElementById('inputSwatch'),
  inputStatus: document.getElementById('inputStatus'),
  de00: document.getElementById('de00'),
  de76: document.getElementById('de76'),
  rgbdist: document.getElementById('rgbdist'),
  verdict: document.getElementById('verdict'),
  previewBtn: document.getElementById('previewBtn'),
  submitBtn: document.getElementById('submitBtn'),
  nextBtn: document.getElementById('nextBtn'),
  history: document.getElementById('history'),
}

// detect P3 support
;(function detectP3() {
  supportsP3 =
    typeof CSS !== 'undefined' &&
    CSS.supports &&
    CSS.supports('color', 'color(display-p3 1 0 0)')
  if (!supportsP3) {
    const optP3 = [...el.renderSpace.options].find((o) => o.value === 'p3')
    if (optP3) optP3.textContent = 'Display-P3 (미지원)'
    el.renderSpace.value = 'srgb'
  }
})()

// ===== Game flow =====
function randomSRGB() {
  return [rand255(), rand255(), rand255()]
}
function rand255() {
  return Math.floor(Math.random() * 256)
}

function setTargetColor(rgb) {
  targetRGB = rgb.slice()
  updateTargetSwatch()

  // 정답 값 세팅(표시는 숨김 상태 유지)
  el.truthHex.textContent = toHex(targetRGB)
  el.truthRgb.textContent = toRgbStr(targetRGB)
  el.truthBox.hidden = true

  clearMetrics()
}

function updateTargetSwatch() {
  const mode = el.renderSpace.value
  if (mode === 'p3' && supportsP3) {
    const [Rp, Gp, Bp] = srgb_to_displayp3_linear(targetRGB)
    el.targetSwatch.style.backgroundColor = `color(display-p3 ${Rp} ${Gp} ${Bp})`
  } else {
    el.targetSwatch.style.backgroundColor = toRgbStr(targetRGB)
  }
}

function clearMetrics() {
  el.de00.textContent = '—'
  el.de76.textContent = '—'
  el.rgbdist.textContent = '—'
  el.verdict.textContent = '—'
  el.inputStatus.textContent = ''
  el.inputSwatch.style.backgroundColor = '#0e1117'
}

function onInputChanged() {
  const parsed = parseColorInput(el.colorInput.value)
  if (parsed) {
    el.inputStatus.textContent = ''
  } else {
    if (el.colorInput.value.trim() !== '') {
      el.inputStatus.textContent =
        '형식: #RRGGBB, #RGB, rgb(r,g,b), 또는 6자리 hex'
    } else {
      el.inputStatus.textContent = ''
    }
  }
}

function computeMetrics(guess) {
  const labT = rgb_to_lab(targetRGB)
  const labG = rgb_to_lab(guess)
  const dE00 = deltaE00(labT, labG)
  const dE76 = deltaE76(labT, labG)
  const dr = targetRGB[0] - guess[0]
  const dg = targetRGB[1] - guess[1]
  const db = targetRGB[2] - guess[2]
  const dRGB = Math.hypot(dr, dg, db)

  el.de00.textContent = dE00.toFixed(2)
  el.de76.textContent = dE76.toFixed(1)
  el.rgbdist.textContent = dRGB.toFixed(1)
  el.verdict.textContent = verdictFromMetric(
    el.scoreMetric.value === 'de76' ? dE76 : dE00,
    el.scoreMetric.value
  )
}

function verdictFromMetric(value, metric) {
  if (metric === 'rgb') {
    if (value < 20) return '거의 같다 👍'
    if (value < 45) return '미세한 차이'
    if (value < 90) return '눈에 띄는 차이'
    return '꽤 다르다'
  } else {
    // ΔE
    if (value < 1.0) return '거의 구분 불가 🔍'
    if (value < 2.3) return '간신히 구분'
    if (value < 5.0) return '눈에 띔'
    if (value < 10.0) return '확연한 차이'
    return '전혀 다름'
  }
}

// ✅ 색상 확인: 스와치 갱신 + 점수 계산 (정답은 여전히 숨김)
function preview() {
  const guess = parseColorInput(el.colorInput.value)
  if (!guess) {
    el.inputStatus.textContent = '올바른 형식으로 입력해줘!'
    return
  }
  el.inputSwatch.style.backgroundColor = toRgbStr(guess)
  computeMetrics(guess)
  el.truthBox.hidden = true // 정답 비공개 유지
}

// ✅ 채점: 스와치 갱신 + 점수 + 정답 공개 + 기록
function score() {
  const guess = parseColorInput(el.colorInput.value)
  if (!guess) {
    el.inputStatus.textContent = '먼저 올바른 형식으로 색상 코드를 입력해줘!'
    return
  }
  el.inputSwatch.style.backgroundColor = toRgbStr(guess)
  computeMetrics(guess)

  // 정답 공개
  el.truthBox.hidden = false

  // 기록
  pushHistory({
    truthHex: toHex(targetRGB),
    guessHex: toHex(guess),
    de00: parseFloat(el.de00.textContent),
    de76: parseFloat(el.de76.textContent),
    dRGB: parseFloat(el.rgbdist.textContent),
  })
}

function pushHistory(item) {
  const div = document.createElement('div')
  div.className = 'history-item'
  div.innerHTML = `
    <div><b>정답</b> <code>${item.truthHex}</code> · <b>내 입력</b> <code>${
    item.guessHex
  }</code></div>
    <div>ΔE2000 <b>${item.de00.toFixed(2)}</b> · ΔE76 ${item.de76.toFixed(
    1
  )} · RGB 거리 ${item.dRGB.toFixed(1)}</div>
  `
  el.history.prepend(div)
}

function nextProblem() {
  setTargetColor(randomSRGB())
  el.colorInput.value = ''
  clearMetrics()
}

// ===== Wire up =====
el.colorInput.addEventListener('input', onInputChanged)
el.previewBtn.addEventListener('click', preview)
el.submitBtn.addEventListener('click', score)
el.nextBtn.addEventListener('click', nextProblem)
el.renderSpace.addEventListener('change', updateTargetSwatch)

// ✅ Enter = 색상 확인, Shift+Enter = 채점
el.colorInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    if (e.shiftKey) {
      score()
    } else {
      preview()
    }
  }
})

// init
nextProblem()
