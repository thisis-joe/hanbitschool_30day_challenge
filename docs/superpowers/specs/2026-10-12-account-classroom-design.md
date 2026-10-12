# 한빛학교 계정·학급 연결 설계 기준

작성일: 2026-10-12 · 상태: 구현 계획 검토용 초안

## 1. 목적과 범위

학생이 학교·학년·반·번호·이름·별명으로 가입하고 비밀번호로 로그인하며, 교사가 실제 학급 명단을 조회할 수 있는 첫 기능을 만든다. 관리자가 교사 계정을 발급하고 교사가 학급 코드를 생성하는 흐름까지 독립적으로 실행·검증한다.

사용자가 구현 계획 작성을 요청하여 현재 합의와 구현 제안을 문서화한다. 이 문서는 구현 완료 보고서나 코드 작성 승인 기록이 아니다. 아래의 **확정 요구사항**과 **검토할 구현 제안**을 구분해 검토한다.

이번 범위는 계정, 세션, 교사 계정 발급, 학급 생성, 학생 가입, 학교 내 명단 조회다. 150문항 이관, 실제 풀이·타이머·XP·보상·지도·아바타·랭킹·개인 별표는 각각의 후속 설계와 계획에서 구현한다. 학생 화면의 도착 지점은 실제 계정 정보 화면이며 가상 학습 통계를 만들지 않는다.

## 2. 확정 요구사항

| ID | 요구사항 | 근거 |
| --- | --- | --- |
| C01 | 학생이 직접 가입하고 학급 코드로 참여한다. | 사용자 선택 |
| C02 | 가입 정보는 학교·학년·반·번호·이름·별명·비밀번호다. 학급 코드도 받는다. | 사용자 답변 |
| C03 | 학생 로그인은 학교·학년·반·번호·비밀번호다. 로그인에 학급 코드를 요구하지 않는다. | 사용자 선택 |
| C04 | 유효한 코드로 가입하면 교사 승인 없이 즉시 참여한다. | 사용자 선택 |
| C05 | 별명은 학생 화면·랭킹의 표시 이름, 이름·번호는 교사 명단의 학생 확인 정보다. | 사용자 별명 추가 요청과 인수인계 17·22절 |
| C06 | 교사 계정은 관리자가 발급한다. 학생의 공개 가입으로 교사 권한을 얻지 않는다. | 사용자 선택 |
| C07 | 학생별 30회 고정 과정이다. 학기·기수별 재시작은 다루지 않는다. | 사용자 답변 |
| C08 | 다른 앱으로 이동해도 풀이 시간은 계속 흐르며 서버 만료 시각을 따른다. | 사용자 선택; 실제 구현은 후속 학습 계획 |
| C09 | 교사는 소속 학교 전체 학생 기록을 조회할 수 있다. 조회 권한이 전체 수정 권한을 뜻하지 않는다. | 인수인계 16·24절 |
| C10 | 학생 개인 별표는 교사 조회 응답에서 제외한다. | 인수인계 10·24절; 현재 단계에는 별표 테이블 없음 |

인수인계에 남아 있는 학기·기수 질문과 탭 숨김 시간 정책은 C07·C08로 대체한다. 인수인계의 구현 제안 전체를 승인된 정책으로 취급하지 않는다.

## 3. 검토할 구현 제안

