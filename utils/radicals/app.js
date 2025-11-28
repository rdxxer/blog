// app.js
// 한자 → 부수 번호(JSON) → Kangxi Radicals 블록(0x2F00) 매핑 + 팔레트 삽입
// JSON에 없는 문자는 한자가 아닌 것으로 보고 변환에서 제외.

let radicalsMap = {}
let radicalsLoaded = false
let lastFocusedEditable = null

function isEditable(el) {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA') return !el.readOnly && !el.disabled
  if (tag === 'INPUT' && el.type === 'text') {
    return !el.readOnly && !el.disabled
  }
  return false
}

function setStatus(message, type = 'muted') {
  const el = document.getElementById('statusMessage')
  if (!el) return
  el.textContent = message
  el.classList.remove('status-muted', 'status-ok', 'status-error')
  el.classList.add('status', `status-${type}`)
}

// JSON 로드
function loadRadicalsJson() {
  console.log('[INIT] Loading unihan_radicals.json …')
  fetch('unihan_radicals.json')
    .then((resp) => {
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`)
      }
      return resp.json()
    })
    .then((data) => {
      radicalsMap = data
      radicalsLoaded = true
      const count = Object.keys(radicalsMap).length
      console.log('[INIT] Radicals JSON loaded. entries =', count)
      setStatus(`radicals JSON 로드 완료 (총 ${count}개 문자)`, 'ok')
    })
    .catch((err) => {
      console.error('[ERROR] Failed to load JSON:', err)
      setStatus(
        'radicals JSON을 불러오지 못했어. 콘솔 로그를 확인해 줘.',
        'error'
      )
    })
}

// 커서 위치에 문자 삽입
function insertAtCursor(el, text) {
  if (!isEditable(el)) return
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? el.value.length
  const before = el.value.slice(0, start)
  const after = el.value.slice(end)
  el.value = before + text + after
  const newPos = start + text.length
  el.selectionStart = el.selectionEnd = newPos

  if (el.classList.contains('radical-cell')) {
    updateOutputFromRadicalInputs()
  }
}

// 팔레트 섹션 빌드
function buildPaletteSection(
  container,
  startCodePoint,
  endCodePoint,
  skipSet = new Set()
) {
  console.log(
    `[INIT] Building palette U+${startCodePoint.toString(
      16
    )}–U+${endCodePoint.toString(16)}`
  )
  for (let cp = startCodePoint; cp <= endCodePoint; cp += 1) {
    if (skipSet.has(cp)) {
      continue
    }
    const ch = String.fromCodePoint(cp)
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'radical-btn'
    btn.textContent = ch
    btn.title = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`
    btn.addEventListener('click', () => {
      const target =
        lastFocusedEditable || document.getElementById('outputString')
      insertAtCursor(target, ch)
      if (target && target.id === 'outputString') {
        console.log('[PALETTE] Inserted into result:', ch, btn.title)
      }
    })
    container.appendChild(btn)
  }
}

// 팔레트 전체 초기화
function initPalettes() {
  const kangxiContainer = document.getElementById('kangxiPalette')
  const supplementContainer = document.getElementById('supplementPalette')
  if (!kangxiContainer || !supplementContainer) return

  // Kangxi Radicals: U+2F00–U+2FD5
  buildPaletteSection(kangxiContainer, 0x2f00, 0x2fd5)

  // CJK Radicals Supplement: U+2E80–U+2EF3, U+2E9A 제외
  const skip = new Set([0x2e9a])
  buildPaletteSection(supplementContainer, 0x2e80, 0x2ef3, skip)

  console.log('[INIT] Palettes built.')

  const tabButtons = document.querySelectorAll('.tab-button')
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target
      document.querySelectorAll('.palette-grid').forEach((grid) => {
        grid.classList.add('hidden')
      })
      const target = document.getElementById(targetId)
      if (target) {
        target.classList.remove('hidden')
      }
      tabButtons.forEach((b) => b.classList.toggle('active', b === btn))
    })
  })
}

// 테이블의 radical-cell 값들로 결과 문자열 갱신
function updateOutputFromRadicalInputs() {
  const cells = document.querySelectorAll('.radical-cell')
  let result = ''
  cells.forEach((cell) => {
    const val = cell.value
    // 비어 있으면 구분용 박스 문자라도 넣어두자 (한자 개수는 유지)
    result += val && val.length > 0 ? val : '□'
  })
  const output = document.getElementById('outputString')
  if (output) {
    output.value = result
  }
  console.log('[RUN] Output string updated. length =', result.length)
}

