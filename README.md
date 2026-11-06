# Airplane Chime Timer

항공기 차임벨 소리로 정시 알림을 제공하는 크롬 익스텐션입니다.

## 기능

- 15분, 30분, 1시간 단위로 정시 알림
- 다양한 기내 차임벨 사운드 선택 가능
- 볼륨 조절 기능
- 알림 ON/OFF 토글
- 다음 알림 시간 표시

## 설치 방법

1. 크롬 브라우저에서 `chrome://extensions` 접속
2. 우측 상단의 "개발자 모드" 활성화
3. "압축해제된 확장 프로그램을 로드합니다" 클릭
4. 이 프로젝트 폴더 선택

## 사용 방법

1. 크롬 브라우저 우측 상단의 확장 프로그램 아이콘 클릭
2. 원하는 차임벨 사운드 선택
3. 알림 간격 선택 (15분, 30분, 1시간)
4. 볼륨 조절
5. 토글 버튼을 ON으로 설정하여 알림 시작

## 프로젝트 구조

```
├── manifest.json         # 익스텐션 설정 파일
├── popup.html           # 팝업 UI
├── popup.css            # 팝업 스타일
├── popup.js             # 팝업 로직
├── background.js        # 백그라운드 스크립트
├── icons/               # 아이콘 파��
├── sounds/              # 차임벨 사운드 파일
└── thirdParty/          # 서드파티 라이브러리 (jQuery)
```

## 사운드 파일 추가 방법

1. MP3 형식의 차임벨 사운드 파일을 준비
2. `sounds` 폴더에 저장
3. `sounds.json` 파일에 사운드 정보 추가

## 개발 환경

- Chrome Extension Manifest V3
- JavaScript
- jQuery 3.6.0

## 라이선스

MIT License

## 1.3.6 검증 및 패키징

이 브랜치는 Chrome Web Store에 배포되는 런타임 파일을 직접 관리한다. 이전 `refactor` 브랜치의 webpack 빌드 결과로 덮어쓰지 않는다.

```powershell
node --test tests/*.test.cjs
python scripts/package.py C:\\path\\to\\airplane-chime-timer-1.3.6.zip
```

패키징 스크립트는 런타임 파일만 포함하고 테스트, 스토어 이미지, 개발 문서를 제외한다. 출력에서 버전, 파일 수, SHA-256을 확인한다.

이번 변경은 듀얼 알람 중복 재생, 일회성 알람 완료 상태, 절전 복귀와 일일 예약, 빠른 ON/OFF 처리, 사용자 지정 오디오 재생을 개선한다. 팝업에서 소리를 미리 테스트하고 영어/한국어 사용 안내를 열 수 있다. 다음 알림은 실제 Chrome 예약 시각을 표시한다.

Chrome과 컴퓨터가 실행 중이어야 알림을 받을 수 있다. 절전이나 브라우저 종료 상태에서 알림을 보장하지 않으며, Chrome 예약은 초 단위 정밀도를 보장하지 않는다. 25분 사용자 간격은 반복 차임이며 자동 25/5 뽀모도로 사이클은 아니다.

## 1.3.7 보안 및 첫 사용 개선 후보

현재 팝업은 읽을 수 있는 `popup.js`를 직접 실행하며 jQuery/webpack 번들을 사용하지 않습니다. `692.js`와 `thirdParty/`의 이전 파일은 런타임이나 배포 ZIP에 포함되지 않습니다. 기존 브랜치의 빌드 결과로 덮어쓰지 마세요.

```sh
node --test tests/*.test.cjs
python scripts/package.py ../airplane-chime-timer-1.3.7.zip
```

사용자 소리 이름은 텍스트로만 표시합니다. 설정 저장을 한 경로로 통합해 팝업을 닫을 때 예약이 바뀌지 않으며, 잘못된 입력은 기존 예약을 유지합니다. 사용자 소리를 삭제하면 단일/듀얼 타이머의 참조도 기본 소리로 복구합니다. 추적 기능은 추가하지 않았습니다.

- 변경점과 실제 Chrome 검증 목록: [release-1.3.7](docs/release-1.3.7.md)
- 동의 기반 측정 검토안(미적용): [analytics-plan](docs/analytics-plan.md)
- 스토어 문구·이미지 검토 목록: [review-checklist](store-assets/review-checklist.md)

이 파일들의 준비는 스토어 게시를 의미하지 않습니다. Node 테스트는 API 모의 환경 검사이며, 실제 Chrome에서 소리 재생·절전 복귀를 확인하는 최종 점검은 별도로 필요합니다.
