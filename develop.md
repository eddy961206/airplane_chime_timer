# Airplane Chime Timer 프로젝트 문서

## 소개

**Airplane Chime Timer**는 항공 애호가를 위해 제작된 크롬 확장 프로그램으로, 사용자에게 사용자 정의 가능한 간격으로 실제 항공기 승객 안전벨트 알림음을 제공합니다. 이 문서는 Java 및 JavaScript 웹 개발자들이 프로젝트의 코드 흐름을 쉽고 자세히 이해할 수 있도록 작성되었습니다.

## 프로젝트 구조
Airplane-Chime-Timer/
│
├── icons/
│ ├── icon16.png
│ ├── icon48.png
│ └── icon128.png
│
├── sounds/
│ ├── one-chime-airplane-made-with-Voicemod.mp3
│ ├── airplane-ding-dong-sound-effect-made-with-Voicemod.mp3
│ ├── chime-104522.mp3
│ ├── a320-tritone-chime-104562.mp3
│ └── sounds.json
│
├── src/
│ ├── background.js
│ ├── popup.html
│ ├── popup.css
│ ├── popup.js
│ ├── audio-player.html
│ └── audio-player.js
│
├── welcome.html
├── manifest.json
├── README.md
└── .cursorignore


## 주요 파일 설명

