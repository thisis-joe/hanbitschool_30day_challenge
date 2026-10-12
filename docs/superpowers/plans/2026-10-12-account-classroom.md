# 한빛학교 계정·학급 연결 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생의 소속 기반 가입·로그인, 관리자에 의한 교사 발급, 실제 학급 코드와 명단 관리를 실행 가능한 첫 기능으로 만든다.

**Architecture:** React가 같은 origin의 Spring Boot HTTP 인터페이스를 호출한다. 기능별 account/classroom/staff 모듈이 업무 규칙과 트랜잭션을 처리하고 JPA/PostgreSQL에 저장한다. 인증은 Spring Security 세션이며 계정 UUID와 학생의 소속·번호를 구분한다.

**Tech Stack:** Java 21, Spring Boot 4.1.1, Gradle 8.14.6, PostgreSQL 17, JPA, Flyway, Spring Security, React, TypeScript, Vite, TanStack Query, Vitest, JUnit/Testcontainers, Playwright, Docker/Nginx.

**Spec:** [계정·학급 연결 설계 기준](../specs/2026-10-12-account-classroom-design.md). 실행자는 설계와 계획을 함께 읽는다. 상태는 검토용 초안이며 구현 승인·실행 방식 선택을 기다린다.

## Global Constraints

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

## Review Focus

1. 같은 학급 번호의 동시 가입: 한 건만 저장되고 실패 건의 Account가 고아로 남지 않는다. Task 4 `sameNumberRaceCreatesOneAccountAndProfile`.
2. 선택 소속과 코드 불일치·학교 변경 후 남은 반 값: 서버는 연결을 거절하고 화면은 하위 선택을 비운다. Task 4 `codeMustMatchSelectedClassroom`, Task 5 `schoolChangeClearsGradeAndClass`.
3. 가입 요청의 role=ADMIN·타 학교 classroomId: 학생 권한을 상승시키거나 다른 학교 명단을 읽을 수 없다. Task 4 `publicSignupAlwaysCreatesStudent`, Task 3 `otherSchoolRosterIsForbidden`.
4. 로그인 후 세션 저장·CSRF 재발급·비밀번호 변경: 다음 요청과 새로고침에서 로그인 유지, 이전 세션은 폐기되고 POST는 CSRF 없이 수행되지 않는다. Task 2 `SessionContractIT`, Task 7 실제 브라우저 흐름.
5. 교사 로그아웃 뒤 학생 로그인·뒤로가기: 이전 명단과 발급 비밀번호가 캐시·페이지에 남지 않는다. Task 5 `accountSwitchClearsCache`, Task 6 `initialPasswordIsNotRestored`, Task 7 `role-switch.spec.ts`.

---

## 범위와 실행 전 확인

이번 계획은 설계 A01~A12를 구현한다. 실제 문제 풀이·30회 진행·타이머·보상·랭킹·아바타는 후속 계획이다. 계정 도착 화면과 교사 명단에서 미구현 통계를 합성하지 않는다.

현재 루트는 비어 있고 Git 저장소가 아니다. 구현 시작 때 선택한 실행 스킬로 작업 환경을 확인하고 Git 저장소를 구성하거나 사용자의 저장소에 연결한다. 이 문서 작성 중 Git 초기화·커밋·의존성 설치·제품 코드 생성은 수행하지 않았다. 아래 commit 단계는 실제 Git 작업 환경을 확보한 뒤 실행한다.

Docker 엔진 조회는 기본 권한에서 실패했다. Testcontainers와 로컬 묶음 실행 전에 `docker info`가 성공하는지 확인한다. 실패하면 환경 접근을 해결하고 통합 테스트를 실행해야 한다. 테스트를 skip하거나 H2로 바꿔 완료 처리하지 않는다.

명령의 기본 위치는 작업 루트이며 `backend/` 표시가 있는 명령만 해당 폴더에서 실행한다. Windows는 `./gradlew.bat`, Linux/CI는 `./gradlew`를 사용한다. red 단계에서 새 Java 타입이 없어 compile 실패하는 것은 허용하지만, 의존성 다운로드·Docker 오류는 기능의 red로 인정하지 않는다.

## 파일 책임 지도

| 경로 | 책임 |
| --- | --- |
| `backend/build.gradle.kts`, `settings.gradle.kts`, `gradlew*`, `gradle/wrapper/*` | Java 빌드·의존성·테스트 실행 |
| `backend/src/main/java/kr/hanbit/school/HanbitApplication.java` | 애플리케이션 진입점 |
| `backend/src/main/java/kr/hanbit/school/account/` | Account·StudentProfile, 가입·인증·입력 계약 |
| `backend/src/main/java/kr/hanbit/school/classroom/` | 학교·학급·담당자·명단·학급 코드 |
| `backend/src/main/java/kr/hanbit/school/staff/` | 관리자 생성·교사 발급 |
| `backend/src/main/java/kr/hanbit/school/security/` | 세션·CSRF·역할·비밀번호 버전 |
| `backend/src/main/java/kr/hanbit/school/shared/web/` | 오류 응답·HTTP 예외 변환 |
| `backend/src/main/resources/db/migration/` | 버전형 DB 변경 |
| `backend/src/test/java/kr/hanbit/school/` | 실제 DB·HTTP 계약 테스트 |
| `frontend/src/features/auth/` | 가입·로그인·자기 정보·비밀번호 화면과 호출 |
| `frontend/src/features/staff/` | 교사 발급·학급·명단 화면과 호출 |
| `frontend/src/lib/http.ts`, `frontend/src/lib/queryClient.ts` | CSRF·세션 fetch·계정 전환 캐시 |
| `frontend/src/app/` | 라우팅·권한 진입·테마 |
| `frontend/e2e/`, `frontend/playwright.config.ts` | 실제 서버를 사용하는 사용자 검증 |
| `infra/compose.local.yml`, `infra/nginx.conf`, `*/Dockerfile`, `.env.example`, `README.md` | 로컬 실행·운영자 설정·검증 절차 |

