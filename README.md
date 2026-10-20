# 한빛학교 계정·학급·학습 코어

학생 가입·로그인, 30회차·150문항 O/X 학습, 제한시간·결과·복습·별표, 캐릭터·장비·보상·탐험 지도와 교사용 학습 통계를 제공합니다. 관리자는 교사 계정을 발급하고, 교사는 학급 생성·가입 코드 안내·학교 내 명단 조회를 할 수 있습니다. 랭킹과 연속일은 후속 개발 범위입니다.

[비개발자를 위한 현재 기능과 화면 이용 가이드](docs/reports/한빛학교_서비스_기능_보고.docx)는 2026-10-14 기준 실제 화면 캡처로 사용자별 이용 순서, 누를 버튼과 확인할 결과를 안내합니다. 캡처의 학급·학생·수치는 안내용 예시입니다.

## 기술

Java 21 / Spring Boot 4.1.1 / Gradle 8.14.6 / PostgreSQL 17 / React 19.3.0 / TypeScript 6.0.3 / Vite 8.3.4 / React Router / TanStack Query. Node.js 24, pnpm 11.25.0을 사용합니다. 의존성 버전과 잠금 파일을 저장했습니다. TypeScript는 현재 린터와 호환되는 안정판을 선택했습니다.

## 로컬 실행

Docker Desktop을 실행한 뒤 저장소 루트의 PowerShell에서 환경 파일을 복사합니다.

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

`POSTGRES_PASSWORD`와 초기 관리자 아이디·비밀번호를 직접 입력해 저장합니다. 관리자 아이디는 영문 소문자·숫자와 `._-`, 3~40자입니다. 비밀번호는 8자 이상, UTF-8 72바이트 이하입니다. 예제에는 실제 비밀번호나 기본 비밀번호가 없습니다. `.env.local`은 Git에서 제외됩니다.

```powershell
docker compose -p hanbit-local --env-file .env.local -f infra/compose.local.yml config --quiet
docker compose -p hanbit-local --env-file .env.local -f infra/compose.local.yml up --build -d --wait
```

