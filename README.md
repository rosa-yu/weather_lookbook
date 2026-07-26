# 247 Daily Station Weather Lookbook

성수동 날씨에 따라 룩을 추천하는 640 × 960 GitHub Pages 디지털 사이니지입니다. 기상청 인증키는 브라우저에 전달하지 않고 GitHub Actions의 `WEATHER_SECRET_KEY`로만 사용합니다.

## 안전한 날씨 데이터 흐름

1. GitHub Actions가 `WEATHER_SECRET_KEY`를 사용해 기상청 초단기실황 API를 호출합니다.
2. 기온, 습도, 강수 상태만 루트의 `weather.json`으로 생성합니다.
3. Pages 배포물에는 공개 가능한 `weather.json`만 포함되고 인증키는 포함되지 않습니다.
4. 브라우저는 `weather.json`을 읽어 날씨와 추천 룩을 표시합니다.
5. workflow는 `main` push와 매시간 50분에 실행되어 날씨 스냅샷을 갱신합니다.

## WEATHER_SECRET_KEY 설정

1. 공공데이터포털에서 `기상청_단기예보 조회서비스` 활용신청을 하고 일반 인증키를 발급받습니다.
2. GitHub 저장소에서 `Settings > Secrets and variables > Actions`로 이동합니다.
3. `New repository secret`을 누릅니다.
4. Name에 `WEATHER_SECRET_KEY`, Secret에 발급받은 일반 인증키를 입력합니다.
5. `Actions > Deploy static site to GitHub Pages > Run workflow`를 실행하거나 `main`에 push합니다.

`WEATHER_SECRET_KEY`가 없으면 workflow는 저장소에 포함된 22°C fallback `weather.json`을 배포합니다. Secret은 workflow 로그, 저장소 파일, Pages 배포물에 기록하지 않습니다.

## 화면 구성

- 정확한 640 × 960 무여백 캔버스
- 현재 날짜와 1초 단위 시계
- 기온·강수 상태에 따른 애니메이션 날씨 아이콘
- 10가지 날씨별 추천 룩
- 제공된 룩북 영상 자동 재생
- 하단 점 버튼을 이용한 날씨 상태 수동 미리보기

## 주요 파일

- `index.html`: 디지털 사이니지 마크업
- `styles.css`: 640 × 960 고정 디자인
- `src/app.js`: 시계, 날씨 상태 매핑, 미리보기 버튼
- `src/weather.js`: 공개된 `weather.json` 로더와 검증
- `scripts/fetch-weather.mjs`: Actions에서만 실행되는 기상청 API 수집기
- `weather.json`: 브라우저에 공개되는 날씨 스냅샷
- `.github/workflows/pages.yml`: Secret 기반 날씨 수집 및 Pages 배포
- `assets/display/lookbook.mp4`: 제공된 룩북 영상

기본 위치는 `scripts/fetch-weather.mjs`의 성수동 좌표 `37.5446, 127.0557`입니다.

## GitHub Environment로 날씨값 테스트

1. `Settings > Environments`에서 테스트용 Environment를 만듭니다. 예: `weather-test`.
2. Environment Variables에 다음 값을 추가합니다.
   - `ENABLE_WEATHER_TEST_MODE`: `true`
   - `TEST_TEMPERATURE`: 예: `27`, `15`, `-2`
   - `TEST_PRECIPITATION_TYPE`: `none`, `rain`, `snow` 중 하나
   - 선택: `TEST_HUMIDITY` (기본값 `55`)
3. `Actions > Deploy static site to GitHub Pages > Run workflow`에서 해당 Environment를 선택합니다.
4. 필요하면 `test_temperature`, `test_precipitation` 입력값으로 Environment 값을 일시적으로 덮어쓸 수 있습니다.

테스트 Environment 실행은 지정한 테스트 날씨를 사용하고, 일반 push·schedule·기본 수동 실행은 `WEATHER_SECRET_KEY`를 사용합니다.