각 Java public record/enum은 별도 동명 파일로 만든다. 아래 DTO 파일의 데이터 필드는 설계 7절과 정확히 일치한다. 테스트 helper는 test source에서만 사용한다.

## 구현 작업

### Task 1: 저장 계약과 첫 관리자 생성

**Files:**
- Create: `backend/build.gradle.kts`, `backend/settings.gradle.kts`, `backend/gradlew`, `backend/gradlew.bat`, `backend/gradle/wrapper/gradle-wrapper.jar`, `backend/gradle/wrapper/gradle-wrapper.properties`.
- Create: `backend/src/main/java/kr/hanbit/school/HanbitApplication.java`.
- Create: `backend/src/main/java/kr/hanbit/school/account/{Account,Role,AccountRepository,StudentProfile,StudentProfileRepository,PasswordPolicy}.java`.
- Create: `backend/src/main/java/kr/hanbit/school/classroom/{School,SchoolRepository,Classroom,ClassroomRepository,ClassroomTeacher,ClassroomTeacherId,ClassroomTeacherRepository}.java`.
- Create: `backend/src/main/java/kr/hanbit/school/security/PasswordEncodingConfiguration.java`.
- Create: `backend/src/main/java/kr/hanbit/school/staff/{AdminBootstrap,AdminBootstrapProperties}.java`.
- Create: `backend/src/main/resources/{application.yml,application-local.yml}`, `backend/src/main/resources/db/migration/V1__account_classroom.sql`.
- Test: `backend/src/test/java/kr/hanbit/school/{PersistenceContractIT,AdminBootstrapIT}.java`, `backend/src/test/java/kr/hanbit/school/account/PasswordPolicyTest.java`, `backend/src/test/java/kr/hanbit/school/support/{PostgresTestConfiguration,TestFixtures}.java`.

**Interfaces:**
- Produces: `Role {STUDENT,TEACHER,ADMIN}` and JPA entities with the field names in spec 6. Accounts start at `passwordVersion=1`; students `mustChangePassword=false`; issued teachers true.
- Produces: `AccountRepository.findByStaffLoginId(String): Optional<Account>`; `StudentProfileRepository.findByClassroomIdAndStudentNumber(UUID,int): Optional<StudentProfile>`; `ClassroomRepository.findBySchoolIdAndGradeLabelAndClassNumber(UUID,String,int): Optional<Classroom>`; `findByJoinCode(String): Optional<Classroom>`.
- Produces: `PasswordPolicy.validate(String): void`; `AdminBootstrap.initialize(): void`; PasswordEncoder bean.
- Produces test-only: `TestFixtures.school(String): School`, `admin(School): Account`, `teacher(School): Account`, `classroom(School,Account,String,int): Classroom`, `student(Classroom,int,String,String): Account`. Test fixture password constant is `Hanbit!2026`; entities are committed fixtures, not browser mocks. `teacher(School)` creates a teacher with mustChangePassword=false; initial-issuance tests explicitly seed true. Classroom fixture startDate is 2026-10-12.

- [x] **Step 1:** Configure the pinned build, Boot starters for Web MVC/validation/security/JPA, PostgreSQL/Flyway database support, JUnit/Testcontainers managed dependencies and `test` to include `*IT`. Create `PostgresTestConfiguration` with a `postgres:17` container and fixtures whose signatures are above. Keep bootstrap disabled in normal test profiles.
- [x] **Step 2: Write the failing tests.** Add assertions for migration validity, different classes sharing number 1, the same class rejecting number 1 twice, raw SQL foreign-key rejection, and bootstrap idempotency. PasswordPolicyTest validates min 8 codepoints and rejects 25 Hangul characters (>72 UTF-8 bytes).

```java
// PersistenceContractIT / AdminBootstrapIT assertions after the named fixture actions
assertThat(profiles.findByClassroomIdAndStudentNumber(classroom.getId(), 1)).isPresent();
assertThatThrownBy(() -> fixtures.student(classroom, 1, "이민수", "두번째"))
    .isInstanceOf(DataIntegrityViolationException.class);
assertThat(encoder.matches("Hanbit!2026", savedAdmin.getPasswordHash())).isTrue();
assertThat(afterSecondInitialize.getId()).isEqualTo(savedAdmin.getId());
assertThat(afterSecondInitialize.getPasswordHash()).isEqualTo(savedAdmin.getPasswordHash());
```

