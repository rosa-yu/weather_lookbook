# 247 Daily Station Weather Lookbook

성수동 날씨에 따라 룩을 추천하는 GitHub Pages용 디지털 사이니지입니다. 제공된 `weather-lookbook-display.html`의 640 × 960 비주얼을 유지하면서 기존 기상청 API와 GitHub Environment 테스트 기능을 연결했습니다.

## 화면 구성

- 2:3 세로형 반응형 디스플레이
- 현재 날짜와 1초 단위 시계
- 기온·강수 상태에 따른 애니메이션 날씨 아이콘
- 10가지 날씨별 추천 룩
- 제공된 룩북 영상 자동 재생
- 하단 점 버튼을 이용한 날씨 상태 수동 미리보기

## 빠른 설정

1. 기상청 공공데이터포털에서 `VilageFcstInfoService_2.0` 활용신청을 합니다.
2. `src/config.js`의 `serviceKey`에 일반 인증키를 입력합니다.
3. 기본 위치를 바꾸려면 같은 파일의 `locationName`, `latitude`, `longitude`를 수정합니다.
4. GitHub 저장소의 `Settings > Pages`에서 `Build and deployment`의 `Source`를 `GitHub Actions`로 설정합니다.

> 현재 구조는 브라우저에서 기상청 API를 직접 호출하므로 API 키가 공개됩니다. 키가 없거나 요청에 실패하면 22°C의 데모 상태를 표시합니다.

## 주요 파일

- `index.html`: 디지털 사이니지 마크업
- `styles.css`: 640 × 960 디자인과 반응형 스케일링
- `src/app.js`: 시계, 날씨 상태 매핑, 미리보기 버튼
- `src/weather.js`: 기상청 초단기실황 요청
- `assets/display/lookbook.mp4`: 제공된 HTML에서 분리한 룩북 영상
- `assets/display/247-logo.png`: 제공된 247 로고

## GitHub Environment로 날씨값 테스트

1. `Settings > Environments`에서 테스트용 Environment를 만듭니다. 예: `weather-test`.
2. Environment Variables에 다음 값을 추가합니다.
   - `ENABLE_WEATHER_TEST_MODE`: `true`
   - `TEST_TEMPERATURE`: 예: `27`, `15`, `-2`
   - `TEST_PRECIPITATION_TYPE`: `none`, `rain`, `snow` 중 하나
   - 선택: `TEST_HUMIDITY` (기본값 `55`)
3. `Actions > Deploy static site to GitHub Pages > Run workflow`에서 해당 Environment를 선택합니다.
4. 필요하면 `test_temperature`, `test_precipitation` 입력값으로 Environment 값을 일시적으로 덮어쓸 수 있습니다.

일반 `main` push는 실제 기상청 API 설정을 사용하고, 수동 workflow 실행은 선택한 Environment의 테스트 값을 사용할 수 있습니다.