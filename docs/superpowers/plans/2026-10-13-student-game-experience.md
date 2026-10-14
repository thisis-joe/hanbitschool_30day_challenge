# Student Game Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 학생 계정에 원본 캐릭터·장비·통과 보상·탐험 지도와 기존 학습 화면을 연결하고 저장·복원을 검증한다.

**Architecture:** 기존 학습 코어는 유지한다. game 모듈은 PASSED에서 보유를 도출하고 외형만 저장하며, journey는 일관된 읽기 모델이다. 원본 픽셀 자산과 공유 renderer를 React 페이지에서 사용한다.

**Tech Stack:** Java 21 / Spring Boot 4.1.1 / PostgreSQL 17 / Flyway, React 19.3.0 / TypeScript 6.0.3 / TanStack Query / Vite, Node 24 / pnpm 11.25.0, JUnit/Testcontainers / Vitest/MSW / Playwright Chromium.

**Spec:** `docs/superpowers/specs/2026-10-13-game-experience-design.md` (사용자 written spec 승인 완료). 교사 통계는 이어지는 `2026-10-13-teacher-learning-statistics.md`에서 구현하며 전체 요청은 두 계획 모두 완료해야 달성된다.

## Global Constraints

- 작업은 현재 `feat/student-game-ui`와 `/Users/Joseph/.codex/worktrees/student-game-ui-design/hanbitschool_30day_challenge`를 유지한다.
- 학생의 첫 답변은 불변이며 반복 답변·최근 결과와 구분한다. 재학습 오답으로 기존 통과·복습 완료를 되돌리지 않는다.
- 정답·오답·시간 초과 포함 5답변 완료 후 정답 3개 이상이면 통과한다. 0~2개이면 다음 회차는 열리지 않는다. 통과 후 현재 날짜 상한까지 순차적으로 따라잡을 수 있다.
- 다섯 번째 답변 트랜잭션에서 결과·통과·XP를 저장한다. `완료하기`는 화면 이동이며 저장·보상 조건이 아니다.
- 기존 `learning-v1` XP 정책과 3,750 XP당 레벨을 그대로 사용한다. 반복 답변은 1 XP, 밀린 첫 학습은 해당 문항의 당일 최종 지급액보다 1 XP 적다. 최초 통과 XP는 기존 1,125/1,124 규칙이다.
- 서버의 고정 `deadlineAt`, 만료 worker, 멱등 requestId, 계정별 복구와 CSRF를 유지한다. 애니메이션·새로고침·탭 이동으로 시간을 재설정하지 않는다.
- 학생에게 미답변 정답·해설을 제공하지 않는다. 원본의 150개 정답·해설을 학생 번들에 이식하지 않는다.
- 사용자 등록 큐는 직접 해제까지 유지되고 별표와 독립이다. 교사 통계에는 개인 별표·다시 볼 문제 목록이나 큐 reason을 포함하지 않는다.
- 캐릭터는 하루·나루·소담·이든·아린·루미·온유·보라·시온 9명이다. 사용자에게 보이는 카피는 한국어다.
- 카탈로그 버전은 `game-v1`. 해당 회차는 `(value−1)×6 + slotIndex + 1`이다. 현재 `hanbit-v1`의 30회차를 대상으로 하며 콘텐츠·XP 버전을 교체하지 않는다.
- 미보유 장비는 로컬 미리보기만 가능하다. 실제 착용은 서버의 소유권·슬롯 검증 후 저장한다.
- 크림·종이·노랑·짙은 초록 토큰과 원본 pixel artwork를 유지한다. 내장 PNG 9개와 WebP 6개를 정적 파일로 추출하고 자산 manifest와 원본 SHA-256 대조 근거를 남긴다.
- 360px와 데스크톱에서 학습/꾸미기/통계 body overflow가 없고 주요 터치 대상은 48px 이상이어야 한다.
- 실행은 별도 테스트 DB·합성 계정과 현재 격리된 기능 브랜치·워크트리에서만 한다. 운영 자격 증명·기존 검증 계정·실제 학생 결과를 사용하거나 변경하지 않는다.
- 새 의존성·새 인증·보상 경제·콘텐츠 교체·새 자세 sprite 제작·push·PR·merge·운영 배포는 추가하지 않는다. 작업별 커밋을 구분한다.

## Review Focus