| ID | 제안 | 적용 이유 |
| --- | --- | --- |
| P01 | 학교·학년·반은 교사가 등록한 목록에서 선택하고, 가입 코드가 그 소속과 일치하는지 서버에서 검사한다. | 오타와 다른 학급 연결 방지 |
| P02 | 같은 학급에서 같은 번호로 계정을 둘 이상 만들 수 없다. 별명과 이름의 중복은 허용한다. | 번호로 로그인하는 조건을 충족하고 표시 이름을 식별 키와 구분 |
| P03 | 학급 생성과 코드 확인은 담당 교사 또는 관리자만 가능하다. 모든 교사는 자기 학교 전체 명단을 읽을 수 있다. | 조회와 관리 권한 분리 |
| P04 | 교사는 학급 생성 시 한국 날짜 기준 시작일을 지정한다. 생성 후 시작일·소속·담당자 변경과 반 이동은 이번 범위에서 제공하지 않는다. | 후속 해금 기능의 입력을 확보하고 미정 운영 변경 정책을 임의로 만들지 않음 |
| P05 | 초기 학교는 한빛학교 한 곳이다. 학교 ID는 UUID로 두고 모든 조회를 소속 학교로 제한한다. 학교 추가 화면은 후속 범위다. | 현재 학교에 집중하면서 다른 학교 데이터 혼합 방지 |
| P06 | 교사에게 무작위 초기 비밀번호를 한 번 표시하고 첫 로그인에서 변경하게 한다. | 발급용 비밀번호를 실제 사용 비밀번호와 구분 |
| P07 | 첫 관리자는 환경 변수로 한 번 생성한다. 관리자 계정이 이미 있으면 재실행해도 추가 생성·비밀번호 덮어쓰기를 하지 않는다. | 고정 기본 비밀번호와 재시작에 따른 계정 변경 방지 |
| P08 | 세션 쿠키로 인증한다. 비밀번호 변경 시 다른 기존 세션은 다음 요청에서 재로그인을 요구한다. | 동일한 웹서비스에서 로그인 상태와 계정 변경을 일관되게 처리 |
| P09 | 이름은 1~50자, 별명은 1~20자, 비밀번호는 8자 이상·UTF-8 72바이트 이하로 검증한다. 비밀번호는 공백 제거·정규화하지 않는다. | 입력 계약을 명확히 하고 BCrypt 입력 범위를 지킴 |

P01~P09는 사용자의 추가 답변으로 확정한 수치가 아니라 이 계획의 검토 대상이다. 검토에서 바뀌면 설계와 계획의 계약·테스트를 함께 수정한다.

## 4. 기술과 공통 제약

- Java 21, Spring Boot 4.1.1, Gradle Wrapper 8.14.6을 사용한다. Spring Security·JPA·Flyway·테스트 라이브러리는 Spring Boot가 관리하는 의존성 버전을 따른다.
- PostgreSQL 17, Flyway 버전형 SQL migration, JPA `ddl-auto=validate`를 사용한다. 실제 PostgreSQL로 통합 테스트하며 H2로 제약·동시성 검증을 대체하지 않는다.
- 프런트엔드는 React·TypeScript·Vite·React Router·TanStack Query다. Node.js 24, pnpm 11.25.0을 사용한다. 최초 구현 시 안정판을 정확 버전으로 고정하고 `pnpm-lock.yaml`을 보관한다.
- 작업 루트는 `C:/Users/workspaces/hanbit`다. Java 패키지는 `kr.hanbit.school`, 폴더는 기능별로 묶는다.
- 시간 저장은 `Instant`/PostgreSQL `timestamptz`, 학급 시작일은 `LocalDate`/`date`다. 학기·기수·연도별 초기화 모델을 추가하지 않는다.
- 계정의 영구 식별자는 UUID다. 이름·별명·로그인 입력 값으로 학습 기록의 외래키를 만들지 않는다.
- 공개 가입으로 생성되는 역할은 항상 `STUDENT`다. `TEACHER`는 관리자 발급, `ADMIN`은 초기 관리자 생성 경로에서만 만든다.
- 인증은 HttpOnly 세션 쿠키와 CSRF 토큰을 사용한다. 운영 설정은 Secure=true·SameSite=Lax·유휴 만료 30분, 로컬 HTTP 프로필만 Secure=false다.
- 비밀번호는 `PasswordEncoderFactories.createDelegatingPasswordEncoder()`로 해시 저장한다. 평문·해시·초기 비밀번호를 일반 응답·로그·테스트 첨부물에 남기지 않는다. 초기 비밀번호 발급 응답 한 번만 예외다.
- 화면은 320/390/768/1440px에서 가로 넘침 없이 사용 가능해야 한다. 주요 조작은 44px 이상, 모든 입력에 label, 오류에 `role=alert`를 제공한다.

## 5. 모듈과 데이터 흐름

`React 폼 → HTTP 인터페이스 → 업무 모듈 → JPA/PostgreSQL`로 흐른다. HTTP 컨트롤러는 입력 검증·응답·세션 연결을 담당하고, 업무 모듈은 역할·소속·중복·원자적 저장을 담당한다. 기존 저장소가 없으므로 가상의 저장소 포트를 여러 겹 추가하지 않고 실제 JPA repository를 내부 구현으로 사용한다.