- [x] **Step 3: Run red.** In `backend/`: `./gradlew.bat test --tests '*PersistenceContractIT' --tests '*AdminBootstrapIT' --tests '*PasswordPolicyTest'`. Expected: missing entity/bootstrap or contract failure on a working PostgreSQL container.
- [x] **Step 4: Implement.** Create V1 and JPA entities/repositories, including the fixed school row in spec 6. PK/UNIQUE indexes already covering FK prefixes need no duplicate indexes; add accounts.school_id and classroom_teachers.teacher_account_id indexes. Create admin only when both bootstrap credentials are supplied and that school has no admin. Blank credentials disable bootstrap; partial credentials fail startup with a message that omits values. Read `HANBIT_BOOTSTRAP_ADMIN_ID`, `HANBIT_BOOTSTRAP_ADMIN_PASSWORD`; skip existing admins without changing hashes. Validate password min 8 codepoints/max 72 UTF-8 bytes without trimming.
- [x] **Step 5: Run green.** Repeat Step 3; expected PASS including migration validation, FK/password bounds, no orphan fixtures and unchanged bootstrap hash.
- [x] **Step 6: Commit.** `git add backend` then `git commit -m "feat: persist school accounts and bootstrap administrator"`.

### Task 2: 학생·직원 로그인, 세션, 비밀번호 변경

**Files:**
- Create: `backend/src/main/java/kr/hanbit/school/account/{StudentLoginCommand,StaffLoginCommand,ChangePasswordCommand,AccountMe,StudentMe,StaffMe,AuthenticationModule,AuthenticationController}.java`.
- Create: `backend/src/main/java/kr/hanbit/school/security/{AccountPrincipal,SecurityConfiguration,SessionLoginHandler,AccountSessionFilter,CsrfController}.java`.
- Create: `backend/src/main/java/kr/hanbit/school/shared/web/{ApiError,ApiException,ApiExceptionHandler}.java`.
- Modify: `backend/src/main/resources/{application.yml,application-local.yml}`, `backend/src/main/java/kr/hanbit/school/account/AccountRepository.java`.
- Test: `backend/src/test/java/kr/hanbit/school/account/{SessionContractIT,ProductionCookieIT}.java`, `backend/src/test/java/kr/hanbit/school/support/SessionTestClient.java`.

**Interfaces:**
- Consumes: Task 1 committed entities/repositories/PasswordEncoder/PasswordPolicy.
- Produces: `AccountPrincipal(UUID accountId,UUID schoolId,Role role,int passwordVersion)`; `AccountMe` sealed interface, `StudentMe`/`StaffMe` records implementing it, exactly as spec 7.
- Produces commands: `StudentLoginCommand(UUID schoolId,String gradeLabel,int classNumber,int studentNumber,String password)`, `StaffLoginCommand(String staffLoginId,String password)`, `ChangePasswordCommand(String currentPassword,String newPassword)`.
- Produces: `AuthenticationModule.authenticateStudent(StudentLoginCommand): AccountPrincipal`, `authenticateStaff(StaffLoginCommand): AccountPrincipal`, `me(AccountPrincipal): AccountMe`, `changePassword(AccountPrincipal,ChangePasswordCommand): AccountPrincipal`.
- Produces: `SessionLoginHandler.establish(AccountPrincipal,HttpServletRequest,HttpServletResponse): void` and the auth endpoints in spec 7; `ApiError(String code,String message,Map<String,String> fieldErrors)`. Add `AccountRepository.updatePassword(UUID accountId,int expectedVersion,String encodedPassword): int`, a compare-and-set update that increments passwordVersion and clears mustChangePassword only when the version still matches.
- Produces test-only: `SessionTestClient.loginStaff(Account): MockHttpSession`, `loginStudent(Account): MockHttpSession`, `csrf(MockHttpSession): CsrfToken`. These use actual login endpoints, never inject a fabricated staff SecurityContext.

- [x] **Step 1: Write `SessionContractIT` red tests.** Seed student/staff rows through Task 1. Test `studentSessionSurvivesNextRequest`, `wrongPasswordAndUnknownStudentShareError`, `missingCsrfCannotLogin`, `issuedTeacherMustChangePassword`, `passwordChangeRevokesOtherSessions`, `logoutInvalidatesSession`, `normalizesStaffIdAndGrade`, `concurrentPasswordChangeRejectsStaleVersion`; ProductionCookieIT owns `productionCookieIsSecure`.

```java
// studentSession/oldSecondSession are actual sessions from SessionTestClient.
mockMvc.perform(get("/api/auth/me").session(studentSession))
    .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("STUDENT"));
mockMvc.perform(post("/api/auth/students/login").contentType(APPLICATION_JSON).content(loginJson))
    .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("INVALID_CSRF_TOKEN"));
mockMvc.perform(get("/api/auth/me").session(oldSecondSession))
    .andExpect(status().isUnauthorized());
```

