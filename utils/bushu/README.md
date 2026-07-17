# 漢検 部首クイズ

KanjiVG로 렌더링한 한자의 획을 직접 클릭해 부수를 맞히는 정적 웹페이지다.
각 급에서는 그 급에 새로 추가되는 한자만 출제된다.

## GitHub Pages에 올리기

1. 이 폴더의 모든 파일과 폴더를 GitHub 저장소 최상위에 올린다.
2. 저장소의 **Settings → Pages**로 이동한다.
3. **Deploy from a branch**를 선택한다.
4. `main` 브랜치와 `/ (root)`를 선택하고 저장한다.

별도의 빌드 과정이나 서버 코드는 필요 없다.

## 로컬 실행

`fetch()`로 JSON과 SVG를 읽기 때문에 `index.html`을 파일로 직접 열기보다는 간단한 로컬 서버를 사용한다.

```bash
python -m http.server 8000
```

그다음 브라우저에서 `http://localhost:8000`을 연다.

## 파일 구조

```text
index.html
style.css
script.js
data/
  answers.json
kanji/
  04f11.svg
  ...
```

## 정답 데이터 규칙

- `kvg:radical="general"`을 우선 사용한다.
- `general`이 없으면 `kvg:radical="tradit"`을 사용한다.
- 화면에 표시하는 부수자는 선택된 그룹의 `kvg:element`다.
- 각 획은 KanjiVG의 SVG path ID로 판정한다.

## 라이선스

KanjiVG SVG는 Ulrich Apel 및 KanjiVG contributors의 저작물이며 CC BY-SA 3.0으로 배포된다.

- https://kanjivg.tagaini.net/
- https://creativecommons.org/licenses/by-sa/3.0/