1. 6슬롯 모두 null인 기본 외형에서 null을 허용하지 않는 collection copy/직렬화가 실패하거나 키를 지우지 않는가 — Task 1 `emptyEquipmentRoundTripsAllSixNullKeys`.
2. 저장 성공 응답이 유실되고 다른 탭이 revision을 바꿔도 최신 외형을 덮어쓰거나 무한 재전송하지 않는가 — Task 4 `uncertainSaveRecoversWithoutOverwritingAnotherTab`.
3. 구 JSON에 보상 필드가 없거나 timeout worker가 다섯 번째 답변을 확정해도 결과 복구·보상이 유지되는가 — Task 2 `legacyAnswerJsonRestoresNullReward` / `expiredFifthAnswerGrantsTheSamePassReward`.
4. 이미지 로딩 실패·빠른 캐릭터 변경·unmount 뒤 늦은 draw가 학습을 막거나 다른 캐릭터를 덮지 않는가 — Task 3 `failedOrAbortedDrawDoesNotPaintANewerCharacter`, Task 6 `gameReadFailureDoesNotBlockActiveLearning`.
5. firstAnswerCount가 150이어도 마지막 회차 미통과면 완료/최종 선물을 허위 표시하지 않는가 — Task 2 `allFirstAnswersWithoutLastPassIsNotCourseComplete`, Task 5 `lighthousePositionDoesNotClaimThirtyPasses`.

## File Map and Execution

`backend/.../game`는 카탈로그·외형, `learning/Journey*`는 지도 읽기, 기존 Finalizer/AnswerResult는 nullable 보상 확장만 담당한다. `frontend/src/features/game`는 renderer/API/hooks/꾸미기/지도, 기존 learning 페이지는 실제 학습 명령을 유지한다. 교사 계획은 이 계획의 renderer·API를 실제 코드 인터페이스로 소비하며 이 계획의 scratch/ledger는 읽지 않는다.

실행 전 현재 branch/isolation·dirty 상태를 확인한다. fresh `pnpm install --frozen-lockfile`은 frontend에서 Node 24/pnpm 11.25.0으로 실행하고, `./backend/gradlew -p backend test` 및 frontend `test/build/lint`로 기준선을 확인한다. 실패는 원인을 분리하고 기준선 실패 상태를 숨기지 않는다. 이 준비는 Task 1에 포함하며 별도 scaffolding task를 만들지 않는다.

각 task는 RED→최소 구현→covering GREEN→자체 검토→commit→독립 spec/quality review다. controller는 제품 코드를 수정하지 않는다. Java command는 repo root에서, 아래 pnpm command는 Node 24/pnpm 11.25.0 환경에서 실행한다. 테스트의 설정·fixture는 기존 `LearningAnswerTestSupport`, `PostgresTestConfiguration`, `LearningTestClockConfiguration`, `SessionTestClient`를 재사용한다.

---

### Task 1: Server catalog, owned inventory and revisioned appearance

**Files:** Create `backend/src/main/java/kr/hanbit/school/game/{GameCatalog,CharacterOption,GameItem,InventoryItem,GameView,AppearanceCommand,StudentAppearance,StudentAppearanceRepository,StudentEquipment,StudentEquipmentId,StudentEquipmentRepository,GameModule,GameController}.java`; `backend/src/main/resources/db/migration/V8__student_appearance.sql`; `backend/src/test/java/kr/hanbit/school/support/GameApiTestSupport.java`; test `backend/src/test/java/kr/hanbit/school/game/{GameCatalogTest,GameAppearanceIT}.java`.

**Interfaces:**
- Consumes `StudentLearningAccess.requireStudent/lockStudent(AccountPrincipal)`, `ContentCatalog.activeVersion()`, `DayProgressRepository.findByStudentAccountIdAndVersionAndDayLessThanEqualOrderByDayAsc(UUID,String,int)`.
- Produces `GameCatalog.characters(): List<CharacterOption>`; `items(): List<GameItem>`; `rewardForDay(int): GameItem`; `requireCharacter(String): CharacterOption`; `requireItem(String): GameItem`.
- DTOs: `CharacterOption(id,name,assetKey)`; `GameItem(itemId,slot,value,rewardDay,name,assetKey)`; `InventoryItem(itemId,owned,Instant acquiredAt)`; `GameView(catalogVersion,contentVersion,characters,items,String characterId,long revision,Map<String,String> equippedBySlot,inventory)`; `AppearanceCommand(String characterId,Map<String,String> equippedBySlot,Long expectedRevision)` with required nonnegative revision (missing/null is 400, not silently 0).
- Produces `GameModule.view(AccountPrincipal): GameView`, `save(AccountPrincipal,AppearanceCommand): GameView` and GET `/api/student/game`, PUT `/api/student/game/appearance`.
- Test support produces protected `getGame(MockHttpSession): MvcResult`, `putAppearance(MockHttpSession,String,long,Map<String,String>): MvcResult`, using actual MockMvc GET/PUT and CSRF; extends `LearningAnswerTestSupport`.

