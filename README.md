# 아틀리에 온라인 스토리 아카이브

아틀리에 온라인의 **메인 스토리 208편**과 **사이드 스토리 199편**만 감상할 수 있도록 기존 데이터 뷰어를 정리한 정적 비주얼노벨형 아카이브입니다.

## 감상 기능

- 배경 일러스트, 캐릭터 일러스트, BGM, 대사 음성을 장면 순서대로 재생
- 주인공은 여성 분기와 여성 음성만 사용
- 한국어 번역을 기본으로 표시하고 일본어 원문을 선택적으로 함께 표시
- 기본 **통합 순서**에서 `메인 N장 → 사이드 N장 → 메인 N+1장`으로 이어 감상
- 선택지 분기, 대화 로그, 자동 재생, 음량 조절, 전체 화면 지원
- 넓은 데스크톱과 스마트폰 가로모드에 최적화
- 마지막으로 본 이야기와 감상 설정을 브라우저에 저장

스토리와 연결되지 않은 전투·아이템·몬스터·3D 모델·다른 언어 서버 데이터는 제거했습니다. `public/data/stories.json`에는 스토리 진행에 필요한 정규화 데이터만, `public/assets`에는 해당 스토리에서 실제 참조하는 파일만 들어 있습니다.

## 로컬에서 보기

브라우저의 로컬 파일 제한 때문에 간단한 웹 서버로 열어야 합니다.

```bash
python -m http.server 8000 -d public
```

그런 다음 `http://localhost:8000`을 엽니다. 별도 패키지 설치나 빌드는 필요하지 않습니다.

## GitHub Pages

`master` 브랜치에 푸시하면 `.github/workflows/deploy.yml`이 `public` 폴더를 GitHub Pages에 배포합니다. 저장소의 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 한 번 지정하면 됩니다.

## 번역과 저작권

일본어 원문은 `public/data/stories.json`에 보존하고, 검수한 한국어 교정은 `public/data/ko-translations.json`과 `public/data/translations/`에 분리해 적용합니다. 이렇게 하면 원문·음성·분기 구조를 바꾸지 않고도 번역을 장 단위로 검수할 수 있습니다.

- `public/data/translation-notes.md`: 고유명사, 인물 말투, 설정·복선, 필수 오역 대조표
- `public/data/reading-plan.json`: 챕터 줄거리 메모와 메인·사이드 삽입 규칙
- `tools/validate-story-data.mjs`: 통합 순서와 번역 오버레이의 ID·인덱스·JSON 무결성 검사

번역을 추가하거나 수정한 뒤에는 다음으로 검증할 수 있습니다.

```bash
node tools/validate-story-data.mjs
```

소스 코드는 `LICENSE`의 MIT 조건을 따릅니다. 게임에서 추출된 이미지·음원·스토리 데이터에는 MIT 라이선스가 적용되지 않으며, 각 권리는 원 권리자에게 있습니다. 이 저장소는 비공식 보존·감상용 프로젝트입니다.