| 모듈 | 호출자가 사용하는 인터페이스 | 내부에서 처리할 일 |
| --- | --- | --- |
| account | 가입, 학생/직원 인증, 자기 정보, 비밀번호 변경 | 해시, 역할 고정, 중복 번호, 영구 계정 ID |
| classroom | 학교/학급 목록, 코드 확인, 학급 생성, 명단 조회 | 소속 검사, 담당 교사, 코드 생성·충돌 처리 |
| staff | 교사 발급·목록 | 관리자 검사, 초기 비밀번호, 학교 범위 |
| security | 세션 생성·검증·폐기 | CSRF, 세션 ID 교체, 역할 검사, 비밀번호 버전 |

학생 가입은 코드와 선택 소속을 확인한 뒤 Account와 StudentProfile을 한 트랜잭션으로 저장한다. 성공 시 로그인 폼으로 이동하며 학교·학년·반·번호만 미리 채운다. 비밀번호는 전달·저장하지 않는다. 별도 승인 상태 없이 저장 즉시 학생 인증이 가능하다. 학생 소속은 선택한 학급으로 고정하며 이번 단계에는 전학·반 이동·자동 비밀번호 찾기를 추가하지 않는다.

학생 로그인은 선택 소속의 학급 ID와 번호로 Account를 찾고 해시를 검사한다. 성공하면 기존 익명 세션 ID를 교체하고 SecurityContext를 명시적으로 저장한다. 직원 로그인 ID와 학생 학년은 저장 시와 같은 정규화를 적용한다. 실패는 학생 존재 여부를 드러내지 않는 동일한 401 응답이다.

교사 발급은 관리자 세션의 학교를 기준으로 수행한다. 클라이언트가 전송한 역할·학교 ID를 권한 근거로 쓰지 않는다. 교사 첫 로그인은 비밀번호 변경 화면으로 연결하며 변경 전에는 자기 정보·비밀번호 변경·로그아웃만 가능하다. 비밀번호 변경은 passwordVersion 비교 후 원자적 갱신을 수행하고, 동시에 다른 변경이 먼저 확정되었으면 현재 요청은 401로 재로그인을 요구한다.

## 6. 저장 구조

일반 계정·학급 UUID는 애플리케이션에서 생성한다. 외래키 삭제 정책은 RESTRICT이며 계정·학급 삭제 기능은 이번 범위에 없다.

최초 한빛학교 행만 V1에서 ID `00000000-0000-4000-8000-000000000001`, 이름 `한빛학교`로 만든다. 관리자 부트스트랩은 이 고정 학교 ID와 두 환경 변수 `HANBIT_BOOTSTRAP_ADMIN_ID`, `HANBIT_BOOTSTRAP_ADMIN_PASSWORD`를 사용한다. 둘 다 비어 있으면 비활성화, 하나만 있으면 시작 오류, 관리자 존재 시 덮어쓰기 없이 건너뛴다.

| 테이블 | 필드 | 제약과 인덱스 |
| --- | --- | --- |
| schools | id UUID, name varchar(100), created_at timestamptz | id PK |
| accounts | id UUID, school_id UUID, role varchar(10), name varchar(50), staff_login_id varchar(40) nullable, password_hash varchar(255), password_version int, must_change_password boolean, created_at timestamptz | school FK+index, 역할 CHECK, staff_login_id UNIQUE, 비밀번호 버전 >=1, 학생은 staff_login_id NULL·직원은 NOT NULL |
| classrooms | id UUID, school_id UUID, grade_label varchar(20), class_number int, join_code varchar(8), start_date date, created_at timestamptz | school FK, UNIQUE(school_id,grade_label,class_number), join_code UNIQUE, class_number 1~99 |
| classroom_teachers | classroom_id UUID, teacher_account_id UUID | 두 FK, 복합 PK(classroom_id,teacher_account_id), teacher_account_id index |
| student_profiles | account_id UUID, classroom_id UUID, student_number int, nickname varchar(20) | account PK+FK, classroom FK, UNIQUE(classroom_id,student_number), student_number 1~999 |