- **manifest.json**: 확장 프로그램의 메타데이터와 구성 설정을 정의합니다.
- **popup.html / popup.css / popup.js**: 확장 프로그램 아이콘 클릭 시 표시되는 팝업의 구조, 스타일 및 동작을 담당합니다.
- **background.js**: 백그라운드에서 실행되며, 알람 관리, 사운드 재생 요청 등을 처리합니다. background.js 에서는 직접 사운드 재생이 불가하므로 오프스크린(offscreen) 문서를 통해 사운드 재생을 요청합니다. (background.js에서는 DOM이나 브라우저 UI를 조작하거나, 사용자와 직접 상호작용하는 작업이 불가능)
- **audio-player.html / audio-player.js**: 오프스크린(offscreen) 문서로, 실제 사운드 재생을 담당합니다.
- **sounds/sounds.json**: 사용 가능한 사운드 파일 목록과 관련 정보를 정의합니다.
- **welcome.html**: 확장 프로그램 설치 시 표시되는 환영 페이지입니다.
- **icons/**: 확장 프로그램에서 사용하는 아이콘 이미지 파일들이 위치합니다.
- **.cursorignore**: 특정 파일이나 폴더를 커서에서 무시하도록 설정합니다.

## 코드 흐름 상세 설명

### 1. `manifest.json`

확장 프로그램의 기본 설정과 권한을 정의합니다.

- **manifest_version**: 사용하는 매니페스트 버전을 지정 (현재는 버전 3).
- **permissions**: `storage`, `alarms`, `offscreen` 권한을 요청.
- **background**: 백그라운드 스크립트로 `background.js`를 지정.
- **action**: 확장 아이콘의 팝업, 아이콘, 배지 텍스트 설정.
- **web_accessible_resources**: 웹에서 접근 가능한 리소스들을 정의.
- **content_security_policy**: 콘텐츠 보안 정책 설정.

### 2. `background.js`

확장 프로그램의 백그라운드에서 실행되는 스크립트로, 주로 다음과 같은 기능을 담당합니다:

- **설치 및 업데이트 이벤트 처리**:
  - 확장 프로그램이 설치될 때 `welcome.html`을 새 탭으로 엽니다.
  - 초기 설정을 로드하고 알람을 설정합니다.
  
- **오디오 관리자 (`AudioManager`)**:
  - 오프스크린 문서 생성 및 관리.
  - 사운드 정보 가져오기 (`sounds.json`에서).
  - 사운드 재생 요청을 오프스크린 문서로 전송.
  
- **알람 관리자 (`AlarmManager`)**:
  - 사용자가 설정한 간격으로 알람을 생성 및 제거.
  - 알람 발생 시 사운드 재생 트리거.
  
- **배지 관리자 (`BadgeManager`)**:
  - 확장 아이콘의 배지 텍스트와 배경색을 설정하여 활성 상태 표시.
  
- **메시지 리스너**:
  - 팝업 또는 다른 스크립트로부터의 메시지를 수신하고 적절한 동작을 수행.
  
- **알람 리스너**:
  - 알람이 발생하면 `AudioManager`를 통해 사운드를 재생.

### 3. `popup.html`, `popup.css`, `popup.js`

팝업 인터페이스를 구성하며 사용자와의 상호작용을 처리합니다.

- **`popup.html`**:
  - 확장 아이콘 클릭 시 표시되는 UI 구조를 정의.
  - 토글 스위치, 사운드 선택, 간격 설정, 볼륨 조절, 다음 알림 시간 표시 등의 섹션 포함.
  
- **`popup.css`**:
  - 팝업의 스타일과 레이아웃을 정의.
  - 반응형 디자인, 토글 스위치, 슬라이더 등 UI 요소 스타일링.
  
- **`popup.js`**:
  - 팝업의 동작을 제어.
  - 설정값 저장 및 로드 (`Settings` 객체).
  - 사운드 옵션 동적 생성 (`SoundManager`).
  - 사용자 입력에 따른 이벤트 처리 및 백그라운드 스크립트와의 메시지 교환.
  - 사운드 테스트 기능 구현 (`AudioController`).

### 4. `audio-player.html`, `audio-player.js`

사운드 재생을 위한 오프스크린 문서를 관리합니다.

- **`audio-player.html`**:
  - 오디오 요소(`<audio>`)를 포함하여 사운드를 재생.
  - 콘텐츠 보안 정책을 설정하여 스크립트 보안 강화.
  
- **`audio-player.js`**:
  - 백그라운드 스크립트로부터의 메시지를 수신.
  - 지정된 사운드 파일을 로드하고 재생.

### 5. `sounds/sounds.json`

사용 가능한 사운드 목록과 관련 정보를 정의한 JSON 파일입니다.
```json
{
    "sounds": [
        {
            "value": "chime1",
            "name": "Single Chime",
            "filename": "one-chime-airplane-made-with-Voicemod.mp3"
        },
        {
            "value": "chime2",
            "name": "Double Chime",
            "filename": "airplane-ding-dong-sound-effect-made-with-Voicemod.mp3"
        },
        {
            "value": "chime3",
            "name": "Double Chime with noise",
            "filename": "chime-104522.mp3"
        },
        {
            "value": "chime4",
            "name": "Triple Chime",
            "filename": "a320-tritone-chime-104562.mp3"
        }
    ]
}
```

- `value`: 사운드 식별자.
- `name`: 사용자에게 표시될 사운드 이름.
- `filename`: 실제 사운드 파일명.

### 6. `welcome.html`

확장 프로그램 설치 시 사용자에게 환영 메시지를 표시하는 페이지입니다.

- **구성 요소**:
  - 로고 이미지.
  - 프로젝트 제목 및 주요 기능 소개.
  - 향후 추가될 기능(예: 사용자 사운드 업로드) 안내.

## 주요 기능 흐름

1. **설치 시 초기화**:
   - `background.js`의 `onInstalled` 이벤트 리스너가 `welcome.html`을 새 탭으로 엽니다.
   - 초기 설정(`isActive`, `interval`)을 로드하고 알람을 설정합니다.
   - 배지 텍스트를 초기 상태로 설정 (`ON` 또는 `OFF`).

2. **팝업에서 설정 변경**:
   - 사용자가 팝업에서 타이머 활성화, 사운드 선택, 간격 설정, 볼륨 조절 등을 변경합니다.
   - 변경된 설정은 `popup.js`를 통해 `chrome.storage.local`에 저장됩니다.
   - 변경 사항에 따라 `background.js`로 메시지가 전송되어 알람을 재설정하거나 배지를 업데이트합니다.
   - 사운드 변경 시 테스트 사운드가 재생됩니다.

3. **알람 발생 시 사운드 재생**:
   - 설정된 간격으로 `chrome.alarms`가 알람을 발생시킵니다.
   - 알람 발생 시 `background.js`의 알람 리스너가 `AudioManager.playSound()`를 호출합니다.
   - `AudioManager`는 오프스크린 문서를 생성하고, `audio-player.html`로 사운드 재생 요청을 보냅니다.
   - `audio-player.js`는 요청받은 사운드를 재생합니다.

4. **배지 업데이트**:
   - 타이머 활성화 상태에 따라 확장 아이콘의 배지 텍스트가 `ON` 또는 `OFF`로 변경됩니다.
   - 배지 배경색도 상태에 따라 녹색(`ON`) 또는 회색(`OFF`)으로 설정됩니다.

## 확장 프로그램의 주요 상호작용

- **팝업 ↔ 백그라운드**:
  - 설정 변경 시 팝업이 백그라운드로 메시지를 전송하여 알람 및 배지를 업데이트.
  
- **백그라운드 ↔ 오프스크린 문서**:
  - 사운드 재생 요청 시 백그라운드가 오프스크린 문서에 메시지를 전송하여 사운드를 재생.

## 보안 및 권한(Permissions)

- **권한**:
  - `storage`: 설정값 저장 및 로드.
  - `alarms`: 주기적인 알람 설정.
  - `offscreen`: 사운드 백그라운드 재생을 위한 오프스크린 문서 생성 및 관리.
  
- **콘텐츠 보안 정책(CSP)**:
  - `manifest.json`과 `audio-player.html`에서 스크립트 소스를 `self`로 제한하여 보안 강화.

## 사용자 인터페이스(UI) 디자인

- **팝업 디자인**:
  - 직관적인 토글 스위치, 라디오 버튼, 슬라이더 등을 사용하여 사용자가 쉽게 설정을 변경할 수 있도록 구성.
  - 반응형 디자인으로 다양한 화면 크기에서도 일관된 사용자 경험 제공.

- **환영 페이지**:
  - 깔끔한 레이아웃과 시각적 효과를 통해 사용자에게 프로젝트의 주요 기능과 향후 계획을 효과적으로 전달.

## 향후 개선 사항

- **사용자 사운드 업로드 기능**:
  - `welcome.html`의 "Coming Soon" 섹션에서 언급된 사용자 정의 사운드 업로드 기능을 추가하여 사용자 경험을 향상.

- **다중 언어 지원**:
  - 현재는 한국어로 작성된 UI 및 문서에 대해 다국어 지원을 추가하여 더 많은 사용자에게 접근성 제공.

- **테스트 및 디버깅**:
  - 유닛 테스트 및 통합 테스트를 통해 코드의 안정성과 신뢰성 향상.
  - Chrome DevTools를 활용한 디버깅 프로세스 강화.

## 결론

**Airplane Chime Timer**는 사용자 친화적인 인터페이스와 안정적인 사운드 재생을 통해 항공 애호가들에게 유용한 도구를 제공합니다. 이 문서가 프로젝트의 코드 흐름과 구조를 이해하는 데 도움이 되길 바랍니다. 추가적인 질문이나 개선 사항이 있다면 언제든지 [skykum2004@gmail.com](mailto:skykum2004@gmail.com)으로 연락주시기 바랍니다.