[학생 로그인](http://localhost:8088/login), [교직원 로그인](http://localhost:8088/staff/login)을 엽니다. 웹 포트만 127.0.0.1에 열리며 DB와 백엔드는 Docker 내부에서 연결됩니다.

최초 관리자 생성 후 `.env.local`의 두 `HANBIT_BOOTSTRAP_ADMIN_*` 값을 모두 비워도 됩니다. 다음 시작에서 기존 계정·해시는 유지됩니다. 한 값만 있으면 시작 오류가 발생합니다. 관리자 비밀번호는 `/account/password`에서 변경합니다.

이 실행 묶음은 로컬 HTTP용이므로 세션 쿠키의 Secure가 꺼집니다. 기본 서버 설정은 HttpOnly·Secure·SameSite=Lax와 유휴 만료 30분입니다. 학교 운영 서버·도메인·TLS 설정은 별도의 배포 단계에서 정합니다.

## 운영 배포 (맥미니 + Cloudflare Tunnel)

`https://hanbit.thisis-joe.com`은 이 맥미니의 Docker(Colima) 스택을 Cloudflare Tunnel `hanbit`으로 공개합니다. 공인 포트를 열지 않으며, TLS는 Cloudflare가 종료합니다. 운영 스택은 `local` 프로필을 쓰지 않으므로 세션 쿠키가 Secure입니다.

`.env.prod.local`(Git 제외)에 DB·초기 관리자 값과 `HANBIT_TUNNEL_ID`, `HANBIT_TUNNEL_CREDENTIALS`(터널 자격 증명 JSON 경로)를 둡니다.

```bash
docker compose -p hanbit-prod --env-file .env.prod.local -f infra/compose.prod.yml up --build -d --wait
```

모든 서비스는 `restart: unless-stopped`이므로 Colima가 켜지면 함께 올라옵니다. 로컬 확인용 포트는 `127.0.0.1:8089`입니다.

## 사용 흐름

1. 초기 관리자가 교직원 로그인 화면에 로그인하고 **교사 계정**에서 교사 이름과 아이디를 발급합니다. 초기 비밀번호는 발급 직후 현재 화면에서만 보이며 목록·새로고침으로 복구되지 않습니다.
2. 교사는 발급 아이디로 로그인하고 초기 비밀번호와 다른 새 비밀번호로 변경합니다. **학급 만들기**에서 학년 표시·반 번호·시작일을 입력하고 가입 코드를 학생에게 알려줍니다.
3. 학생은 `/signup`에서 학교·학년·반·번호·이름·별명·비밀번호·학급 가입 코드를 입력합니다. 소속과 코드가 일치하면 즉시 가입됩니다.
4. 가입 후 학교·학년·반·번호·비밀번호로 로그인합니다. 가입 코드는 로그인에 쓰이지 않습니다. 번호 `01`과 `1`은 같은 학생 번호입니다.
5. 교사는 담당 학급 또는 학교 전체 학급의 실제 이름·번호 명단을 조회합니다. 비담당 학급의 가입 코드와 학생 개인 별표·별명은 명단에 표시하지 않습니다.
6. 학생 로그인 후 `/student/learning`에서 **오늘 학습 시작**, **다시 도전하기**, **이어풀기**를 사용합니다. 날짜·이전 회차 통과 여부에 따른 잠금은 서버 상태를 따릅니다. 기존 **내 정보**·**비밀번호 변경**·**로그아웃**은 주 메뉴에서 사용합니다.
7. 답변 확정 후 정답·오답·시간 초과 문구와 해설·지급 XP를 확인하고 **다음 문제**를 누릅니다. 다섯 번째 답변 때 결과가 이미 저장되며 **완료하기**는 결과 화면으로 이동합니다. 새로고침·재로그인·다른 브라우저에서 이어풀어도 문항의 서버 제한시간은 늘어나지 않습니다.
8. **나의 문제**의 다시 볼 문제·복습 완료·별표한 문제 필터에서 최근 결과와 복습·목록·별표 상태를 각각 확인합니다. 처음 틀린 문제는 다시 볼 목록에 들어가고, 나중에 틀린 문제의 추가 제안은 학생의 동의 때 저장합니다. 수동으로 추가한 문제는 이후 정답에도 유지되며 별표와 독립적입니다.

같은 학교·학년·반은 하나, 같은 학급·번호도 하나입니다. 동시 가입의 중복 요청은 409로 거절하며 계정·프로필을 함께 롤백합니다. 공개 가입 역할은 항상 학생입니다. 계정 복구·소속 이동·학기 초기화 기능은 이번 단계에 없습니다.

## 학습 코어 API와 운영

승인 콘텐츠는 `backend/src/main/resources/content/hanbit-v1.json`의 `hanbit-v1`입니다. 30회×5문항, ID 1~150이며 O는 사실(87문항), X는 해석(63문항)입니다. 원본 SHA-256은 `c59de1f6028f4669a41c60c9eee573ae8c4e7ec08c7350036512d2dac638a698`, 정규화 JSON SHA-256은 `775b8cd7314ecfad9f93ad0ced97d4ca956093ae48b148d4fa438959214dfaeb`입니다.

서버는 기동 시 정본 구조·해시를 검증하고 신규 콘텐츠를 한 트랜잭션으로 등록합니다. 같은 버전의 해시가 다르거나 기존 회차·문항이 누락/변조됐거나 정본이 비활성이면 기동이 실패합니다. 기존 내용을 자동 덮어쓰거나 부분 복구하지 않습니다. 스키마는 Flyway V1~V7로 관리하며 JPA는 `ddl-auto=validate`를 사용합니다.

학생 세션으로 `/api/auth/csrf`에서 CSRF 토큰을 받은 뒤 `/api/student/learning` 아래의 `/status`, `/sessions`, `/sessions/{id}`, `/sessions/{id}/answers`, `/sessions/{id}/advance`를 사용합니다. 같은 namespace의 개인 목록 `/questions`는 `filter`에 `REVIEW_QUEUE`, `MASTERED`, `BOOKMARKED` 중 하나를 받습니다. 수동 등록·해제는 `/review-queue/{questionId}`와 `/bookmarks/{questionId}`의 PUT/DELETE입니다. 학생 ID는 인증 principal에서 결정하고, 교직원은 학생 학습 API에 접근할 수 없습니다. 타 학생의 세션 조회·답변·advance는 404로 거절하며 교사용 학급·명단 응답에는 개인 문제 목록·복습 완료·별표·최근 답변을 포함하지 않습니다.

날짜 상한은 학급 시작일과 `Asia/Seoul` 서버 날짜로 0~30회까지 계산합니다. 가장 앞선 미통과 회차를 통과해야 다음 회차가 열리며, 밀린 학생은 같은 날 날짜 상한까지 순서대로 따라잡을 수 있습니다. 5문항 중 3개 이상 정답이면 통과합니다. 다섯 번째 답변이 결과·통과·XP를 저장하므로 마지막 `완료하기`는 결과 화면으로 이동하는 동작입니다.

문항의 제한시간은 `Character.isWhitespace`를 제외한 유니코드 코드포인트 수로 10~15초입니다. 서버가 저장한 `deadlineAt`은 새로고침·다른 기기 로그인으로 초기화하지 않습니다. 저장/응답 시각은 마이크로초로 내리지만 답변 판정은 잠금 대기 전에 받은 원시 서버 시각을 비교합니다. 마감과 같은 시각은 유효하며 1ns 뒤는 선택을 버리고 시간 초과(`choice=null`)로 확정합니다. 정답·해설은 확정 후에만 제공합니다.

첫 답변은 문항당 한 번만 저장합니다. 기본 375 XP, 정답 +190, 3연속 +375, 5연속 +750, 최초 회차 통과 1,125 XP이며 5연속에 3연속 보너스를 중복하지 않습니다. 밀린 첫 답변/최초 통과는 최종 지급액이 정확히 1 XP 작습니다. FIRST의 밀림 여부는 시작 시 고정하고, REPLAY로 최초 통과하는 경우 통과 시점의 날짜 상한으로 판정합니다. 재도전·통과 회차 재학습(REPLAY)과 선택 복습(REVIEW)은 답변당 1 XP이며 첫 답변을 바꾸지 않습니다. 레벨은 `floor(totalXp / 3750) + 1`, 누적 XP는 불변 원장의 `long` 합계입니다.

첫 오답·시간 초과는 자동 다시 볼 문제입니다. 반복 풀이의 정답은 복습 완료 기록을 한 번 만들고 자동 항목을 해제합니다. 이후 오답은 과거 정답·복습 완료를 보존하고 수동 등록을 제안합니다. 사용자 동의로 등록한 항목은 정답으로 자동 해제하지 않으며 명시적 DELETE로 해제합니다. 별표는 이 상태들과 독립적입니다. 같은 학생·작업·`requestId`와 같은 payload는 최초 응답 전체를 재생하며 다른 payload는 409 `IDEMPOTENCY_KEY_REUSED`입니다. 재전송은 새 반복 풀이가 아니므로 추가 XP를 만들지 않습니다.

| 속성 | 운영 기본값 | 동작 |
| --- | --- | --- |
| `hanbit.learning.expiry-enabled` | `true` | 만료된 활성 문항의 주기 처리 활성화 |
| `hanbit.learning.expiry-delay-ms` | `1000` | 이전 주기 종료 후 다음 실행까지 대기(ms) |
| `hanbit.learning.expiry-batch-size` | `100` | 주기당 처리할 최대 세션 수; 양수 필요 |

만료 worker는 마감 뒤의 `QUESTION_ACTIVE`만 deadline·UUID 순서로 조회하고, 답변 API와 같은 잠금·확정 경로를 별도 트랜잭션에서 사용합니다. 개별 세션 실패는 그 세션을 롤백하며 다음 후보 처리를 계속합니다. Gradle 테스트는 주기 처리를 기본 비활성화하고 `ExpiredAnswerSchedulerIT`만 활성화·50ms 간격으로 실제 주기를 검증합니다. HTTP 통합 테스트의 비보안 쿠키 설정은 `LearningHttpIT`에만 적용하며 `ProductionCookieIT`는 기본 HttpOnly·Secure·SameSite=Lax를 검증합니다.

## 개발과 검증

```powershell
.\backend\gradlew.bat -p backend test
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend lint
pnpm --dir frontend dev
```

백엔드 통합 테스트는 Docker의 실제 PostgreSQL 17 Testcontainers를 사용합니다. 프런트엔드 개발 서버의 `/api`는 `http://localhost:8080`으로 전달됩니다. 직접 백엔드를 실행하려면 DB URL·사용자·비밀번호 환경 변수를 지정한 뒤 `bootRun --args='--spring.profiles.active=local'`을 사용합니다.

저장소 루트에서 학습 코어의 실제 HTTP 집중 검증, 전체 백엔드 검증, 고정 프런트엔드 도구 버전 검증을 실행합니다. 마지막 명령은 전역 Node 설치를 변경하지 않습니다.

```sh
./backend/gradlew -p backend test --tests '*LearningHttpIT' --tests '*ClassroomAccessIT' --tests '*ProductionCookieIT'
./backend/gradlew -p backend clean test
npx --yes --package=node@24 --package=pnpm@11.25.0 -c 'node --version && pnpm --version && pnpm --dir frontend test && pnpm --dir frontend build && pnpm --dir frontend lint'
```

2026-10-13 검증 결과는 집중 12개·전체 백엔드 559개 모두 실패/오류/건너뜀 0, Node `v24.21.0`·pnpm `11.25.0`에서 프런트엔드 30개 테스트·build·lint 통과입니다. [학습 코어 검증 기록](docs/verification/2026-10-12-learning-core.md)에 요구사항별 테스트와 마이그레이션·커밋 근거를 기록했습니다. 이전 V2/V3를 이미 적용한 영구 DB는 변경된 체크섬 때문에 별도의 전진 마이그레이션 전략이 필요합니다. 이번 검증은 신규 컨테이너 DB를 사용했습니다.

실제 브라우저 검증은 별도 Compose 프로젝트와 DB 볼륨을 사용합니다. 이 워크트리의 `.env.e2e.local`에 새 **테스트 전용** DB·관리자 값을 입력하고 파일 권한을 600으로 제한합니다. 기존 파일이 있으면 읽거나 재사용하지 말고 안전한 로컬 위치에 보관한 뒤 새로 만듭니다. `HANBIT_HTTP_PORT=8090`을 넣으면 기본 8088 인스턴스와 동시에 실행할 수 있습니다. 기본값은 기존 8088과 `hanbit-account-e2e`이며 게임 검증은 `hanbit-game-e2e`와 그 프로젝트의 별도 볼륨을 사용합니다.

```powershell
$env:HANBIT_E2E_BASE_URL = 'http://127.0.0.1:8090'
$env:HANBIT_E2E_COMPOSE_PROJECT = 'hanbit-game-e2e'
$env:HANBIT_GEAR_QA_URL = 'http://127.0.0.1:8091/e2e/fixtures/equipment-review.html'
# .env.e2e.local: 새 테스트 자격 증명과 HANBIT_HTTP_PORT=8090, 권한 600
# 모든 Docker 명령 전에 프로젝트 이름과 기존 컨테이너의 worktree 소유 라벨을 확인합니다.
docker compose -p hanbit-game-e2e --env-file .env.e2e.local -f infra/compose.local.yml config --quiet
pnpm --dir frontend exec playwright install chromium
docker compose -p hanbit-game-e2e --env-file .env.e2e.local -f infra/compose.local.yml build backend web
docker compose -p hanbit-game-e2e --env-file .env.e2e.local -f infra/compose.local.yml up -d --wait db backend
docker compose -p hanbit-game-e2e --env-file .env.e2e.local -f infra/compose.local.yml up -d web
# /api/auth/csrf HTTP 200을 확인합니다. 별도 터미널: pnpm --dir frontend dev --port 8091 --strictPort
pnpm --dir frontend test:e2e
```

각 테스트가 실제 화면에서 고유한 교사·학급을 생성해 다른 테스트의 데이터를 전제로 삼지 않습니다. 학습 검증의 시작일은 서버 HTTP Date의 서울 날짜에서 하루 전으로 지정해 두 회차를 사용할 수 있게 합니다. 학습만 확인하려면 `pnpm --dir frontend exec playwright test e2e/learning-flow.spec.ts`를 실행합니다. 정본 답은 Node 테스트 프로세스에서만 읽고 학생 코드에 포함하지 않습니다.

영상·trace·자동 실패 스크린샷을 끄고 실패 DOM 문맥을 포함한 테스트 산출물도 보존하지 않습니다. 초기 비밀번호를 일반 로그·조회 캐시·브라우저 저장소에 남기지 않습니다. 화면의 360px/1280px 가로 넘침·48px 대상·키보드 focus를 DOM으로 측정합니다. 로그인 없는 아트 비교 화면은 9명 × 기본/5세트/2혼합의 원본과 제품 픽셀을 대조합니다. 무시되는 `.superpowers/` 폴더에는 아트 비교·익명화한 합성 결과 화면·집계 측정값만 보관합니다. 원본 파일 위치는 `HANBIT_GEAR_REFERENCE`로 지정할 수 있습니다. 이 검수 화면은 Vite 개발 서버 전용이며 배포 경로에 포함되지 않습니다. [학생 게임 검증 기록](docs/verification/2026-10-13-game-experience.md)에 실제 테스트 수와 요구사항별 근거·한계를 기록했습니다.

`HANBIT_E2E_BASE_URL`은 루프백 HTTP origin만 허용하고, `HANBIT_E2E_COMPOSE_PROJECT`는 `^hanbit-[a-z0-9-]*e2e$` 형식과 비운영 이름만 허용합니다. 계정 테스트의 두 재시작 경로는 같은 검증된 프로젝트와 소유 라벨을 확인한 뒤 backend → Docker healthy → web → HTTP 200 순서로 실행합니다. 관찰이 늦다고 실행 중 프로세스를 다시 시작하지 않습니다.

증거 저장은 기본적으로 꺼져 있습니다. 픽셀·게임·레이아웃 검증은 모두 수행하지만, 어떤 계획의 scratch 폴더도 읽거나 만들지 않습니다. 자료가 필요한 실행에서만 아래 두 값을 함께 지정합니다. 영문 소문자·숫자·하이픈 식별자만 허용하며 경로·`..`·심볼릭 링크는 거절합니다. 매 명령마다 새로운 실행 이름을 사용해야 하며 기존 실행 폴더는 덮어쓰거나 이어 쓰지 않습니다.

```powershell
# 교사 계획의 통합 검증 예시: 선행 학생 계획 폴더를 지정하지 않습니다.
$env:HANBIT_E2E_EVIDENCE_PLAN = '2026-10-13-teacher-learning-statistics'
$env:HANBIT_E2E_EVIDENCE_RUN = 'combined-review-001' # 다음 실행은 새 이름
pnpm --dir frontend test:e2e
```

출력은 현재 체크아웃의 `.superpowers/sdd/<계획>/evidence/<실행>/`으로만 제한됩니다. 계정 자격 증명이나 정본 답을 읽지 않는 테스트 전용 도우미가 경로를 검증합니다. 저장되는 자료는 아트 비교 PNG, 익명화한 합성 결과 PNG, 세션 ID를 제거한 레이아웃 JSONL뿐입니다. `HANBIT_E2E_EVIDENCE_PLAN`과 `HANBIT_E2E_EVIDENCE_RUN`을 모두 해제하면 다시 무출력 검증이 됩니다. 라우팅 회귀 검증은 Node 24에서 `node --test scripts/evidence-output.test.ts`로 실행합니다.

계정 데이터는 `school-data` 볼륨에 보관됩니다. 재시작할 때는 backend가 실제로 healthy가 된 뒤 web을 재시작하고, HTTP 응답까지 확인합니다. 아래 예시는 위의 격리 E2E 환경에서 실행하는 순서입니다.

```powershell
if ($env:HANBIT_E2E_COMPOSE_PROJECT -cnotmatch '^hanbit-[a-z0-9-]*e2e$' -or $env:HANBIT_E2E_COMPOSE_PROJECT -match '(^|-)prod(-|$)') { throw 'E2E 프로젝트 확인 필요' }
docker compose -p $env:HANBIT_E2E_COMPOSE_PROJECT --env-file .env.e2e.local -f infra/compose.local.yml restart backend
if ($LASTEXITCODE -ne 0) { throw 'backend 재시작 실패' }
$restartDeadline = (Get-Date).AddSeconds(90)
do {
    $backendHealth = docker inspect --format '{{.State.Health.Status}}' "$($env:HANBIT_E2E_COMPOSE_PROJECT)-backend-1"
    if ($backendHealth -eq 'healthy') { break }
    if ((Get-Date) -ge $restartDeadline) { throw 'backend health 확인 시간 초과' }
    Start-Sleep -Seconds 1
} while ($true)
docker compose -p $env:HANBIT_E2E_COMPOSE_PROJECT --env-file .env.e2e.local -f infra/compose.local.yml restart web
if ($LASTEXITCODE -ne 0) { throw 'web 재시작 실패' }
$restartDeadline = (Get-Date).AddSeconds(90)
do {
    try { $httpStatus = (Invoke-WebRequest "$($env:HANBIT_E2E_BASE_URL)/api/auth/csrf" -UseBasicParsing -TimeoutSec 5).StatusCode }
    catch { $httpStatus = 0 }
    if ($httpStatus -eq 200) { break }
    if ((Get-Date) -ge $restartDeadline) { throw 'web HTTP 준비 확인 시간 초과' }
    Start-Sleep -Seconds 1
} while ($true)
```

다시 로그인하면 같은 계정·소속·명단이 유지됩니다. 서버 재시작으로 메모리 세션은 만료될 수 있습니다. 중지는 `stop`을 사용하며 DB 볼륨을 삭제하지 않습니다.

## 코드와 설계

- `backend/src/main/java/kr/hanbit/school/account`: 가입·인증·자기 정보·비밀번호 버전
- `backend/src/main/java/kr/hanbit/school/classroom`: 소속 코드 검증·학교 권한·학급과 명단
- `backend/src/main/java/kr/hanbit/school/staff`: 초기 관리자·교사 발급
- `backend/src/main/java/kr/hanbit/school/security`: 세션·CSRF·역할·초기 비밀번호 제한
- `backend/src/main/java/kr/hanbit/school/content`: 승인 콘텐츠·해시·제한시간·기동 무결성
- `backend/src/main/java/kr/hanbit/school/learning`: 진행·서버 타이머·답변·복습·개인 목록·XP·주기 만료
- `backend/src/main/resources/db/migration`: 영구 스키마와 유일 제약
- `frontend/src/features`: 학생과 교직원 화면
- [설계](docs/superpowers/specs/2026-10-12-account-classroom-design.md)
- [구현 계획](docs/superpowers/plans/2026-10-12-account-classroom.md)
- [학습 코어 설계](docs/superpowers/specs/2026-10-12-learning-core-design.md)
- [학습 코어 구현 계획](docs/superpowers/plans/2026-10-12-learning-core.md)

[실행 검증과 최종 리뷰 반영 기록](docs/verification/2026-10-12-account-classroom.md)에서 테스트 결과와 구현 중 확정한 사항을 확인할 수 있습니다.

[학생 학습 UI 검증 기록](docs/verification/2026-10-13-student-learning-ui.md)은 코드 검증과 기존 HTTPS 링크 재배포 상태를 구분해 기록합니다. 학생 학습 UI의 운영 반영은 최종 독립 리뷰와 배포 후 확인을 마친 뒤 확정합니다.