학교·학급·학생 번호 관계의 유일 제약을 실제 DB가 보장한다. 가입 전 조회만으로 중복을 막지 않는다. Account와 StudentProfile은 같은 학교·STUDENT 역할인지 업무 모듈에서 검사한다. 교사 담당 연결은 TEACHER 역할과 같은 학교를 확인한다.

`gradeLabel`, 이름, 별명은 NFC 정규화 후 바깥 공백을 제거하며 길이는 유니코드 코드포인트로 센다. 학년은 교사가 정한 `1학년`, `중1`, `고1` 같은 표시 값을 선택한다. 번호 `01`은 정수 1로 저장·로그인한다. 이름·별명은 React 텍스트 노드로 표시하고 HTML로 실행하지 않는다.

학급 코드는 `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`에서 SecureRandom으로 8자를 생성한다. 입력은 trim 후 ASCII 대문자로 변환하고 같은 문자 집합을 검사한다. 저장 충돌은 생성 재시도 최대 5회 후 503으로 처리한다. 직원 로그인 ID는 trim·ASCII 소문자 변환 후 `[a-z0-9][a-z0-9._-]{2,39}`를 따른다.

## 7. HTTP 계약

공통 오류는 `{ code: string, message: string, fieldErrors: Record<string,string> }`다. 목록·응답에는 JPA entity를 직접 직렬화하지 않는다. 아래 상대 경로는 같은 origin의 `/api`다.

| Method·경로 | 입력 또는 조건 | 결과 |
| --- | --- | --- |
| GET /api/auth/csrf | 익명/로그인 모두 허용 | 200 `{headerName,token}`; Cache-Control: no-store |
| GET /api/public/schools | 공개 | 200 `SchoolOption[]` |
| GET /api/public/schools/{schoolId}/classrooms | 공개 | 200 `ClassroomOption[]`; 학급 코드·명단 없음 |
| POST /api/public/classrooms/resolve | schoolId,gradeLabel,classNumber,classCode | 200 `ClassroomOption`; 불일치 400 INVALID_CLASS_LINK |
| POST /api/auth/students/register | 소속,studentNumber,name,nickname,password,classCode | 201 `StudentMe`; 세션 생성 없이 즉시 로그인 가능 |
| POST /api/auth/students/login | schoolId,gradeLabel,classNumber,studentNumber,password | 200 `StudentMe`+세션; 실패 401 INVALID_CREDENTIALS |
| POST /api/auth/staff/login | staffLoginId,password | 200 `StaffMe`+세션; 실패 401 INVALID_CREDENTIALS |
| GET /api/auth/me | 로그인 | 200 `StudentMe` 또는 `StaffMe`; 익명 401 UNAUTHENTICATED |
| POST /api/auth/password | currentPassword,newPassword; 로그인 | 200 최신 Me; 버전 증가·현재 세션 갱신 |
| POST /api/auth/logout | 로그인 또는 유효한 익명 CSRF | 204; 세션 폐기·쿠키 제거 |
| POST /api/admin/teachers | name,staffLoginId; ADMIN | 201 `{accountId,staffLoginId,name,initialPassword}` |
| GET /api/admin/teachers | ADMIN | 200 `TeacherSummary[]`; 초기 비밀번호 없음 |
| POST /api/staff/classrooms | gradeLabel,classNumber,startDate; TEACHER/ADMIN | 201 `ClassroomSummary`; 생성 교사를 담당자로 연결 |
| GET /api/staff/classrooms?scope=MINE\|SCHOOL | TEACHER/ADMIN, 기본 MINE | 200 `ClassroomSummary[]`; 관리자 MINE은 학교 전체 |
| GET /api/staff/classrooms/{classroomId}/students | 같은 학교 TEACHER/ADMIN | 200 `StudentRosterRow[]`; 타 학교 403 |

`StudentMe={accountId,role:'STUDENT',schoolId,schoolName,classroomId,gradeLabel,classNumber,studentNumber,name,nickname}`다. `StaffMe={accountId,role:'TEACHER'|'ADMIN',schoolId,schoolName,name,staffLoginId,mustChangePassword}`다.

