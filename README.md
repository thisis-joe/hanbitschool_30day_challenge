# 한빛학교 계정·학급 서비스

학생 가입·로그인, 관리자 교사 계정 발급, 교사 학급 생성·가입 코드·학교 내 명단 조회를 구현한 첫 개발 단계입니다. 학습 150문항·30회 진행, 타이머, 보상과 지도는 후속 개발 범위입니다.

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

같은 학교·학년·반은 하나, 같은 학급·번호도 하나입니다. 동시 가입의 중복 요청은 409로 거절하며 계정·프로필을 함께 롤백합니다. 공개 가입 역할은 항상 학생입니다. 계정 복구·소속 이동·학기 초기화 기능은 이번 단계에 없습니다.

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

실제 브라우저 검증은 별도 Compose 프로젝트와 DB 볼륨을 사용합니다. `.env.example`을 `.env.e2e.local`로 복사해 **테스트 전용** DB·관리자 값을 입력합니다. 로컬 인스턴스와 E2E는 같은 8088 포트를 사용하므로 동시에 실행하지 않습니다.

```powershell
docker compose -p hanbit-local --env-file .env.local -f infra/compose.local.yml stop
Copy-Item .env.example .env.e2e.local
notepad .env.e2e.local
pnpm --dir frontend exec playwright install chromium
docker compose -p hanbit-account-e2e --env-file .env.e2e.local -f infra/compose.local.yml up --build -d --wait
pnpm --dir frontend test:e2e
```

각 테스트가 실제 화면에서 고유한 교사·학급을 생성해 다른 테스트의 데이터를 전제로 삼지 않습니다. 영상·trace·자동 실패 스크린샷은 끕니다. 초기 비밀번호를 일반 로그·조회 캐시·브라우저 저장소에 남기지 않습니다.

계정 데이터는 `school-data` 볼륨에 보관됩니다. `docker compose ... restart backend web` 뒤 다시 로그인하면 같은 계정·소속·명단이 유지됩니다. 서버 재시작으로 메모리 세션은 만료될 수 있습니다. 중지는 `stop`을 사용하며 DB 볼륨을 삭제하지 않습니다.

## 코드와 설계

- `backend/src/main/java/kr/hanbit/school/account`: 가입·인증·자기 정보·비밀번호 버전
- `backend/src/main/java/kr/hanbit/school/classroom`: 소속 코드 검증·학교 권한·학급과 명단
- `backend/src/main/java/kr/hanbit/school/staff`: 초기 관리자·교사 발급
- `backend/src/main/java/kr/hanbit/school/security`: 세션·CSRF·역할·초기 비밀번호 제한
- `backend/src/main/resources/db/migration`: 영구 스키마와 유일 제약
- `frontend/src/features`: 학생과 교직원 화면
- [설계](docs/superpowers/specs/2026-10-12-account-classroom-design.md)
- [구현 계획](docs/superpowers/plans/2026-10-12-account-classroom.md)

[실행 검증과 최종 리뷰 반영 기록](docs/verification/2026-10-12-account-classroom.md)에서 테스트 결과와 구현 중 확정한 사항을 확인할 수 있습니다.