- [ ] **Step 1: Write catalog and actual API failing tests.** Assert these values and add named cases `emptyEquipmentRoundTripsAllSixNullKeys`, `existingPassedFactsOwnItemsWithoutBackfill`, `rejectsUnownedUnknownWrongSlotAndIncompleteEquipment`, `concurrentFirstSavesOnlyOneRevisionWins`, `appearanceNeverChangesLearningRowsOrDeadline`, `studentRoleAndCsrfAreRequired`:

```java
assertThat(catalog.characters()).extracting(CharacterOption::id)
    .containsExactly("haru","naru","sodam","iden","arin","rumi","onyu","bora","sion");
assertThat(catalog.items()).hasSize(30);
assertThat(catalog.rewardForDay(1).itemId()).isEqualTo("face-1");
assertThat(catalog.rewardForDay(30).itemId()).isEqualTo("hand-5");
// New student: characterId null, revision 0, exactly six null-valued keys.
assertThat(node(getGame(login)).path("revision").asLong()).isZero();
// First save revision 0 -> 1; another revision-0 save is 409 APPEARANCE_CONFLICT.
// Existing PASSED day 1 -> only face-1 owned, acquiredAt equals persisted passed_at.
```

- [ ] **Step 2: Run RED.** `./backend/gradlew -p backend test --tests '*GameCatalogTest' --tests '*GameAppearanceIT'`; missing symbols/routes or assertions must fail for the intended feature, not infrastructure.
- [ ] **Step 3: Implement the interfaces and V8.** Copy all catalog names/ID ordering from spec §5. student_appearances has account PK/FK, nullable character_id, nonnegative revision, updated_at; student_equipment has `(student_account_id,slot)` PK/FK, nullable item_id. Validate all six lower-case keys including null values; use null-preserving collections. GET is a side-effect-free read-only REPEATABLE_READ snapshot of appearance/equipment/ownership; no row means revision 0. lockStudent serializes PUT; increment revision once; stale revision → 409 `APPEARANCE_CONFLICT`, unowned → 409 `GAME_ITEM_NOT_OWNED`, malformed fields → 400 `VALIDATION_ERROR`. Derive owned/acquiredAt solely from PASSED/passed_at; no award ledger or pass backfill.
- [ ] **Step 4: Run GREEN and DB assertions.** Same focused command; assert no change to accounts/password version, first_answers, xp_entries, day_progress, learning_sessions/deadline across GET/PUT. Verify two concurrent initial requests actually overlap and only one wins.
- [ ] **Step 5: Commit.** `feat: persist student character and owned equipment` (only task files).

### Task 2: Journey read model and transactional reward result

**Files:** Create `backend/src/main/java/kr/hanbit/school/game/RewardGrant.java`; `backend/src/main/java/kr/hanbit/school/learning/{JourneyView,JourneyDay,JourneyQuestion,JourneyModule,JourneyController}.java`; modify `backend/src/main/java/kr/hanbit/school/learning/{AnswerResult,LearningAnswerFinalizer,FirstAnswerRepository}.java` and constructor-only call sites identified by `rg 'new AnswerResult' backend/src`; test `backend/src/test/java/kr/hanbit/school/learning/{JourneyIT,GameRewardIT}.java`.

**Interfaces:**
- Consumes Task 1 `GameCatalog.rewardForDay(int)`; existing `LearningSessionModule.status(AccountPrincipal): LearningStatus`, core repositories/clock and GameApiTestSupport.
- Produces `RewardGrant(String itemId,int dayNumber,Instant acquiredAt)` and nullable `AnswerResult.rewardGranted()`; retain every old field/value.
- Produces `FirstAnswerRepository.findByStudentAccountIdAndVersionOrderByQuestionIdAsc(UUID,String): List<FirstAnswer>`.
- `JourneyView(contentVersion,calendarCap,nextAction,UUID activeSessionId,int firstAnswerCount,int journeyPosition,boolean courseCompleted,List<JourneyDay> days,List<JourneyQuestion> questions)`; `JourneyDay(dayNumber,state,availability,firstAnsweredCount,Instant passedAt,rewardItemId,rewardOwned)`; `JourneyQuestion(questionId,dayNumber,position,outcome)` where outcome also supports UNANSWERED.
- `JourneyModule.view(AccountPrincipal): JourneyView`, GET `/api/student/learning/map`; journeyPosition equals firstAnswerCount, not passedDayCount×5.

