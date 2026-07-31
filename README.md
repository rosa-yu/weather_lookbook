# 247 Daily Station Weather Lookbook

성수동 날씨에 따라 룩을 추천하는 640 × 960 GitHub Pages 디지털 사이니지입니다. 기상청 인증키는 브라우저에 전달하지 않고 GitHub Actions의 Secret으로만 사용합니다.

## 안전한 날씨 데이터 흐름

1. GitHub Actions가 `KMA_APIHUB_KEY`를 사용해 APIHub 10분 실황 격자자료를 호출합니다.
2. 성수동 격자(61, 126)의 기온(`T1H`), 습도(`REH`), 강수형태(`PTY`), 1시간 강수량(`RN1`)만 `weather.json`으로 생성합니다.
3. Pages 배포물에는 공개 가능한 날씨값과 영상 매니페스트만 포함되고 인증키는 포함되지 않습니다.
4. workflow는 `main` push와 매시간 5·15·25·35·45·55분에 실행되어 10분마다 날씨 스냅샷을 갱신합니다.
5. 열린 사이니지 화면도 10분마다 캐시 없이 날씨와 영상 매니페스트를 다시 읽습니다.

기간별 온도 기준과 강수 기준은 `이미지 노출 조건.xlsx`의 A~G열을 따릅니다. 8월 14일~11월 1일은 `RN1`이 시간당 10 mm 이상이면 강한 비, 그 미만이면 소나기/약한 비입니다. 11월 2일~2월 14일은 `PTY`로 비·진눈깨비와 눈을 구분합니다.

## 기간별 착장 영상 등록

1. `assets/lookbook-videos` 아래에서 해당 기간과 날씨 조건 폴더를 엽니다.
2. 그 폴더에 `.mp4` 또는 `.webm` 영상을 넣습니다. 파일명은 자유롭게 정할 수 있습니다.
3. 변경을 commit하고 `main`에 push합니다.
4. GitHub Actions가 모든 조건 폴더를 스캔해 `manifest.json`을 자동 생성하고 Pages에 배포합니다.

영상은 한 조건 폴더 안의 등록 파일을 무작위 순서로 한 번씩 모두 재생한 뒤 다시 섞습니다. 새 cycle의 첫 영상은 직전 cycle의 마지막 영상과 겹치지 않습니다. 재생 순서는 브라우저 `localStorage`에 조건별로 저장되므로 페이지가 새로고침되어도 cycle이 이어집니다. 선택된 폴더가 비어 있으면 `assets/display/KOMATSU Pants + Light Shirt.mp4`를 fallback으로 재생합니다.

전체 폴더와 기대 영상 수는 `assets/lookbook-videos/README.md`에 정리되어 있습니다. 엑셀의 `2.19~ 프리 스프링` 행은 종료일·기온/강수 기준·영상 수가 비어 있어 아직 자동 조건에 포함하지 않았습니다. 2월 15일~8월 13일도 완성된 기간 규칙이 없으므로 fallback 영상을 사용합니다.

## KMA_APIHUB_KEY 설정

1. 기상청 API허브에서 로그인하고 `예특보 > 단기예보 > 동네예보 실황 격자자료`의 API 활용신청을 완료합니다.
2. API허브 마이페이지에서 발급된 인증키를 복사합니다.
3. GitHub 저장소에서 `Settings > Secrets and variables > Actions`로 이동합니다.
4. `New repository secret`을 눌러 Name에 `KMA_APIHUB_KEY`, Secret에 발급받은 인증키를 입력합니다.
5. `Actions > Deploy static site to GitHub Pages > Run workflow`를 실행하거나 `main`에 push합니다.

기존 `WEATHER_SECRET_KEY`는 APIHub 호출에 실패했을 때 공공데이터포털 초단기실황으로 전환하는 예비 키로 유지합니다. 두 Secret이 모두 없으면 저장소의 fallback `weather.json`을 배포합니다.

## 화면 구성

- 정확한 640 × 960 무여백 캔버스
- 현재 날짜와 1초 단위 시계
- 기간·기온·강수 상태에 따른 날씨 조건과 추천 착장 영상
- 좌우 여백을 실제 크롭한 fallback 영상과 화면 폭을 채우는 `cover` 표시
- 조건 폴더별 중복 방지 shuffle cycle
- 하단 점 버튼을 이용한 기본 날씨 상태 수동 미리보기

## 주요 파일

- `index.html`: 디지털 사이니지 마크업
- `styles.css`: 640 × 960 고정 디자인
- `src/app.js`: 날씨 로드, 기간 조건 적용, 영상 재생 제어
- `src/lookbook-schedule.js`: 엑셀 A~G 기반 기간별 노출 조건
- `src/lookbook-engine.js`: 조건 매칭과 shuffle cycle
- `scripts/build-lookbook-manifest.mjs`: 조건 폴더의 MP4/WebM 자동 탐색
- `scripts/fetch-weather-apihub.mjs`: APIHub 10분 실황 격자자료 수집기
- `scripts/fetch-weather.mjs`: 공공데이터포털 fallback 수집기
- `assets/lookbook-videos/`: 기간·조건별 착장 영상 폴더
- `assets/display/KOMATSU Pants + Light Shirt.mp4`: 조건 영상이 없을 때 사용하는 fallback 영상
- `.github/workflows/pages.yml`: 날씨·영상 매니페스트 생성 및 Pages 배포

기본 위치는 성수동 좌표 `37.5446, 127.0557`, APIHub 격자 `61, 126`입니다.

## 8월 14일~27일 조건 영상 테스트

현재 날짜와 상관없이 실제 기간·기온·강수 매칭 로직을 통과시키는 URL 프리셋입니다.

- 매우 더움(34°C 이상): `?lookbookTest=very-hot`
- 더움(32°C 이상 34°C 미만): `?lookbookTest=hot`
- 비교적 선선한(32°C 미만): `?lookbookTest=relatively-cool`
- 소나기/약한 비(10 mm/h 미만): `?lookbookTest=light-rain`
- 강한 비(10 mm/h 이상): `?lookbookTest=heavy-rain`

예: `https://rosa-yu.github.io/weather_lookbook/?lookbookTest=very-hot`
## GitHub Environment로 날씨값 테스트

1. `Settings > Environments`에서 테스트용 Environment를 만듭니다. 예: `weather-test`.
2. Environment Variables에 다음 값을 추가합니다.
   - `ENABLE_WEATHER_TEST_MODE`: `true`
   - `TEST_TEMPERATURE`: 예: `27`, `15`, `-2`
   - `TEST_PRECIPITATION_TYPE`: `none`, `rain`, `snow` 중 하나
   - 선택: `TEST_HUMIDITY` (기본값 `55`)
3. `Actions > Deploy static site to GitHub Pages > Run workflow`에서 해당 Environment를 선택합니다.
4. 필요하면 `test_temperature`, `test_precipitation` 입력값으로 Environment 값을 일시적으로 덮어쓸 수 있습니다.