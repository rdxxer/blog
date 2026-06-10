const IDC_START = 0x2ff0
const IDC_END = 0x2fff

// IDS 연산자는 U+2FF0..U+2FFF 범위로 처리한다.
// 〾는 IDS.TXT에서 자주 보이는 표지라 버린다.
// ㇯는 ^㇯上一$(X)처럼 파자식 표지로 쓰이는 경우가 있어 버린다.
// 단, ㇄, 乚 같은 획 구성요소는 실제 구성요소로 보존한다.
const IGNORED_SINGLE_CHARS = new Set(['〾', '㇯'])

let entries = []
let byChar = new Map()

const els = {
  charQuery: document.querySelector('#charQuery'),
  componentQuery: document.querySelector('#componentQuery'),
  decomposeBtn: document.querySelector('#decomposeBtn'),
  composeBtn: document.querySelector('#composeBtn'),
  decomposeResult: document.querySelector('#decomposeResult'),
  composeResult: document.querySelector('#composeResult'),
}

function isIDC(ch) {
  const cp = ch.codePointAt(0)
  return cp >= IDC_START && cp <= IDC_END
}

function isCompatibilityIdeograph(ch) {
  const cp = ch.codePointAt(0)

  return (
    // CJK Compatibility Ideographs
    (cp >= 0xf900 && cp <= 0xfaff) ||
    // CJK Compatibility Ideographs Supplement
    (cp >= 0x2f800 && cp <= 0x2fa1f)
  )
}

function normalizeCompatChar(ch) {
  if (!ch) return ch
  if (!isCompatibilityIdeograph(ch)) return ch
  return ch.normalize('NFKC')
}

function normalizeCompatToken(token) {
  // {69} 같은 IDS 전용 토큰은 건드리지 않는다.
  if (token.startsWith('{') && token.endsWith('}')) return token

  // 이 시스템에서는 일반 구성요소 토큰은 한 글자라고 본다.
  return normalizeCompatChar(token)
}

function normalizeCompatTokens(tokens) {
  return tokens.map(normalizeCompatToken)
}

function escapeHTML(s) {
  return String(s).replace(
    /[&<>"']/g,
    (ch) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[ch])
  )
}

function tokenBadge(token) {
  return `<span class="badge" data-copy="${escapeHTML(
    token
  )}" title="클릭해서 복사">${escapeHTML(token)}</span>`
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

function trimExpression(field) {
  let s = field.trim()

  if (s.startsWith('^')) s = s.slice(1)

  const dollar = s.indexOf('$')
  if (dollar !== -1) s = s.slice(0, dollar)

  return s.trim()
}

function tokenizeExpression(expr) {
  const tokens = []
  const chars = Array.from(expr)

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]

    if (/\s/u.test(ch)) continue
    if (ch === '^' || ch === '$') continue
    if (isIDC(ch) || IGNORED_SINGLE_CHARS.has(ch)) continue

    // {69}, {97} 같은 비유니코드 구성요소는 하나의 토큰으로 보존한다.
    if (ch === '{') {
      let token = '{'
      i++

      while (i < chars.length) {
        token += chars[i]
        if (chars[i] === '}') break
        i++
      }

      tokens.push(token)
      continue
    }

    tokens.push(ch)
  }

  return normalizeCompatTokens(tokens)
}

function parseDecompositionField(field) {
  const expr = trimExpression(field)
  const components = tokenizeExpression(expr)

  if (components.length === 0) return null

  return {
    components,
    text: components.join(''),
  }
}

function parseIDS(text) {
  const parsed = []
  const lines = text.split(/\r?\n/)

  for (const line of lines) {
    // 탭 뒤에 나오는 *부터는 주석으로 취급한다.
    // 예:
    // U+652C 攬 ^⿰扌覽$(GHTJKPV) *U+652C(V) was ...
    const dataLine = line.split(/\t\s*\*/u)[0]

    const trimmed = dataLine.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('*')) continue

    const cols = dataLine.split('\t')
    if (cols.length < 3) continue

    const code = cols[0].trim()
    const char = normalizeCompatChar(cols[1].trim())
    const fields = cols.slice(2)

    const seen = new Set()
    const decompositions = []

    for (const field of fields) {
      const decomp = parseDecompositionField(field)
      if (!decomp) continue
      if (seen.has(decomp.text)) continue

      seen.add(decomp.text)
      decompositions.push(decomp)
    }

    if (decompositions.length === 0) continue

    const componentSet = new Set()
    for (const decomp of decompositions) {
      for (const token of decomp.components) {
        componentSet.add(token)
      }
    }

    parsed.push({
      code,
      char,
      decompositions,
      componentSet,
    })
  }

  return parsed
}

