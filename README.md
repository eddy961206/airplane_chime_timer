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
2. `sounds` 폴더에 `chime1.mp3`, `chime2.mp3`, `chime3.mp3` 이름으로 저장

## 개발 환경

- Chrome Extension Manifest V3
- JavaScript
- jQuery 3.6.0

## 라이선스

MIT License 