`SchoolOption={id,name}`, `ClassroomOption={id,gradeLabel,classNumber}`다. `ClassroomSummary={id,gradeLabel,classNumber,startDate,studentCount,canManage,joinCode:string|null}`이며 담당 교사/관리자에게만 코드가 들어간다. `TeacherSummary={accountId,name,staffLoginId,mustChangePassword}`, `StudentRosterRow={accountId,gradeLabel,classNumber,studentNumber,name}`다. 교사 명단에는 개인 별표와 비밀번호 관련 필드가 없다.

등록된 번호 중복은 409 STUDENT_NUMBER_IN_USE, 학급 중복은 409 CLASSROOM_ALREADY_EXISTS, 직원 ID 중복은 409 STAFF_LOGIN_ID_IN_USE다. 잘못된 입력은 400 VALIDATION_ERROR, 권한 없음은 403 FORBIDDEN, 비밀번호 변경 필요는 403 PASSWORD_CHANGE_REQUIRED, CSRF 실패는 403 INVALID_CSRF_TOKEN이다.

인증을 통과한 존재하지 않는 API 경로는 404 NOT_FOUND JSON이다. 오류 응답의 fieldErrors에는 설명만 넣고 입력한 비밀번호·코드 등의 원문 값을 반복하지 않는다.

POST는 모두 CSRF 검사를 거친다. JSON 로그인도 Spring Security의 세션 인증 전략을 실행하고 SecurityContextRepository에 저장한다. 로그인·로그아웃·비밀번호 변경 뒤 클라이언트는 CSRF를 다시 받는다. 재전송에 따른 중복 가입은 409로 처리하고 자동 로그인을 하지 않는다.

## 8. 화면과 실행 방식

- `/signup`: 소속 선택, 번호·이름·별명·비밀번호·학급 코드, 제출 전 코드 확인. 학교 변경 시 학년·반, 학년 변경 시 반을 초기화한다.
- `/login`: 학생의 학교·학년·반·번호·비밀번호. 별도의 교사·관리자 로그인 링크를 둔다.
- `/staff/login`: 발급 ID·비밀번호. 변경 필요 계정은 `/account/password`로 이동한다.
- `/student/account`: 별명과 자기 소속, 비밀번호 변경, 로그아웃. 가입 후 또는 세션 복원 후 실제 자기 정보만 표시한다.
- `/account/password`: 현재 비밀번호·새 비밀번호·새 비밀번호 확인. 초기 발급 계정은 변경 전 다른 업무 화면으로 이동하지 않는다.
- `/admin/teachers`: 교사 발급·목록. 발급한 초기 비밀번호는 현재 발급 결과에서만 보이며 새로고침·목록 조회로 복구하지 않는다.
- `/staff/classrooms`: 담당/학교 전체 학급과 실제 가입 명단. 학급 생성은 시작일을 받는다. 다른 학급의 코드는 담당자가 아니면 표시하지 않는다.

폼의 제출 중에는 중복 제출을 막는다. 가입·로그인·발급 mutation의 자동 재시도는 0회다. 학생 로그인 실패 메시지는 `학교·학년·반·번호 또는 비밀번호를 확인해 주세요.`, 직원 로그인 실패 메시지는 `아이디 또는 비밀번호를 확인해 주세요.`다. 계정 전환 때 QueryClient 캐시를 비워 이전 교사·학생 데이터가 남지 않게 한다.

스타일은 인수인계의 `cream=#FFFDF3`, `paper=#FFFEF9`, `butter=#F4D66E`, `ink=#263D35`, `line=#E2DEC9`를 CSS 변수로 사용한다. 글꼴은 맑은 고딕, Apple SD Gothic Neo, sans-serif다. 계정 폼에 도트 글꼴을 강제하지 않는다.

개발 중 Vite의 `/api` proxy로 같은 origin처럼 연결한다. 로컬 실행 묶음은 Nginx가 React 정적 파일과 `/api` reverse proxy를 제공하고, Spring Boot와 PostgreSQL을 연결한다. 실제 학교 운영 배포·도메인·TLS 인증서·서버 위치는 후속 배포 계획에서 정한다.

## 9. 검증과 완료 조건