- [x] **Step 2: Run red.** `backend/`: `./gradlew.bat test --tests '*SessionContractIT' --tests '*ProductionCookieIT'`. Expected endpoint/contract failure, not Docker failure.
- [x] **Step 3: Implement authentication interfaces.** Use the selected school/grade/class/number for student lookup and the spec normalization for gradeLabel/staff ID; return a generic invalid-credentials result. The controller never accepts a role or principal from JSON. Establish authentication using Spring's session-ID change and CSRF authentication strategies; explicitly save SecurityContext to HttpSessionSecurityContextRepository. Produce JSON 401/403 instead of HTML redirects and implement the spec's error codes; authenticated unknown API paths give 404 NOT_FOUND JSON. ApiError fieldErrors never repeat submitted values. `/api/auth/csrf` returns request CsrfToken headerName/token with no-store.
- [x] **Step 4: Implement version and password flow.** AccountSessionFilter reloads the account and checks principal school/role/passwordVersion; mismatch invalidates session and returns 401. Password changes verify the current hash and encode the new value before the short write transaction. Use updatePassword with the expected version; update count 1 increments the version and clears mustChangePassword, then re-establish the current session. Count 0 invalidates that session and returns 401 because another change already won. Other old sessions fail on their next request. Gate initial-password staff sessions to me/password/logout/csrf. Auth mutations require CSRF. Logout clears context, invalidates session, removes JSESSIONID.
- [x] **Step 5: Run green.** Repeat Step 2; expected PASS. `ProductionCookieIT.productionCookieIsSecure` uses an embedded RANDOM_PORT server and GET /api/auth/csrf to check Secure/HttpOnly/SameSite in the actual Set-Cookie header with production cookie settings. MockHttpSession alone is insufficient; this is not a TLS deployment test. Ensure me and errors expose no `passwordHash`/`password`/raw credentials. CSRF is refreshed after successful login/change/logout; session idle timeout is 30m.
- [x] **Step 6: Commit.** `git add backend` then `git commit -m "feat: authenticate school users with csrf protected sessions"`.

### Task 3: 교사 발급, 학급 생성, 학교 내 명단 조회

**Files:**
- Create: `backend/src/main/java/kr/hanbit/school/staff/{CreateTeacherCommand,TeacherIssued,TeacherSummary,TeacherProvisioningModule,TeacherController}.java`.
- Create: `backend/src/main/java/kr/hanbit/school/classroom/{CreateClassroomCommand,ClassroomScope,ClassroomOption,SchoolOption,ClassroomSummary,StudentRosterRow,JoinCodeGenerator,ClassroomModule,ClassroomController,SchoolCatalogController}.java`.
- Test: `backend/src/test/java/kr/hanbit/school/staff/TeacherProvisioningIT.java`, `backend/src/test/java/kr/hanbit/school/classroom/{ClassroomAccessIT,JoinCodeGeneratorTest}.java`.

**Interfaces:**
- Consumes: authenticated AccountPrincipal, AccountMe/error contract and SessionTestClient from Task 2; entities from Task 1.
- Produces: `TeacherProvisioningModule.issue(AccountPrincipal,CreateTeacherCommand): TeacherIssued`, `list(AccountPrincipal): List<TeacherSummary>`; `CreateTeacherCommand(String name,String staffLoginId)`; issued/summary fields are spec 7.
- Produces: `CreateClassroomCommand(String gradeLabel,int classNumber,LocalDate startDate)`, `ClassroomScope {MINE,SCHOOL}`; `ClassroomModule.create(AccountPrincipal,CreateClassroomCommand): ClassroomSummary`, `list(AccountPrincipal,ClassroomScope): List<ClassroomSummary>`, `students(AccountPrincipal,UUID classroomId): List<StudentRosterRow>`.
- Produces: `JoinCodeGenerator.generate(): String`, `ClassroomModule.schools(): List<SchoolOption>`, `publicClasses(UUID schoolId): List<ClassroomOption>`. DTO field names are spec 7.

- [x] **Step 1: Write red tests.** `TeacherProvisioningIT`: admin emits a teacher and a one-time initial password, repeated staff ID is 409, student/teacher cannot issue. `ClassroomAccessIT`: teacher can create multiple classes, same school/grade/class is unique, same-school non-assigned teacher reads a roster without the code, assigned teacher sees the code, other school is 403, student is 403, public catalog includes no joinCode/roster. Add JoinCodeGeneratorTest for length/alphabet and a deterministic generator collision test in ClassroomAccessIT; exactly one Classroom and one creator assignment must survive a retry.

```java
assertThat(issued.initialPassword()).isNotBlank();
assertThat(issuedAccount.getRole()).isEqualTo(Role.TEACHER);
assertThat(issuedAccount.isMustChangePassword()).isTrue();
assertThat(listResponseBody).doesNotContain("initialPassword", "passwordHash");
assertThat(nonAssignedClassroom.joinCode()).isNull();
mockMvc.perform(get("/api/staff/classrooms/" + targetClassroomId + "/students").session(otherSchoolSession))
    .andExpect(status().isForbidden());
assertThat(publicClassBody).doesNotContain("joinCode", "studentNumber", "name");
```

