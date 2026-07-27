# 247 Daily Station Weather Lookbook

성수동 날씨에 따라 룩을 추천하는 640 × 960 GitHub Pages 디지털 사이니지입니다. 기상청 인증키는 브라우저에 전달하지 않고 GitHub Actions의 Secret으로만 사용합니다.

## 안전한 날씨 데이터 흐름

1. GitHub Actions가 `KMA_APIHUB_KEY`를 사용해 APIHub 10분 실황 격자자료를 호출합니다.
2. 성수동 격자(61, 126)의 기온(`T1H`), 습도(`REH`), 강수형태(`PTY`), 1시간 강수량(`RN1`)만 루트의 `weather.json`으로 생성합니다.
3. Pages 배포물에는 공개 가능한 `weather.json`만 포함되고 인증키는 포함되지 않습니다.
4. 브라우저는 `weather.json`을 읽어 날씨와 추천 룩을 표시합니다.
5. workflow는 `main` push와 매시간 5·15·25·35·45·55분에 실행되어 10분마다 날씨 스냅샷을 갱신합니다.
6. 열린 사이니지 화면도 10분마다 캐시 없이 `weather.json`을 다시 읽어 최신 배포값을 반영합니다.

비는 `RN1`이 시간당 15 mm 이상이면 Heavy Rain, 그 미만이면 Light Rain으로 표시합니다. 비·눈이 없을 때는 기온 구간으로 룩을 선택합니다.

## KMA_APIHUB_KEY 설정

1. 기상청 API허브에서 로그인하고 `수치모델 > 초단기예측 > 초단기실황 격자자료`의 API 활용신청을 완료합니다.
2. API허브 마이페이지에서 발급된 인증키를 복사합니다.
3. GitHub 저장소에서 `Settings > Secrets and variables > Actions`로 이동합니다.
4. `New repository secret`을 눌러 Name에 `KMA_APIHUB_KEY`, Secret에 발급받은 인증키를 입력합니다.
5. `Actions > Deploy static site to GitHub Pages > Run workflow`를 실행하거나 `main`에 push합니다.

기존 `WEATHER_SECRET_KEY`는 APIHub 호출에 실패했을 때 공공데이터포털 초단기실황(시간 단위)으로 전환하는 예비 키로 유지합니다. 두 Secret이 모두 없으면 저장소의 22°C fallback `weather.json`을 배포합니다. 키는 workflow 로그, 저장소 파일, Pages 배포물에 기록하지 않습니다.

## 화면 구성

- 정확한 640 × 960 무여백 캔버스
- 현재 날짜와 1초 단위 시계
- 기온·강수 상태에 따른 애니메이션 날씨 아이콘
- 10가지 날씨별 추천 룩
- 좌우 여백을 실제 크롭한 룩북 영상과 화면 폭을 채우는 `cover` 표시
- 하단 점 버튼을 이용한 날씨 상태 수동 미리보기

## 주요 파일

- `index.html`: 디지털 사이니지 마크업
- `styles.css`: 640 × 960 고정 디자인
- `src/app.js`: 시계, 날씨 상태 매핑, 미리보기 버튼
- `src/weather.js`: 공개된 `weather.json` 로더와 검증
- `scripts/fetch-weather-apihub.mjs`: APIHub 10분 실황 격자자료 수집기
- `scripts/fetch-weather.mjs`: 공공데이터포털 시간 단위 fallback 수집기
- `weather.json`: 브라우저에 공개되는 날씨 스냅샷
- `.github/workflows/pages.yml`: Secret 기반 날씨 수집 및 Pages 배포
- `assets/display/lookbook.mp4`: 좌우 여백을 크롭한 룩북 영상

기본 위치는 성수동 좌표 `37.5446, 127.0557`, APIHub 격자 `61, 126`입니다.

## GitHub Environment로 날씨값 테스트

1. `Settings > Environments`에서 테스트용 Environment를 만듭니다. 예: `weather-test`.
2. Environment Variables에 다음 값을 추가합니다.
   - `ENABLE_WEATHER_TEST_MODE`: `true`
   - `TEST_TEMPERATURE`: 예: `27`, `15`, `-2`
   - `TEST_PRECIPITATION_TYPE`: `none`, `rain`, `snow` 중 하나
   - 선택: `TEST_HUMIDITY` (기본값 `55`)
3. `Actions > Deploy static site to GitHub Pages > Run workflow`에서 해당 Environment를 선택합니다.
4. 필요하면 `test_temperature`, `test_precipitation` 입력값으로 Environment 값을 일시적으로 덮어쓸 수 있습니다.

테스트 Environment 실행은 지정한 테스트 날씨를 사용하고, 일반 push·schedule·기본 수동 실행은 APIHub 10분 관측값을 사용합니다.