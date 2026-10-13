# 학습 코어 운영 재배포 확인

확인일: 2026-10-13 07:46~07:48 (Asia/Seoul).

사용자가 PR #3 병합 후 기존 링크의 재배포를 요청했다. 병합된 `origin/main`은 `a08969233b7f6f8c8ac530ddabaa06d53fcafd3d`이며 학습 코어 검증 HEAD `c960c4095da5ff8a76564f618f87fa4f6ba778aa`를 포함한다. 이 main과 학습 코어 HEAD의 파일 트리는 동일하다.

## 배포 소스와 경로

- 배포 브랜치: `deploy/learning-core-redeploy`.
- 실행 소스: `bce698c2a1f1a0b79d5b81d90d1647eefec9d6cc`.
- 기존 운영 설정 커밋 `14fb2ecc6f4cddac744f36bcdf31ed30a48ee937`을 병합된 main 위에 cherry-pick했다. 변경은 `.env.example`, README, Cloudflare config, production Compose, nginx HTTPS 전달 설정의 5개 파일이다. backend/frontend 소스는 main과 동일하다.
- Compose 프로젝트: `hanbit-prod`; DB 볼륨: `hanbit-prod_school-data`.
- 외부 경로: `https://hanbit.thisis-joe.com` → 기존 Cloudflare Tunnel → `web:80` → nginx `/api` → `backend:8080`.
- 배포 체크아웃: `/Users/Joseph/workspaces/hanbitschool_30day_challenge/.worktrees/project-handoff-review`. 현재 tunnel config가 이 워크트리를 read-only bind하므로 운영 중에는 이 경로를 보존한다.

실행 명령:

```sh
docker compose -p hanbit-prod --env-file /Users/Joseph/workspaces/hanbitschool_30day_challenge/.env.prod.local -f infra/compose.prod.yml config --quiet
docker compose -p hanbit-prod --env-file /Users/Joseph/workspaces/hanbitschool_30day_challenge/.env.prod.local -f infra/compose.prod.yml build backend web
docker compose -p hanbit-prod --env-file /Users/Joseph/workspaces/hanbitschool_30day_challenge/.env.prod.local -f infra/compose.prod.yml up --no-build -d --wait --wait-timeout 120
```

세 명령 모두 exit 0. backend bootJar 빌드는 11초에 성공했고 frontend production build는 87 modules를 변환했다. DB 컨테이너는 재생성하지 않고 backend/web/tunnel만 교체했다.

| 배포 대상 | 실행 image ID |
| --- | --- |
| backend | `sha256:e22d0f54ead1c48bcf60dc559de90824f16690ca4103ec9abcee8c6f34c12578` |
| web | `sha256:5898e8c4451f84145040925fa9676c72117c7c4b038ad340e3855b9abc5a0dc4` |

실행 backend의 `/app/app.jar` SHA-256은 `5dbbc9dddd7d4ce0211e7902762467bf08097d4488b8508340538cafe8a135c2`다. backend는 healthy, restart count 0이며 web/tunnel은 running이다. tunnel은 4개의 QUIC 연결을 등록했다.

## DB 보존과 마이그레이션

적용 전 실제 운영 DB에는 V1만 있었다. 따라서 이전 기능 브랜치의 V2/V3 체크섬 충돌은 이 환경에 없었다. 변경 전 `pg_dump --format=custom` 백업을 생성하고 `pg_restore --list`로 archive를 확인했다. 백업 디렉터리는 700, 파일은 600 권한으로 맥미니에 보관한다. 비밀번호·자격 증명·계정 행 내용은 기록하지 않는다.

운영 PostgreSQL 17.11에서 Flyway가 7개 migration을 검증하고 새 V2~V7 6개를 적용하여 version v7에 도달했다. JPA EntityManagerFactory 초기화와 `Started HanbitApplication` 로그를 확인했다.

| 항목 | 배포 전 | 배포 후 |
| --- | ---: | ---: |
| 계정 | 1 | 1 |
| 학교 | 1 | 1 |
| 학급 | 1 | 1 |
| 학생 profile | 0 | 0 |

DB 컨테이너 ID와 `hanbit-prod_school-data` 볼륨은 동일하다. 콘텐츠는 active `hanbit-v1`, 정규화 digest `775b8cd7314ecfad9f93ad0ced97d4ca956093ae48b148d4fa438959214dfaeb`, 30회·150문항, O=87/X=63을 실제 운영 DB에서 확인했다.

## 외부 링크와 브라우저 확인

| 확인 | 실제 결과 |
| --- | --- |
| HTTPS `/login` | 200 |
| HTTPS `/signup` | 200 |
| HTTPS `/staff/login` | 200 |
| GET `/api/public/schools` | 기존 한빛학교 JSON 정상 반환 |
| GET `/api/auth/csrf` | 200; `Cache-Control: no-store` |
| 세션 쿠키 | `Secure; HttpOnly; SameSite=Lax` |
| 익명 GET `/api/student/learning/status` | 401 |
| 실제 브라우저 | 학생 로그인 화면, 한빛학교 선택 후 학년 옵션 조회, console error/warn 0 |
| 정적 자산 | 외부 HTML과 실행 web 컨테이너 모두 `index-DSKD5ZK6.js`, `index-DRpoWoo_.css` |

학생 계정이 아직 0개이므로 이번 운영 smoke에서는 인증된 학생 학습 요청을 새 계정 생성으로 검증하지 않았다. 학습 API의 실제 로그인·답변·재개·권한 계약은 동일 소스의 기존 559개 백엔드 테스트 및 실제 HTTP 집중 12개 검증 근거를 사용한다. 프런트엔드 30개 테스트·build·lint 결과는 [학습 코어 검증 기록](2026-10-12-learning-core.md)에 있다. 재배포에서는 production build와 실제 운영 스키마/콘텐츠/쿠키/링크를 추가 확인했다.

이번 병합과 배포는 백엔드 학습 코어 범위다. 학생 문제 풀이 화면·보상·지도·교사 학습 통계 UI는 후속 구현 범위이며 기존 로그인·가입 화면을 그대로 제공한다.