- [x] **Step 2: Run red.** `backend/`: `./gradlew.bat test --tests '*TeacherProvisioningIT' --tests '*ClassroomAccessIT' --tests '*JoinCodeGeneratorTest'`.
- [x] **Step 3: Implement staff provisioning.** Caller must be ADMIN; bind new teacher school to caller school, normalize staff ID, generate a 32-character Base64URL initial password using 24 SecureRandom bytes, hash it before persistence, return it only in the create response. A number of overlapping requests still map the DB unique constraint to 409. Do not create public teacher/admin signup routes.
- [x] **Step 4: Implement classroom interfaces and public metadata.** Staff create in their own school; teacher creator gets classroom_teachers membership, admin need not be a teacher. Generate the spec's 8-character code, retry code collision in a fresh transaction at most 5 times; class-tuple collision immediately gives 409. Default MINE lists teacher assignments; ADMIN sees own-school classes for either scope. School-wide rosters are readable to all own-school teachers, but joinCode is only returned to assigned teachers/admins. Read/write checks live in the module, not only hidden buttons.
- [x] **Step 5: Run green.** Repeat Step 2; expected PASS. Counts come from persisted profiles; roster order is studentNumber then accountId.
- [x] **Step 6: Commit.** `git add backend` then `git commit -m "feat: provision teachers and manage school classrooms"`.

### Task 4: 즉시 참여하는 학생 가입과 소속 검증

**Files:**
- Create: `backend/src/main/java/kr/hanbit/school/account/{StudentRegistrationCommand,RegistrationModule,StudentRegistrationController}.java`.
- Create: `backend/src/main/java/kr/hanbit/school/classroom/{ResolveClassroomCommand,ClassroomResolver,ClassroomResolveController}.java`.
- Test: `backend/src/test/java/kr/hanbit/school/account/StudentRegistrationIT.java`, `backend/src/test/java/kr/hanbit/school/support/RegistrationRaceHarness.java`.

**Interfaces:**
- Consumes: persisted classrooms, AccountPrincipal/StudentMe/ApiError and password validation from Tasks 1~3.
- Produces: `ResolveClassroomCommand(UUID schoolId,String gradeLabel,int classNumber,String classCode)`; `ClassroomResolver.resolve(ResolveClassroomCommand): Classroom`.
- Produces: `StudentRegistrationCommand(UUID schoolId,String gradeLabel,int classNumber,int studentNumber,String name,String nickname,String password,String classCode)`; `RegistrationModule.register(StudentRegistrationCommand): StudentMe`.
- Produces public resolve/register endpoints, no session on signup and no pending-approval state.
- Produces test-only: `RegistrationRaceHarness.submitPair(StudentRegistrationCommand,StudentRegistrationCommand): List<Integer>`; use a CyclicBarrier and two independent real HTTP sessions/transactions, include CSRF for both.

- [x] **Step 1: Write red tests.** `signupCanLoginImmediately`, `codeMustMatchSelectedClassroom`, `sameNumberRaceCreatesOneAccountAndProfile`, `publicSignupAlwaysCreatesStudent`, `unicodeNamesAndLeadingZeroNumber`, `studentViewsOnlyOwnMe`. Seed classroom via actual staff operation for HTTP flow tests. Write exact boundary assertions for 50/51 name codepoints, 20/21 nickname codepoints, 8/7 password codepoints and 72/73 UTF-8 password bytes. Use `<img src=x>` as an HTML-looking nickname within the length limit.

```java
// The result variables are MvcResult values from actual JSON requests with CSRF.
assertThat(signup.getResponse().getStatus()).isEqualTo(201);
assertThat(loginImmediately.getResponse().getStatus()).isEqualTo(200);
assertThat(mismatchedLink.getResponse().getStatus()).isEqualTo(400);
assertThat(mismatchedLink.getResponse().getContentAsString()).contains("INVALID_CLASS_LINK");
assertThat(raceStatuses).containsExactlyInAnyOrder(201, 409);
assertThat(profileCountForClassroomAndNumber).isEqualTo(1);
assertThat(studentAccountCountAfterRace - beforeRace).isEqualTo(1);
assertThat(signupWithInjectedAdminRole.getResponse().getContentAsString()).contains("\"role\":\"STUDENT\"");
```

- [x] **Step 2: Run red.** `backend/`: `./gradlew.bat test --tests '*StudentRegistrationIT'`.
- [x] **Step 3: Implement resolver and validation.** Check code and selected school/grade/class together. Normalize grade/name/nickname and code as spec 6; grade is 1~20 codepoints, classNumber 1~99, studentNumber 1~999. Use integer student numbers so 01 and 1 identify the same slot. Reject blank name/nickname, malformed date/UUID/numeric input without database changes; password remains unchanged by normalization. Public resolve response is ClassroomOption only.
- [x] **Step 4: Implement atomic registration.** Hash outside the write transaction, then in a transactional write verify the class again, create STUDENT Account and StudentProfile together, and flush. Map only `UNIQUE(classroom_id,student_number)` failure to STUDENT_NUMBER_IN_USE after rollback; don't catch-and-continue inside a failed PostgreSQL transaction. The duplicate request's Account must also roll back. Return StudentMe from a DTO, not a persisted entity. Explicitly ignore unknown properties on StudentRegistrationCommand; a role property cannot change STUDENT. Request parsing never binds an Account entity.
- [x] **Step 5: Run green.** Repeat Step 2 and all earlier backend tests. Verify A03~A07/A11: no approval field, no account on a code mismatch, same number in different classes can log in independently, no password data in responses. An HTML-looking nickname is saved as text and all boundary assertions from Step 1 pass.
- [x] **Step 6: Commit.** `git add backend` then `git commit -m "feat: register students against verified classroom codes"`.