| ID | 조건 | 증명할 결과 |
| --- | --- | --- |
| A01 | 첫 관리자 생성 후 두 번째 실행 | 같은 계정 유지, 비밀번호 덮어쓰기 없음 |
| A02 | 관리자의 교사 발급과 첫 로그인 | 교사 역할만 부여, 비밀번호 변경 뒤 학급 생성 가능 |
| A03 | 정상 학생 가입과 별도 로그인 | 승인 없이 참여, 새로고침 후 Me 일치 |
| A04 | 코드와 소속 불일치 | 400, 계정·프로필 모두 생성되지 않음 |
| A05 | 같은 학급·번호의 동시 가입 2건 | 201 한 건/409 한 건, 계정·프로필 한 쌍만 저장 |
| A06 | 같은 번호가 다른 학급에 존재 | 각각 자기 비밀번호로 로그인, 다른 학생 기록으로 연결되지 않음 |
| A07 | 학생 요청에 role=ADMIN을 추가 | 생성 역할 STUDENT 유지, 교사/관리자 경로 403 |
| A08 | 교사 학교 전체 조회와 타 학교 접근 | 자기 학교 전체 읽기 가능, 타 학교 403 |
| A09 | 로그아웃·비밀번호 변경·CSRF 누락 | 로그아웃 세션 401, 변경 전 다른 세션 401, CSRF 누락 POST 403 |
| A10 | 학생/교사 계정 전환과 이전 페이지 복귀 | 캐시에 이전 명단·자기 정보가 남지 않음 |
| A11 | 한글 이름·HTML처럼 보이는 별명·번호 01 | 원문 표시, 스크립트 실행 없음, 번호는 1로 일관 |
| A12 | 320/390/768/1440px와 키보드 | 입력·오류·버튼 사용 가능, 가로 넘침 없음 |

Java 통합 테스트는 실제 PostgreSQL/Testcontainers로 수행한다. 프런트엔드 테스트는 Vitest·Testing Library, 사용자 흐름은 Playwright로 검증한다. 서버 모듈을 브라우저 가짜 응답으로 대체한 테스트만으로 A03~A10 완료를 주장하지 않는다.

## 10. 후속 계획의 고정 입력

학습 계획은 accountId, classroomId, startDate를 사용하여 학생별 1~30회·150문항을 연결한다. 학기·기수 레이어를 추가하지 않는다. 첫 답변, 복습, 5문항 응답과 회차 완료를 별도로 관리하고 타이머는 화면 숨김·새로고침·기기 변경으로 초기화하지 않는다.

보상·인벤토리 계획은 최초 지급 키와 원장, 아바타 계획은 실제 포즈와 레이어 규격을 별도로 정의한다. 계정 계획에서 가상 XP·아이템·학습 진도를 초기 데이터로 저장하지 않는다. 30회 이후 새 과정이나 학기별 재시작 경로를 설계하지 않는다.

## 11. 확인한 환경과 참고 자료

2026-10-12 확인: 작업 폴더에 소스와 Git 저장소가 없다. Java 21.0.12.1, Node.js 24.19.0, pnpm 11.25.0이 조회됐다. Docker CLI는 있지만 기본 권한의 엔진 조회는 permission denied였다. 이번 작업은 문서 작성이며 제품 테스트를 실행하지 않았다. 구현 시작 때 Git 작업 환경과 Docker 접근을 먼저 확인한다.

인수인계 원본: `C:/Users/SSAFY/Documents/Codex/2026-10-06/new-chat/outputs/hanbit-handoff-2026-10-12/HANDOFF.md`의 10·14·16·24~26절. 원본 HTML과 `prototype/work/`는 참고·이관 입력이며 이번 단계에 복제하지 않는다. 문서 속 과거 제안은 현재 사용자 답변보다 우선하지 않는다.

- [Spring Boot 시스템 요구사항](https://docs.spring.io/spring-boot/system-requirements.html)
- [Gradle 8.14.6 릴리스](https://docs.gradle.org/8.14.6/release-notes.html)
- [Spring Security 세션과 명시적 저장](https://docs.spring.io/spring-security/reference/servlet/authentication/session-management.html)
- [Spring Security 비밀번호 인코더](https://docs.spring.io/spring-security/reference/servlet/authentication/passwords/password-encoder.html)
- [Spring Security CSRF](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html)
- [PostgreSQL 제약](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [PostgreSQL 지원 정책](https://www.postgresql.org/support/versioning/)
- [Vite 시작 가이드](https://vite.dev/guide/)

