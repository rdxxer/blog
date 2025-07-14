function decode(str) {
  return str.replace(/\\u[\dA-Fa-f]{4}/g, function (match) {
    return String.fromCharCode(parseInt(match.replace('\\u', ''), 16))
  })
}

function encode(str) {
  return str
    .split('')
    .map(function (char) {
      const code = char.charCodeAt(0)
      if (code >= 0x00 && code <= 0x7f) {
        return char
      }
      return '\\u' + code.toString(16).padStart(4, '0')
    })
    .join('')
}

document.getElementById('input-area').addEventListener('input', function () {
  const input = document.querySelector('.input-area').value
  const output = encode(input)
  document.querySelector('.output-area').value = output
})

document.getElementById('output-area').addEventListener('input', function () {
  const input = document.querySelector('.output-area').value
  const output = decode(input)
  document.querySelector('.input-area').value = output
})