### Task 5: 학생·직원 로그인 화면과 세션 복원

**Files:**
- Create: `frontend/{package.json,pnpm-lock.yaml,index.html,vite.config.ts,tsconfig.json,tsconfig.app.json,tsconfig.node.json,vitest.config.ts}`.
- Create: `frontend/src/{main.tsx,vite-env.d.ts}`, `frontend/src/app/{App.tsx,router.tsx,RequireRole.tsx,theme.css}`.
- Create: `frontend/src/lib/{http.ts,queryClient.ts}`, `frontend/src/features/auth/{types.ts,api.ts,queries.ts,ClassroomFields.tsx,StudentSignupPage.tsx,StudentLoginPage.tsx,StaffLoginPage.tsx,AccountPasswordPage.tsx,StudentAccountPage.tsx}`.
- Test: `frontend/src/test/setup.ts`, `frontend/src/features/auth/{StudentSignupPage.test.tsx,StudentLoginPage.test.tsx,AuthSession.test.tsx}`; `frontend/src/app/RequireRole.test.tsx`.

**Interfaces:**
- Consumes: all auth/public endpoints and DTOs from Tasks 2~4; api errors have code/message/fieldErrors.
- Produces: TypeScript `Role='STUDENT'|'TEACHER'|'ADMIN'`, discriminated `AccountMe=StudentMe|StaffMe`, `SchoolOption`, `ClassroomOption`, `ApiError`, and matching input types `StudentRegistrationCommand`, `StudentLoginCommand`, `StaffLoginCommand`, `ChangePasswordCommand`, `ResolveClassroomCommand`, with spec 7 fields.
- Produces: `request<T>(path:string,init?:RequestInit): Promise<T>`, `refreshCsrf(): Promise<void>`; all fetches use credentials='same-origin', mutations attach the current token and never log body credentials.
- Produces API functions: `getSchools(): Promise<SchoolOption[]>`, `getClassrooms(schoolId:string): Promise<ClassroomOption[]>`, `resolveClassroom(ResolveClassroomCommand): Promise<ClassroomOption>`, `registerStudent(StudentRegistrationCommand): Promise<StudentMe>`, `loginStudent(StudentLoginCommand): Promise<StudentMe>`, `loginStaff(StaffLoginCommand): Promise<StaffMe>`, `getMe(): Promise<AccountMe>`, `changePassword(ChangePasswordCommand): Promise<AccountMe>`, `logout(): Promise<void>`.
- Produces: `useCurrentAccount()` using query key `['auth','me']`; `RequireRole` accepts `allowed: Role[]`; anonymous student routes go to `/login`, staff/admin routes to `/staff/login`, and forced-password staff goes to `/account/password`.

- [x] **Step 1:** Create the stable react-ts Vite project and test setup; pin dependencies and packageManager. Scripts: `dev`, `build` (typecheck+Vite), `test` (vitest run), `test:watch`, `lint`, `test:e2e` (playwright test). Vite `/api` proxy target is `http://localhost:8080`. Configure a QueryClient with mutation retry=false and auth me retries=false. Scaffold only when execution is approved.
- [x] **Step 2: Write red UI tests.** Use Testing Library and MSW for isolated frontend tests: `schoolChangeClearsGradeAndClass`, `signupSendsNameAndNickname`, `loginDoesNotSendClassCodeOrName`, `doubleSubmitMakesOneRequest`, `accountSwitchClearsCache`, `unknownSessionDoesNotFlashStaffContent`. Include 401/403/network failure cases and `<img src=x>` nickname rendering as a text node, not an img element.

```typescript
expect(registerBody).toMatchObject({ name: '김민수', nickname: '숲친구', studentNumber: 1 });
expect(loginBody).not.toHaveProperty('classCode');
expect(loginBody).not.toHaveProperty('nickname');
expect(screen.getByLabelText('학년')).toHaveValue('');
expect(registerRequests).toHaveLength(1);
expect(queryClient.getQueryData(['staff', 'classrooms'])).toBeUndefined();
expect(screen.queryByText('교사 계정 발급')).not.toBeInTheDocument();
```

- [x] **Step 3: Run red.** Root: `pnpm --dir frontend test`. Expected missing pages/interfaces or failed assertions; package install failure is not red.
- [x] **Step 4: Implement HTTP and forms.** Startup fetches csrf and me; me 401 means anonymous, network failure has a retry action and must not become fake authenticated state. Mutations report field/global errors and disable submit while pending. Refresh csrf after login/change/logout; clear QueryClient before accepting an account switch or logout. Signup moves to login with only school/grade/class/number prefilled; don't persist form passwords to URL/history/storage. Student login uses the five approved fields, staff login uses issued ID/password. Unknown role or forbidden route does not render protected content.
- [x] **Step 5: Implement actual account pages.** Render stored nickname as React text, show own school/grade/class/number, provide password change/logout. Initial staff must change password before classroom/admin access. Password confirmation is checked in the UI; the server still validates currentPassword/newPassword. Apply spec palette/labels/touch dimensions. No fake XP/progress cards.
- [x] **Step 6: Run green.** `pnpm --dir frontend test`; `pnpm --dir frontend build`; `pnpm --dir frontend lint`. Expected all PASS/no TS errors, including text nickname rendering and 401/403/network failure cases from Step 2.
- [x] **Step 7: Commit.** `git add frontend` then `git commit -m "feat: add student signup and role aware session screens"`.