// 입력 분석
function analyzeInput() {
  const inputEl = document.getElementById('inputText')
  const tbody = document.querySelector('#resultTable tbody')
  if (!inputEl || !tbody) return

  const text = inputEl.value
  console.log('[RUN] Analyze clicked. raw length =', text.length)

  tbody.innerHTML = ''
  const output = document.getElementById('outputString')
  if (output) {
    output.value = ''
  }

  if (!text) {
    console.log('[RUN] Empty input; nothing to do.')
    return
  }

  if (!radicalsLoaded) {
    console.warn('[WARN] Radicals JSON not loaded yet.')
    alert('radicals JSON이 아직 로드되지 않았어. 잠시 후 다시 시도해 줘.')
    return
  }

  let displayIndex = 0
  let mappedCount = 0
  let skippedCount = 0

  for (const ch of text) {
    const cp = ch.codePointAt(0)
    if (cp == null) continue

    const hex = cp.toString(16).toUpperCase()
    const key = hex // JSON 키 형식과 동일해야 함
    const radicalIndex = radicalsMap[key]

    if (typeof radicalIndex !== 'number') {
      // JSON에 없는 문자는 한자가 아닌 것으로 간주하고 변환에서 제외
      skippedCount += 1
      console.log('[SKIP] Non-Han or unmapped char:', ch, `U+${hex}`)
      continue
    }

    displayIndex += 1
    mappedCount += 1

    let radicalChar = ''
    let radicalIndexDisplay = String(radicalIndex)

    if (radicalIndex >= 1 && radicalIndex <= 214) {
      const kxCp = 0x2f00 + radicalIndex - 1
      radicalChar = String.fromCodePoint(kxCp)
    }

    const tr = document.createElement('tr')

    const tdIdx = document.createElement('td')
    tdIdx.textContent = String(displayIndex)

    const tdChar = document.createElement('td')
    tdChar.textContent = ch

    const tdCode = document.createElement('td')
    tdCode.textContent = `U+${hex.padStart(4, '0')}`

    const tdRadIdx = document.createElement('td')
    tdRadIdx.textContent = radicalIndexDisplay

    const tdRadChar = document.createElement('td')
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'radical-cell han-font'
    input.maxLength = 3
    input.value = radicalChar
    input.dataset.index = String(displayIndex - 1)
    tdRadChar.appendChild(input)

    tr.appendChild(tdIdx)
    tr.appendChild(tdChar)
    tr.appendChild(tdCode)
    tr.appendChild(tdRadIdx)
    tr.appendChild(tdRadChar)

    tbody.appendChild(tr)
  }

  console.log(
    '[RUN] Table built. mapped =',
    mappedCount,
    'skipped =',
    skippedCount
  )

  if (mappedCount === 0) {
    setStatus('JSON 테이블에 있는 한자를 찾지 못했어.', 'error')
  } else {
    setStatus(
      `JSON에 있는 한자 ${mappedCount}개 변환 완료 (무시된 문자 ${skippedCount}개)`,
      'ok'
    )
  }

  updateOutputFromRadicalInputs()
}

// 초기화
document.addEventListener('DOMContentLoaded', () => {
  console.log('[INIT] DOM ready. Initializing app…')

  const inputEl = document.getElementById('inputText')
  const outputEl = document.getElementById('outputString')

  // 기본 포커스 대상은 결과창으로 잡아 두자 (팔레트 삽입용)
  lastFocusedEditable = outputEl || inputEl || null

  // 포커스 추적 (어디에 팔레트 문자를 넣을지)
  document.addEventListener('focusin', (event) => {
    const target = event.target
    if (isEditable(target)) {
      lastFocusedEditable = target
      console.log(
        '[FOCUS] Now editing:',
        target.id || target.className || target.tagName
      )
    }
  })

  // 테이블 내 radical-cell 편집 시 결과 자동 갱신
  const tbody = document.querySelector('#resultTable tbody')
  if (tbody) {
    tbody.addEventListener('input', (event) => {
      const target = event.target
      if (target && target.classList.contains('radical-cell')) {
        updateOutputFromRadicalInputs()
      }
    })
  }

  // 버튼 / 단축키
  const analyzeBtn = document.getElementById('analyzeButton')
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', analyzeInput)
  }

  if (inputEl) {
    inputEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        analyzeInput()
      }
    })
  }

  // JSON / 팔레트 초기화
  loadRadicalsJson()
  initPalettes()

  setStatus('radicals JSON을 불러오는 중…', 'muted')
  console.log('[INIT] App initialization finished.')
})