function rebuildIndex() {
  byChar = new Map()

  for (const entry of entries) {
    if (!byChar.has(entry.char)) byChar.set(entry.char, [])
    byChar.get(entry.char).push(entry)
  }
}

async function loadIDS() {
  try {
    const res = await fetch('./IDS.TXT', { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const text = await res.text()
    entries = parseIDS(text)
    rebuildIndex()

    const message = `준비 완료: ${entries.length.toLocaleString()}개 항목`
    els.decomposeResult.textContent = message
    els.composeResult.textContent = message
  } catch (err) {
    const msg =
      'IDS.TXT를 읽지 못했어. index.html과 같은 폴더에 IDS.TXT를 두고, ' +
      '브라우저에서 직접 열어서 실패하면 해당 폴더에서 `python -m http.server`로 실행해봐.'
    els.decomposeResult.textContent = msg
    els.composeResult.textContent = msg
    console.error(err)
  }
}

function renderDecomposeResult(query) {
  const inputChar = Array.from(query.trim())[0] ?? ''
  const q = normalizeCompatChar(inputChar)

  if (!q) {
    els.decomposeResult.innerHTML = `<p class="empty">검색할 한자를 입력해줘.</p>`
    return
  }

  const found = byChar.get(q) ?? []

  if (found.length === 0) {
    els.decomposeResult.innerHTML = `<p class="empty">${escapeHTML(
      inputChar
    )}의 파자 데이터를 찾지 못했어.</p>`
    return
  }

  let html = ''

  if (inputChar && inputChar !== q) {
    html += `<div class="count">${escapeHTML(inputChar)} → ${escapeHTML(
      q
    )}로 정규화해서 검색함</div>`
  }

  for (const entry of found) {
    html += `<div class="entry">
      <div class="head">
        <span class="char">${escapeHTML(entry.char)}</span>
        <span class="code">${escapeHTML(entry.code)}</span>
      </div>`

    for (const d of entry.decompositions) {
      html += `<div class="decomp-line">${d.components
        .map(tokenBadge)
        .join('')}</div>`
    }

    html += `</div>`
  }

  els.decomposeResult.innerHTML = html
}

function entryMatches(entry, queryTokens) {
  for (const token of queryTokens) {
    if (!entry.componentSet.has(token)) return false
  }
  return true
}

function renderComposeResult(query) {
  const raw = query.trim()

  if (!raw) {
    els.composeResult.innerHTML = `<p class="empty">검색할 구성요소를 입력해줘.</p>`
    return
  }

  const queryTokens = tokenizeExpression(raw)

  if (queryTokens.length === 0) {
    els.composeResult.innerHTML = `<p class="empty">실제 구성요소로 해석되는 입력이 없어.</p>`
    return
  }

  const matches = []

  for (const entry of entries) {
    if (entryMatches(entry, queryTokens)) {
      matches.push(entry)
    }
  }

  if (matches.length === 0) {
    els.composeResult.innerHTML = `<p class="empty">일치하는 한자를 찾지 못했어.</p>`
    return
  }

  const limit = 500
  const shown = matches.slice(0, limit)

  let html = `<div class="count">결과 ${matches.length.toLocaleString()}개`
  if (matches.length > limit) {
    html += ` 중 처음 ${limit.toLocaleString()}개만 표시`
  }
  html += `</div>`

  for (const entry of shown) {
    html += `<div class="entry">
      <div class="head">
        <span class="char">${escapeHTML(entry.char)}</span>
        <span class="code">${escapeHTML(entry.code)}</span>
      </div>`

    for (const d of entry.decompositions) {
      html += `<div class="decomp-line">${d.components
        .map(tokenBadge)
        .join('')}</div>`
    }

    html += `</div>`
  }

  els.composeResult.innerHTML = html
}

els.decomposeBtn.addEventListener('click', () => {
  renderDecomposeResult(els.charQuery.value)
})

els.composeBtn.addEventListener('click', () => {
  renderComposeResult(els.componentQuery.value)
})

els.charQuery.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    renderDecomposeResult(els.charQuery.value)
  }
})

els.componentQuery.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    renderComposeResult(els.componentQuery.value)
  }
})

document.addEventListener('click', async (event) => {
  const badge = event.target.closest('.badge')
  if (!badge) return

  const text = badge.dataset.copy
  if (!text) return

  try {
    await copyText(text)

    badge.classList.add('copied')
    setTimeout(() => {
      badge.classList.remove('copied')
    }, 350)
  } catch (err) {
    console.error('copy failed:', err)
  }
})

loadIDS()