### Task 6: 관리자 교사 발급과 교사 학급·명단 화면

**Files:**
- Create: `frontend/src/features/staff/{types.ts,api.ts,TeacherAccountsPage.tsx,ClassroomsPage.tsx,ClassroomRoster.tsx}`.
- Modify: `frontend/src/app/router.tsx`.
- Test: `frontend/src/features/staff/{TeacherAccountsPage.test.tsx,ClassroomsPage.test.tsx}`.

**Interfaces:**
- Consumes: Task 5 request/refreshCsrf/useCurrentAccount/RequireRole and Task 3 staff endpoints.
- Produces TS inputs and DTOs `CreateTeacherCommand`, `TeacherIssued`, `TeacherSummary`, `CreateClassroomCommand`, `ClassroomSummary`, `StudentRosterRow` matching spec 7.
- Produces: `issueTeacher(CreateTeacherCommand): Promise<TeacherIssued>`, `getTeachers(): Promise<TeacherSummary[]>`, `createClassroom(CreateClassroomCommand): Promise<ClassroomSummary>`, `getStaffClassrooms(scope:'MINE'|'SCHOOL'): Promise<ClassroomSummary[]>`, `getRoster(classroomId:string): Promise<StudentRosterRow[]>`.
- Produces routes `/admin/teachers` (ADMIN), `/staff/classrooms` (TEACHER/ADMIN).

- [x] **Step 1: Write red tests.** Test issued secret shown only in create result, `initialPasswordIsNotRestored` after unmount/reload, scope toggle requests the correct endpoint, real name/number roster, non-assigned code absent, empty roster message and 403 response. Do not persist TeacherIssued in QueryClient or localStorage.

```typescript
expect(screen.getByLabelText('초기 비밀번호')).toHaveValue(issued.initialPassword);
expect(sessionStorage.getItem('initialPassword')).toBeNull();
expect(screen.queryByLabelText('초기 비밀번호')).not.toBeInTheDocument(); // remount without issuing
expect(lastClassroomRequest.searchParams.get('scope')).toBe('SCHOOL');
expect(screen.getByText('김민수')).toBeVisible();
expect(screen.getByText('아직 가입한 학생이 없습니다.')).toBeVisible();
```

- [x] **Step 2: Run red.** Root: `pnpm --dir frontend test`. Expected new page/contract tests fail.
- [x] **Step 3: Implement pages.** Admin creates teacher with real name and staff ID, sees initial password once with copy action, then sees only safe summary rows. Teachers create classes with grade label/class number/start date; read-only school-wide list doesn't imply a manage button or code disclosure. Default scope is MINE. List keys use persisted UUIDs, not student name/number. Render API errors and pending states; don't treat failed mutations as success or retry them automatically.
- [x] **Step 4: Run green.** Repeat frontend test/build/lint. In tests check staff data query keys include the active accountId and scope; role transitions still clear all old cache. Test `/admin/teachers` direct entry as TEACHER cannot render the issuance UI and actual backend role rejection remains tested by Task 3.
- [x] **Step 5: Commit.** `git add frontend` then `git commit -m "feat: add teacher provisioning and classroom roster screens"`.

### Task 7: 실제 실행 묶음과 사용자 흐름 검증

**Files:**
- Create: `backend/Dockerfile`, `frontend/Dockerfile`, `backend/.dockerignore`, `frontend/.dockerignore`, `infra/compose.local.yml`, `infra/nginx.conf`, `.env.example`, `.gitignore`, `README.md`.
- Create: `frontend/playwright.config.ts`, `frontend/e2e/{helpers.ts,account-flow.spec.ts,role-switch.spec.ts,responsive-auth.spec.ts}`, `frontend/e2e/infra-routing.spec.ts`.
- Modify: `frontend/package.json`, `backend/src/main/resources/application-local.yml`.

**Interfaces:**
- Consumes: live Task 1~6 routes and real PostgreSQL; API/UI default same origin `http://localhost:8088`.
- Produces: Compose services db/backend/web, DB health readiness, Nginx `/api` proxy and SPA fallback for direct routes.
- Produces test-only browser helpers: `staffLogin(page,staffLoginId,password)`, `studentLogin(page,schoolName,gradeLabel,classNumber,studentNumber,password)`, `changeInitialPassword(page,currentPassword,newPassword)` returning Promise<void>. `provisionClass(page,adminId,adminPassword): Promise<{staffLoginId:string,staffPassword:string,gradeLabel:string,classNumber:number,joinCode:string}>` issues/activates a teacher and creates a class through the actual forms.
- Each provisionClass call uses a fresh 12-character random hex suffix: staff ID `e2e.<suffix>`, grade label `검증<suffix>`, classNumber=1/studentNumber=1. Each test provisions its own class and never depends on another test's run. Helpers use visible forms and real endpoints, not injected cookies or DB writes. E2E uses a dedicated Compose project `hanbit-account-e2e` and `.env.e2e.local` (gitignored), with its own DB/volume and test-only administrator credentials.