- [ ] **Step 1: Write failing PostgreSQL reward/journey tests.** Names: `firstThreeOfFivePassGrantsFaceOneWithoutFinish`, `failedFirstThenReplayPassGrantsOnlyOnce`, `expiredFifthAnswerGrantsTheSamePassReward`, `legacyAnswerJsonRestoresNullReward`, `allFirstAnswersWithoutLastPassIsNotCourseComplete`, `firstWrongAndTimeoutMoveButRepeatsDoNot`, `dateAndPreviousPassLocksRemainServerAuthoritative`.

```java
// At current day, FIRST true,true,true,false,false: PASSED and face-1 owned.
assertThat(node(results.get(4)).path("rewardGranted").path("itemId").asString())
    .isEqualTo("face-1");
assertThat(node(session(login,id)).path("lastAnswer"))
    .isEqualTo(node(results.get(4)));
// Replay same request: identical JSON and unchanged xp/first-answer row counts.
// Retry pass: each REPEAT_ANSWER xp_entry is 1; final response may also contain FIRST_DAY_PASS.
// Legacy JSON missing rewardGranted deserializes as null, preserving all old fields.
// 150 actual first answers, day 30 failed: journeyPosition 150, courseCompleted false, hand-5 unowned.
```

- [ ] **Step 2: Run RED.** `./backend/gradlew -p backend test --tests '*JourneyIT' --tests '*GameRewardIT'`.
- [ ] **Step 3: Implement read model and reward field only.** Journey uses a read-only REPEATABLE_READ snapshot with status/core data; 30 ordered days and 150 ordered question states contain no answer/explanation. Compute availability using existing calendarCap/earliestUnpassedDay, give active session precedence; REVIEW activeSession also blocks new starts. In existing Finalizer's first transition to PASSED, populate RewardGrant with persisted microsecond passedAt before storing last_result/idempotency JSON. No game-appearance lock inside finalizer and no XP/calendar/first-answer policy changes. Nullable field supports old JSON; constructor-only adjustments preserve old assertions.
- [ ] **Step 4: Run GREEN plus covering old regressions.** Add `--tests '*DayCompletionIT' --tests '*LearningReplayIT' --tests '*LearningAnswerIT' --tests '*ExpiredAnswerSchedulerIT' --tests '*LearningConcurrencyIT'`. Exercise actual worker/public `ExpiredLearningSessionProcessor.expireOne(UUID,Instant)` or same-package finalizer transaction; assert timestamps at PostgreSQL microsecond precision and all original first rows unchanged.
- [ ] **Step 5: Commit.** `feat: expose canonical journey and first-pass rewards`.

### Task 3: Exact source assets and shared pixel renderer

**Files:** Create `scripts/extract-game-assets.mjs`; `frontend/public/game/manifest.json`; `frontend/public/game/characters/{haru,naru,sodam,iden,arin,rumi,onyu,bora,sion}.png`; `frontend/public/game/scenes/{forest,map,room,village,beach,ascending-map}.webp`; `frontend/src/features/game/{types.ts,artwork.ts,avatarRenderer.ts,GameAvatar.tsx,EquipmentIcon.tsx,game.css}`; test `frontend/src/features/game/{artwork.test.ts,GameAvatar.test.tsx}` and `scripts/extract-game-assets.test.mjs`.

