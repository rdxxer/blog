# IDS 한자 검색 v2

같은 폴더에 `IDS.TXT`를 넣고 실행한다.

파일 구성:

- `index.html`
- `style.css`
- `app.js`
- `IDS.TXT` ← 직접 넣기

주의: 브라우저에서 `index.html`을 직접 열면 보안 정책 때문에 `IDS.TXT` fetch가 막힐 수 있다.
그 경우 이 폴더에서 아래 명령으로 로컬 서버를 띄우면 된다.

```bash
python -m http.server
```

그다음 브라우저에서 `http://localhost:8000` 접속.