- [x] **Step 1: Write red executable tests.** `account-flow.spec.ts`: bootstrap admin login -> issue teacher -> teacher initial login/password change -> create class with startDate 2026-10-12 -> student signup -> login using school/grade/class/number/password -> reload own profile -> teacher sees actual name/number. `role-switch.spec.ts`: teacher logout -> student login in same browser -> back/direct protected route doesn't show old roster. `responsive-auth.spec.ts`: 320/390/768/1440px login/signup have no horizontal overflow; keyboard reaches submit and errors. `infra-routing.spec.ts` checks direct UI routes serve the SPA, csrf serves JSON, and an authenticated browser request to an unknown API route serves JSON 404.

```typescript
expect(await page.getByText('숲친구', { exact: true }).isVisible()).toBe(true);
await page.reload();
expect(await page.getByText('숲친구', { exact: true }).isVisible()).toBe(true);
expect(await teacherPage.getByText('김민수', { exact: true }).isVisible()).toBe(true);
expect(await page.locator('html').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
expect(unknownApiResponse.headers()['content-type']).toContain('application/json');
```

- [x] **Step 2: Run red.** Root: `pnpm --dir frontend test:e2e`. Expected the real app is unavailable or the new full-flow assertions fail; do not count a missing browser/Docker/credential setup as a functional red. Install Playwright browser and resolve Docker access before collecting functional results.
- [x] **Step 3: Implement executable local delivery.** Multi-stage build backend using pinned Wrapper and Java 21; frontend Node 24 build to Nginx. Compose uses postgres:17 with a named volume at `/var/lib/postgresql/data`, credentials from `.env.local` (gitignored), healthcheck and backend DB readiness. Bind only web port 8088 on 127.0.0.1; backend/db remain internal. Start local profile with cookie Secure=false; production default remains true. Nginx proxies `/api/` preserving path and forwarded headers; SPA fallback applies only to UI routes. Unknown API routes return JSON 404, never the SPA shell.
- [x] **Step 4: Document configuration.** `.env.example` lists `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `HANBIT_BOOTSTRAP_ADMIN_ID`, `HANBIT_BOOTSTRAP_ADMIN_PASSWORD`. Use no real/default secret. README gives separate copy/edit/start commands, one-time admin setup, local HTTP distinction, teacher issue/code/student flow and commands below. Bootstrap env deletion after first admin creation must not prevent restart; persisted admin hash remains unchanged. Gitignore includes .env.local/.env.*.local, build outputs and browser reports. Local and E2E instances both bind 8088; run them separately, using the dedicated E2E project for tests. Product copy never explains implementation status to students.
- [x] **Step 5: Run green.** Set explicit local/test credentials outside version control, then `docker compose -p hanbit-account-e2e --env-file .env.e2e.local -f infra/compose.local.yml config --quiet` and `docker compose -p hanbit-account-e2e --env-file .env.e2e.local -f infra/compose.local.yml up --build -d`. Run all backend tests (`backend/`: `./gradlew.bat test`), frontend tests/build/lint, and `pnpm --dir frontend test:e2e`. Expected PASS on real server/DB, no skipped required cases. Disable Playwright trace/video on password-entry flows; failure screenshots must exclude secret input/result areas. Report errors without dumping credential-bearing request bodies or compose config.
- [x] **Step 6: Verify persistence.** Restart only backend/web (not DB/volume), log in again, and verify the same student UUID/name/nickname/class membership and roster survive. Backend restart may expire in-memory sessions; persisted account data must survive. Do not delete volumes as cleanup. Run the second bootstrap unchanged-hash test from Task 1.
- [x] **Step 7: Commit.** `git add backend frontend infra .env.example .gitignore README.md` then `git commit -m "feat: deliver verified school account and classroom flow"`.

## 완료 조건과 다음 계획

설계 A01~A12를 충족하고 실제 PostgreSQL·HTTP·브라우저의 결과를 기록한다. 문서 작성 시점에는 위 제품 테스트를 실행하지 않았다.

다음 학습 계획은 accountId/classroomId/startDate를 받아 150문항·첫 답변/복습 분리·30회 진행·서버 만료시각을 다룬다. 보상·인벤토리, 아바타·지도, 교사 학습 통계는 별도 계획으로 연결한다. 이 계획의 완료를 전체 게임 출시로 보고하지 않는다.

## 자체 검토 결과

설계 C01~C06/C09와 P01~P09는 Task 1~6, A01~A12는 Task 1~7에 대응한다. C07/C08/C10은 후속 모듈의 고정 입력·개인 정보 제약으로 보존하며 현재 단계에서 가상 진행·타이머·별표를 만들지 않는다. 인터페이스 명칭·DTO·HTTP 경로·권한·오류 코드·실행 명령을 설계와 대조했다. 구조 검사에서 7개 작업·44개 체크 단계, 공통 제약 10개의 원문 일치, 내부 설계 링크, 코드 블록 균형, 요구사항 ID를 확인했다. 이 절은 문서 자체 점검이며 제품 테스트 통과 기록이 아니다.
