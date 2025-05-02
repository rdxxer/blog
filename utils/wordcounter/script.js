function count() {
    const text = document.getElementById("inputText").value
    document.getElementById("charCount").innerHTML = text.length
    document.getElementById("charCountNoSpaces").innerHTML = text.replace(/\s+/g, '').length
    document.getElementById("wordCount").innerHTML = text.split(/\s+/).filter(function (word) {
        return word.length > 0
    }).length
}

document.getElementById("inputText").addEventListener("input", count)
count()

document.getElementById("addZwsp").addEventListener("click", function () {
    const inputText = document.getElementById("inputText")
    const zwspCount = document.getElementById("zwspCount").value
    inputText.value += "\u200B".repeat(zwspCount)
    count()
})

document.getElementById("removeZwsp").addEventListener("click", function () {
    const inputText = document.getElementById("inputText")
    const text = inputText.value
    const newText = text.replace(new RegExp("\u200B", "g"), "")
    inputText.value = newText
    count()
})