**Interfaces:**
- Produces `CharacterId` (Task 1's 9 IDs), `Slot = 'face'|'hat'|'top'|'bottom'|'shoes'|'hand'`, `Equipment = Record<Slot,string|null>`, `emptyEquipment(): Equipment`.
- Produces `EquipmentArt{width:number,height:number,markup:string,parts?:EquipmentArt[]}`; `equipmentArt(itemId:string): EquipmentArt|null`; `equipmentSvg(art:EquipmentArt): string`; `renderAvatar(canvas:HTMLCanvasElement,characterId:CharacterId,equipped:Equipment,signal?:AbortSignal): Promise<void>`.
- UI exports `GameAvatar({characterId:CharacterId|null,equippedBySlot?:Equipment,className?:string,label?:string})` and `EquipmentIcon({itemId:string|null,slot?:Slot})`. Missing character uses haru image with an unselected label; no DB mutation.
- Extraction CLI: `node scripts/extract-game-assets.mjs --game /Users/Joseph/Downloads/hanbit-ox.html --equipment /Users/Joseph/Downloads/equipment-design-review.html --out frontend/public/game`. Scene keys: forest, map, room, village, beach, ascending-map, from corresponding CSS variables; character order is ART[0..8].

- [ ] **Step 1: Write failing extraction/art/abort tests.** Pin 9 PNG/6 WebP counts and per-file SHA matching decoded source bytes, 30 known item arts and no art for unknown IDs/values. Verify GameAvatar labels and `failedOrAbortedDrawDoesNotPaintANewerCharacter`; a stale async haru draw after switching to bora must not paint over bora or set state after unmount.

```ts
expect(equipmentArt('face-1')).not.toBeNull()
expect(equipmentArt('hand-5')).not.toBeNull()
expect(equipmentArt('<img onerror=alert(1)>')).toBeNull()
expect(Object.keys(emptyEquipment())).toEqual(['face','hat','top','bottom','shoes','hand'])
```

- [ ] **Step 2: Run RED.** `node --test scripts/extract-game-assets.test.mjs`; `pnpm --dir frontend test src/features/game/artwork.test.ts src/features/game/GameAvatar.test.tsx`.
- [ ] **Step 3: Implement extraction and shared rendering.** Read HTML as data, never eval its script. Whitelist binary data URIs and catalog artwork; extract files/manifest, not whole HTML/DAYS/answers/sample state. Reuse identical headHandDesign/GEAR_CLOTHES_ART/HAT_FITS/SCALP_BOUNDS/ANCHORS and gear transforms from both references; type/adapt once, do not duplicate art in pages. Preserve pixel smoothing off, rounding, hair masking, brim/glasses, near/far shoe pieces and restored skin grip. Promise-based cached image loading plus abort/generation checks guard canvas painting. Only fixed locally whitelisted SVG markup enters renderer; user text stays React text/aria values.
- [ ] **Step 4: Run GREEN + build/lint.** Same focused tests and frontend build/lint. Confirm manifest contains no absolute user paths, only source labels and hashes; no canonical problem text/explanation or prototype JS in emitted assets. Add scoped CSS motion/reduced-motion, leave existing account/staff styling untouched.
- [ ] **Step 5: Commit.** `feat: reuse original game artwork with shared avatar renderer`.

### Task 4: Game queries, character selection and real wardrobe

**Files:** Create `frontend/src/features/game/{api.ts,queries.ts,useAppearance.ts,CharacterSelectionPage.tsx,ClosetPage.tsx}`; extend `frontend/src/features/game/types.ts`; modify `frontend/src/app/router.tsx`; tests `frontend/src/features/game/{api.test.ts,useAppearance.test.tsx,CharacterSelectionPage.test.tsx,ClosetPage.test.tsx}`; fixtures `frontend/src/test/gameFixtures.ts`.

**Interfaces:**
- Consumes server GameView/AppearanceCommand/JourneyView from Tasks 1–2 and renderer exports from Task 3. Mirror nullable timestamps as `string|null` and revision as number; do not rename server properties.
- Produces `getGame(signal?): Promise<GameView>`, `saveAppearance(command,signal?): Promise<GameView>`, `getJourney(signal?): Promise<JourneyView>` through existing `request` (PUT for appearance).
- Produces `gameKeys.view(accountId)`, `.journey(accountId)`; `useGame(): UseQueryResult<GameView>`; `useJourney(): UseQueryResult<JourneyView>`; `useAppearance(): {save(characterId:CharacterId|null,equipment:Equipment):Promise<boolean>,busy:boolean,error:string|null}`. Null is retained when wearing a reward before selecting a character; default haru display is not an automatic stored choice.
- New STUDENT routes `/student/character` and `/student/closet`; save character without clearing existing gear, equip one slot using current complete six-slot state, null restores base appearance.

- [ ] **Step 1: Write real-page/MSW failing tests.** Names: `selectsAndRestoresAllNineCharacters`, `unownedPreviewNeverPutsAndCancelRestoresSavedGear`, `ownedEquipAndBaseRestoreSendSixSlotsAndRevision`, `uncertainSaveRecoversWithoutOverwritingAnotherTab`, `latePreviousOwnerSaveNeverEntersNewAccountCache`, `unknownCatalogArtDoesNotExecuteMarkup`.

```ts
// Preview locked hand-5: image and 미보유 text change; PUT count stays 0.
expect(appearancePutCount).toBe(0)
// Revision 7 -> send expectedRevision:7 and all six keys (including null).
expect(command).toMatchObject({expectedRevision:7,equippedBySlot:{face:'face-1',hat:null,top:null,bottom:null,shoes:null,hand:null}})
// Lost response followed by different server revision: fetch current state, show conflict, do not overwrite.
```

- [ ] **Step 2: Run RED.** `pnpm --dir frontend test src/features/game/api.test.ts src/features/game/useAppearance.test.tsx src/features/game/CharacterSelectionPage.test.tsx src/features/game/ClosetPage.test.tsx`.
- [ ] **Step 3: Implement exact exports and pages.** Query keys are account-scoped and disabled for non-students; pass AbortSignal. Guard saves by owner, epoch/mount and latest intent; no auto PUT retry. On uncertain response/409, GET canonical state and resolve only matching intent; otherwise display recoverable conflict. Preview is temporary local state, never a saved value. Clear preview on route/owner change; locked art alone is gray/blurred, labels/unlock text remain readable. Keep direct active learning routes unblocked by no character/error.
- [ ] **Step 4: Run GREEN + covering auth isolation.** Same command plus `src/features/auth/AccountLifetime.test.tsx` and `src/features/auth/AuthSession.test.tsx`; build/lint. Verify initial missing game state doesn't create an appearance row or auto redirect a running session.
- [ ] **Step 5: Commit.** `feat: add saved character selection and owned wardrobe`.

### Task 5: Travel hub, ascending map and scoped navigation

**Files:** Create `frontend/src/features/game/{JourneyMap.tsx,JourneyMapPage.tsx,journeyGeometry.ts,RewardCard.tsx,StudentGameNav.tsx}`; modify `frontend/src/features/game/game.css`, `frontend/src/features/learning/LearningDashboardPage.tsx`, `frontend/src/app/{App.tsx,router.tsx,theme.css}`; tests `frontend/src/features/game/{journeyGeometry.test.ts,JourneyMapPage.test.tsx,StudentGameNav.test.tsx}` and `frontend/src/features/learning/LearningDashboardPage.test.tsx`.

**Interfaces:**
- Consumes `useGame`, `useJourney`, `useLearningStatus`, `useLearningActions`, GameAvatar/EquipmentIcon; no new learning command writer.
- Produces `journeyPoint(step:number): {x:number,y:number}` using source MAP_ANCHORS/MAP_TRAIL for 0..150; `JourneyMap({journey:JourneyView,appearance:GameView|undefined,compact?:boolean})` and `RewardCard({item:GameItem,owned:boolean,onWear?:()=>void})`.
- Home remains `/student/learning`, map STUDENT route `/student/map`. Today's primary action comes from fresh status/active session, not local map completion or character choice.

- [ ] **Step 1: Write failing tests.** Names: `homeUsesAReferenceWithCanonicalNextAction`, `mapShowsLockedDateAndPreviousPassSeparately`, `mapContinueUsesReviewOrDayActiveSession`, `lighthousePositionDoesNotClaimThirtyPasses`, `recenterUsesTheCanonicalStepAndReducedMotion`, `headerKeepsAccountAndLogoutAccess`. Keep old dashboard start/replay/stale-active-session assertions rather than deleting them to accommodate styling.

```ts
expect(journeyPoint(0)).toEqual({x:55.3,y:96.8})
expect(journeyPoint(150)).toEqual({x:56.5,y:5.6})
// step=150/courseCompleted=false -> no 30회차 완료 claim, day30 retry action remains.
// Active REVIEW session -> continue its real sessionId, no FIRST start POST.
```

- [ ] **Step 2: Run RED.** `pnpm --dir frontend test src/features/game/journeyGeometry.test.ts src/features/game/JourneyMapPage.test.tsx src/features/game/StudentGameNav.test.tsx src/features/learning/LearningDashboardPage.test.tsx`.
- [ ] **Step 3: Implement the referenced layouts and actions.** A camp/travel hub, six region labels, source scene art; B ascending-map internal scroll viewport with future gray/color reveal, current location, accessible ordered day alternatives and recenter. Map day controls use server availability; confirm fresh status before starting and continue canonical active session. Source coordinate endpoints and interpolation only, not source XP/unlock logic. Sticky responsive student nav has 오늘/탐험/꾸미기/나의 문제 plus maintained account/password/logout; staff/public headers remain intact.
- [ ] **Step 4: Run GREEN + App/role regressions and build/lint.** Add `src/app/App.test.tsx`, `src/app/RequireRole.test.tsx`. Check source mobile map viewport doesn't cause body overflow; client doesn't color unearned rewards or fabricate progress on loading/error.
- [ ] **Step 5: Commit.** `feat: connect travel hub and canonical exploration map`.

### Task 6: Game learning scene, saved result gift and cross-cache refresh

**Files:** Create `frontend/src/features/game/LearningGameScene.tsx`; modify `frontend/src/features/learning/{LearningSessionPage.tsx,LearningResultPage.tsx,PersonalQuestionsPage.tsx,types.ts,useLearningActions.ts,learning.css}`, `frontend/src/features/game/{game.css,RewardCard.tsx}`; tests `frontend/src/features/learning/{LearningSessionPage.test.tsx,LearningResultPage.test.tsx,PersonalQuestionsPage.test.tsx,useLearningActions.test.tsx}` and `frontend/src/features/game/LearningGameScene.test.tsx`.

**Interfaces:**
- Consumes GameView/JourneyView, RewardCard, useAppearance and existing session states/actions/countdown. TypeScript AnswerResult adds optional nullable `rewardGranted?: {itemId:string,dayNumber:number,acquiredAt:string}|null` to read old responses.
- Produces `LearningGameScene({appearance:GameView|undefined,outcome?:AnswerOutcome,journey?:JourneyView})`; no answer 판정, timer, requestId or auto advance API.
- Answer success invalidates existing learning status/questions and account-owned game view/journey; new result gift uses `rewardGranted`, never locally guessed first-pass state.

- [ ] **Step 1: Write failing real-page tests.** Names: `gameReadFailureDoesNotBlockActiveLearning`, `fifthFeedbackLeavesWithoutFinishAndRestoresGift`, `wearSavedRewardUsesOwnedAppearanceMutationOnly`, `wearRewardKeepsUnselectedCharacterNull`, `legacySavedResultWithoutRewardStillRestores`, `journeyAnimationCannotAdvanceOrResetDeadline`, `queryInvalidationRefreshesGameAndMapForSameOwnerOnly`, `workerTimeoutRestorationRefreshesGameAndMap`. Keep current double-click, lost response, timeout, consent and previous-owner regressions.

```ts
// Failed game GET: O/X and original deadline still rendered and answer works.
// Completed result GET with rewardGranted face-1: show its fixed artwork, no answer/finish POST.
// UI button exact copy: 지금 착용하기 -> appearance PUT only; XP stays server total.
// Last response without rewardGranted: no fabricated 새 선물 or extra mutation.
```

- [ ] **Step 2: Run RED.** Focused session/result/actions/scene tests using `pnpm --dir frontend test` with those exact file paths.
- [ ] **Step 3: Implement scene styling and guarded invalidation.** Reuse original play road/forest/village/beach scenes, large O·사실/X·해석 controls, confirmed feedback and gift layout. Guarded cache refresh must also recognize a new canonical lastAnswer ID from worker timeout/GET restoration, not just successful client answer POST; repeated same fact must not create a new movement or write. Reduced-motion and pending command safety take precedence over animation; first-answer travel is decorative and an explicit next still advances exactly once. No countdown pause, auto answer, optimistic XP/reward, final save endpoint or total attempt XP guessed from responses. Personal questions retain all three filters and queue/bookmark independence under game styles.
- [ ] **Step 4: Run GREEN + whole frontend test/build/lint.** Verify existing learning tests remain meaningful; changed labels get semantic assertions, not weaker tests. Result refresh/re-login never submits learning writes.
- [ ] **Step 5: Commit.** `feat: integrate game scenes and persisted pass rewards`.

### Task 7: Isolated game E2E, artwork matrix and execution record

**Files:** Create `frontend/e2e/{game-flow.spec.ts,equipment-renderer.spec.ts,learning-helpers.ts}`, `frontend/e2e/fixtures/equipment-review.html`, `docs/verification/2026-10-13-game-experience.md`; modify `frontend/{playwright.config.ts,e2e/helpers.ts,e2e/learning-flow.spec.ts,e2e/account-flow.spec.ts}`, `infra/compose.local.yml`, `README.md` only for isolated test target parametrization.

**Interfaces:**
- Existing E2E helpers remain compatible. Move reusable local learning helpers into `learning-helpers.ts` with existing signatures before importing them from old/new cases; do not duplicate the whole learning-flow harness.
- `HANBIT_E2E_BASE_URL` overrides default `http://localhost:8088`; reject non-loopback/non-HTTP targets. `HANBIT_E2E_COMPOSE_PROJECT` defaults `hanbit-account-e2e`; accept only `^hanbit-[a-z0-9-]*e2e$`, reject prod/projectless values before any docker command. account-flow inspect/recreate targets use this same validated project.
- Local web bind becomes `127.0.0.1:${HANBIT_HTTP_PORT:-8088}:80`. Fresh this-worktree `.env.e2e.local` mode 600 sets port 8090/test-only credentials; project `hanbit-game-e2e`/its own school-data volume. No prod config/env reads or changes.
- Art-only review fixture imports shared renderer under a Vite dev server bound 127.0.0.1:8091; `HANBIT_GEAR_QA_URL=http://127.0.0.1:8091/e2e/fixtures/equipment-review.html`. It displays 9×(base+5 matching sets) and mixed sets without auth/student records and is not a production route.

- [ ] **Step 1: Write failing actual-browser cases.** `characterWardrobePersistsAcrossRelogin`, `firstPassGiftSavesWithoutFinishAndReplayPaysOnlyRepeatXp`, `lockedPreviewCannotBecomeSavedGear`, `mapUsesFirstFactsAndServerLocks`, `directActiveSessionSurvivesMissingCharacter`, `allNineMatchingAndMixedOutfitsRenderSourcePixels`. Asset matrix must await image/draw completion, assert nonempty pixels and compare actual screenshots/canvas with reference shapes; count-only assertions are insufficient.
- [ ] **Step 2: Prepare isolated target and run RED.** Silent compose config validation; build backend/web, then start db/backend and wait actual backend healthy before starting web. Verify loopback HTTP API, then run new Playwright files with base/project overrides. Existing 8088 project and all prod services remain untouched. Never restart a process because an observation timed out; poll its existing handle.
- [ ] **Step 3: Implement harness support only.** Preserve trace/video/screenshot off and `preserveOutput:'never'` for auth/learning data; screenshots retained for the art-only matrix and sanitized synthetic result proof only. Generated fixture files are ignored and secrets never printed. Protect both account restart sites with backend→Docker healthy→web→HTTP ready; no fixed sleep. Update docs/default-compatible env knobs.
- [ ] **Step 4: Run GREEN and final game verification.** `./backend/gradlew -p backend test`; Node24/pnpm11.25 frontend test/build/lint; new browser cases then full suite with validated game E2E target. Independently sum JUnit failures/errors/skips, record actual counts/SHA. Check emitted student bundle against canonical 150 question/explanation strings (0 matches). Capture/review original versus new art matrix, 360/1280px home/map/closet/question/result/questions overflow and ≥48px controls, keyboard/focus/reduced motion and restart/re-login persistence.
- [ ] **Step 5: Commit and review.** `test: verify real game experience and artwork fidelity`. Write G01–G07/G10–G14 evidence and unresolved issues in verification doc. Final whole-branch review for this plan precedes the teacher plan; persist all rulings in Git-backed verification before recovering/removing this plan's ignored scratch. Do not present this as completion of the overall goal or offer integration yet; teacher plan remains required.

## Controller Self-Review and Handoff

Coverage: G01→1/3; G02→1/4/7; G03→1/4; G04→2/7; G05→1/2/7; G06→2/6/7; G07→2/5/7; student G10→2/3/7; G11→3/7; student G12→4/5/6/7; student G13→4/5/6/7; game G14→7/final review. Teacher G08/G09 and remaining G10/G12/G13/G14 are explicitly owned by the linked teacher plan. All five Review Focus lines have named tests; Task 1–6 interface names are consistent. No product task is a placeholder or mock-only deliverable.

Status: plan prepared for user review; execution method already selected as SDD. Once both plans are approved, run this plan's tasks in order, then the teacher plan, without inter-task confirmation requests.
