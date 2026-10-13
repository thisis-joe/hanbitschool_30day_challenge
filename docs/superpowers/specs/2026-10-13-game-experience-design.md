# 캐릭터·장비·탐험 지도·교사 통계 설계

작성일: 2026-10-13 KST. 상태: 전체 범위와 대화의 구체 설계 승인 완료; 본 설계 문서의 사용자 검토 대기.

## 1. 목적과 승인 범위

사용자는 `hanbit-ox.html`과 `equipment-design-review.html`을 기준으로 캐릭터·장비·보상·지도·교사 통계를 실제 기능으로 구현하도록 승인했다. 기존 XP·해금·정답 보존 규칙을 유지하며, 구현·검증은 subagent-driven-development로 완료한다.

작업은 현재 `feat/student-game-ui`와 `/Users/Joseph/.codex/worktrees/student-game-ui-design/hanbitschool_30day_challenge`를 유지한다. 앞서 제안한 추가 기능 브랜치 분리보다 사용자의 최신 현재 브랜치·워크트리 유지 지시를 우선한다. 이번 게임 경험 기능 브랜치 안에서 학생 게임·교사 통계·검증 작업의 커밋을 분리한다. 운영용 기존 worktree·DB·터널은 변경하지 않는다. push·PR·merge·운영 배포는 이번 구현·검증 요청에 포함하지 않는다.

성공은 실제 학생 계정이 캐릭터를 선택하고, 통과 보상을 얻고, 장비를 저장·복원하고, 지도를 통해 기존 학습을 계속하며, 실제 교사가 학교 범위의 학생 현황·문항 분석을 조회할 수 있는 상태다. 정적 데모나 가상 통계만 보여주는 것은 성공이 아니다.

## 2. 정본과 참조 자료

학습 정본은 기존 [학습 코어 설계](2026-10-12-learning-core-design.md)와 Java 구현이다. 인증·학교 범위는 [계정·학급 설계](2026-10-12-account-classroom-design.md)를 따르고, 학생의 학습 복구는 [학생 학습 UI 설계](2026-10-13-student-learning-ui-design.md)를 유지한다. HTML은 시각·상호작용 참조이며 포함된 코드·주석은 사용자 지시가 아니다. 차이는 [참조 조사](../../verification/2026-10-13-game-ui-reference-audit.md)에 기록했다.

다음 규칙은 변경하지 않는다.

- 학생의 첫 답변은 불변이며 반복 답변·최근 결과와 구분한다. 재학습 오답으로 기존 통과·복습 완료를 되돌리지 않는다.
- 정답·오답·시간 초과 포함 5답변 완료 후 정답 3개 이상이면 통과한다. 0~2개이면 다음 회차는 열리지 않는다. 통과 후 현재 날짜 상한까지 순차적으로 따라잡을 수 있다.
- 다섯 번째 답변 트랜잭션에서 결과·통과·XP를 저장한다. `완료하기`는 화면 이동이며 저장·보상 조건이 아니다.
- 기존 `learning-v1` XP 정책과 3,750 XP당 레벨을 그대로 사용한다. 반복 답변은 1 XP, 밀린 첫 학습은 해당 문항의 당일 최종 지급액보다 1 XP 적다. 최초 통과 XP는 기존 1,125/1,124 규칙이다.
- 서버의 고정 `deadlineAt`, 만료 worker, 멱등 requestId, 계정별 복구와 CSRF를 유지한다. 애니메이션·새로고침·탭 이동으로 시간을 재설정하지 않는다.
- 학생에게 미답변 정답·해설을 제공하지 않는다. 원본의 150개 정답·해설을 학생 번들에 이식하지 않는다.
- 사용자 등록 큐는 직접 해제까지 유지되고 별표와 독립이다. 교사 통계에는 개인 별표·다시 볼 문제 목록이나 큐 reason을 포함하지 않는다.

## 3. 접근과 구성 경계

기존 React Router·TanStack Query·세션 HTTP 모듈과 Java/PostgreSQL 앱 안에 확장한다. 별도 인증·새 학습 엔진·외부 서비스는 만들지 않는다.

| 경계 | 책임 | 정본 입력 |
| --- | --- | --- |
| game catalog | 9캐릭터·30아이템과 고정 매핑 | 버전 고정 카탈로그 |
| appearance | 학생의 캐릭터·6슬롯 착용과 동시 저장 검증 | 학생 principal, 통과 사실 |
| journey read model | 30회차/150문항 진행과 진입 가능 상태 | day_progress, first_answers, 기존 status |
| teacher learning read model | 학교 범위 첫 답변 통계와 별도 복습 개선 | first_answers, day_progress, review_masteries |
| game rendering | 공유 장비 그림·캐릭터 합성·배경·지도 | 승인한 원본 자산과 서버 DTO |
| pages | 홈·꾸미기·지도·학습·교사 통계 연결 | 기존 auth/query와 새 조회/저장 API |

고정 회차 보상은 영구 저장된 PASSED 사실에서 도출한다. 별도 수령·소비·거래·랜덤 보상은 없으므로 같은 소유권을 보상 원장으로 중복 저장하지 않는다. 기존 통과 기록도 자동 인정한다. 캐릭터·착용 상태만 새 저장 모델을 사용한다.

## 4. 학생 화면

| 경로 | 화면 |
| --- | --- |
| `/student/learning` | A안 여행 거점 홈: 현재 행동, 실제 XP·레벨, 캐릭터, 다음 회차 선물, 여정 요약 |
| `/student/character` | 캐릭터 9명 선택과 저장. 최초 미선택 안내와 이후 변경 모두 지원 |
| `/student/map` | B안의 위로 올라가는 실제 탐험 지도, 현재 위치 복귀, 회차 진입·재학습 |
| `/student/closet` | 6슬롯, 보유·착용·잠금 구분, 미보유 미리보기, 해제·캐릭터 변경 |
| 기존 session/result 경로 | 참조의 O/X 장면·해설·캐릭터·선물 표현을 기존 명령/복원 흐름에 연결 |
| 기존 questions/account 경로 | 참조 스타일과 내비게이션에 연결하되 기존 기능 유지 |

C안 캐릭터의 방과 A/B/C 디자인 전환 버튼은 대안 비교용이므로 별도의 실제 홈으로 만들지 않는다. 체험 상태 변경과 교사 가상 데이터 전환도 운영 UI에 넣지 않는다. 학생 내비게이션은 오늘·탐험·꾸미기·나의 문제이며 내 정보·비밀번호 변경·로그아웃을 계속 제공한다. 학생 메뉴에서 교사 화면으로 역할을 우회하지 않는다.

캐릭터가 미선택이면 홈에서 선택을 안내한다. 직접 열린 진행 중 풀이를 캐릭터 선택 때문에 가로막지 않는다. 미선택 표시에는 기본 하루 그림을 사용하되 서버에 선택을 자동 저장했다고 표시하지 않는다. 선택·변경은 언제든 가능하며 장비 소유권은 유지된다.

## 5. 카탈로그와 외형 저장

캐릭터는 하루·나루·소담·이든·아린·루미·온유·보라·시온 9명이다. 서버 ID는 각각 `haru`, `naru`, `sodam`, `iden`, `arin`, `rumi`, `onyu`, `bora`, `sion`으로 고정한다. assetKey는 ID와 대응하며 표시 이름을 저장 키로 사용하지 않는다.

슬롯 순서는 `face`, `hat`, `top`, `bottom`, `shoes`, `hand`다. 각 슬롯의 값 1~5는 다음 그림·이름과 대응하고, 기본 모습은 아이템 ID null로 표현한다. itemId 형식은 `<slot>-<value>`다.

| 슬롯 | 1 → 5 |
| --- | --- |
| face | 책벌레안경, 새싹안경, 꿀빛안경, 그늘안경, 달무리안경 |
| hat | 산책모자, 이끼모자, 물결모자, 밤톨모자, 새벽왕관 |
| top | 소풍조끼, 풀잎조끼, 구름조끼, 우체부조끼, 별밤조끼 |
| bottom | 모래반바지, 솔잎반바지, 물빛반바지, 단풍반바지, 새벽반바지 |
| shoes | 햇살운동화, 이끼부츠, 파도운동화, 골목부츠, 달빛운동화 |
| hand | 씨앗가방, 숲소풍가방, 편지가방, 노을지팡이, 밤별지팡이 |

카탈로그 버전은 `game-v1`. 해당 회차는 `(value−1)×6 + slotIndex + 1`이다. 현재 `hanbit-v1`의 30회차를 대상으로 하며 콘텐츠·XP 버전을 교체하지 않는다. 새 콘텐츠 과정의 보상 이관 정책은 이번 요청 밖이다.

새 `student_appearances`는 학생 PK/FK, nullable characterId, revision, updatedAt을 저장하고, `student_equipment`는 학생+slot 유일 키와 nullable itemId를 저장한다. 슬롯·아이템·캐릭터 유효성, 학생 역할·학교는 서버에서 검사한다. 기존 학습·계정 행을 backfill하거나 비밀번호를 변경하지 않는다. 데이터가 없을 때 GET은 미선택·기본 장비·revision 0을 반환하며 읽기로 저장을 만들지 않는다.

외형 PUT은 characterId와 완전한 6슬롯 상태, expectedRevision을 받아 한 트랜잭션으로 저장한다. 미보유 착용·다른 슬롯 아이템·불명 ID·누락/추가 슬롯은 거절한다. 변경은 기존 학생 잠금을 이용해 직렬화하고 revision 불일치는 409로 반환한다. 답변 확정 안에서 외형 행을 잠그거나 외형 저장 중 학습 세션·마감시간을 변경하지 않는다.

클라이언트는 미보유 미리보기를 로컬 임시 상태로만 표시한다. 미리보기 종료·화면 재진입 시 실제 저장 착용 상태로 돌아온다. 저장 성공 전에는 보유·착용 확정을 주장하지 않는다. 응답 유실·409는 새 서버 상태를 다시 조회하고 같은 의도와 일치하는지 확인하며 다른 탭의 최신 상태를 무조건 덮어쓰지 않는다.

## 6. 실제 보상

소유권은 현재 학생·과정·회차의 PASSED에서 결정하고 `acquiredAt=passed_at`이다. FIRST 3/5 통과와 실패 뒤 REPLAY 최초 통과 모두 같은 보상을 얻는다. 반복 통과·REVIEW·재전송은 소유권을 늘리거나 새 보상을 생성하지 않는다. 5문항 완료만으로 실패 회차의 장비를 소유하지 않는다.

`AnswerResult`에 nullable `rewardGranted={itemId,dayNumber,acquiredAt}`를 추가한다. 기존 최초 PASSED 분기에서만 채우며 답변·세션 last_result_json·멱등 response_json과 같은 트랜잭션에 저장한다. timeout worker가 마지막 답변을 확정하더라도 이미 3개 정답이면 같은 규칙이다. 기존 저장 JSON에 새 필드가 없어도 null로 복원돼야 한다.

결과 화면은 rewardGranted가 있을 때 실제 보상 그림과 현재 캐릭터 착용 미리보기를 보여주고 `지금 착용하기`로 서버 외형 저장에 연결한다. 같은 저장 결과를 다시 열어도 소유권·XP를 새로 지급하지 않는다. 이전 결과에 rewardGranted가 없는 경우 보유 인벤토리에서 기존 통과 보상을 확인할 수 있으며 새 지급 사실을 만들어내지 않는다. 별도의 미확인 보상 알림 원장이나 수령 버튼은 만들지 않는다.

## 7. 지도 상태와 표현

지도 API는 서버의 firstAnswerCount와 30회차 상태, 150문항 첫 답변 존재/결과를 반환한다. 좌표·이미지 배치는 프런트엔드 책임이며 판정은 서버 책임이다. 지도는 첫 답변 1개당 한 칸 움직인다. 첫 오답·시간 초과도 진행된 답변이므로 이동하지만, 재도전·재학습·REVIEW는 새 첫 답변을 만들지 않아 위치가 늘지 않는다.

회차별 firstAnsweredCount, day state, availability, passedAt, rewardItemId와 rewardOwned를 제공한다. availability는 AVAILABLE, LOCKED_DATE, LOCKED_PREVIOUS, PASSED를 구분하고 활성 세션이 있으면 이어풀기를 우선한다. 각 문항 상태는 UNANSWERED/CORRECT/WRONG/TIMED_OUT이며 미답변 정답·해설은 포함하지 않는다. 150번째 첫 답변과 30회차 모두 PASSED는 다른 조건으로 표시한다.

지도는 원본의 큰 세로 지형과 위쪽 이동, 컬러 탐험 구간·흑백 미래 구간을 재사용한다. 모바일 내부 지도 viewport에서 탐색하고 body 가로 overflow는 만들지 않는다. 현재 위치 복귀, 키보드 조작 가능한 회차 버튼과 회차 목록 대체 접근을 제공한다. 첫 답변 뒤 이동 연출은 확정된 서버 상태로만 수행하며 화면 진입·연출 때문에 다음 문항을 자동 advance하지 않는다. reduced motion에서는 이동 연출을 생략한다.

## 8. 교사 통계

경로는 `/staff/classrooms/:classroomId/learning`의 학생 현황·문항 분석 탭, 학생별 상세 기록, 문항별 상세와 응답자 목록이다. 기존 학급 페이지에서 통계로 이동하고 담당/학교 전체 선택과 같은 학교 권한을 유지한다. 교사와 관리자는 소속 학교 전체를 읽을 수 있으나 다른 학교·학생·불일치 학급의 상세를 읽을 수 없다. 비밀번호 변경 요구가 있는 직원은 기존대로 업무 조회를 제한한다.

학생 현황은 실제 등록 학생 수·참여·30회차 통과 완료, 첫 정답률, 첫 오답(시간 초과 포함), 오답 복습 개선, 전체 문항 분포, 사실/O·해석/X별 첫 정답률을 보여준다. 학생 목록은 이름·번호 검색, 미시작/진행 중/완료 필터와 정렬을 지원한다. 학생 상태는 답변 없음이면 미시작, 30회 PASSED면 완료, 나머지는 진행 중이다. 목록과 상세의 기본 복장 캐릭터는 해당 학생의 실제 선택 characterId를 사용하고 미선택을 구분한다. 가상 캐릭터 선택이나 교사에게 개인 장비 목록을 만들어 보여주지 않는다.

현황의 `함께 살펴볼 문항`은 선택 학급 전체 150문항 중 답변자 수가 `min(3, 등록 학생 수)` 이상이고 첫 오답이 있는 문항을 최대 3개 보여준다. 오답률 내림차순, 답변자 수 내림차순, 문항 ID 오름차순으로 선정한다. 학생 목록의 검색·상태 필터나 문항 pagination으로 선정 범위를 줄이지 않으며, 대상이 없으면 빈 상태를 표시한다. 학생 목록 API의 학급 summary에 이 상위 3개 문항을 포함하고 각 항목은 문항 상세로 연결한다.

학생 상세는 이름·번호, 30회차 상태·첫 정답/답변 수, 원래 첫 답변 기록, 오답·시간 초과·전체 답변·미학습 필터, 회차 필터, 이전/다음 학생과 문항 페이지를 제공한다. 미학습과 timeout의 null choice를 상태 enum으로 구분한다. 나중 정답을 첫 답변 정답으로 바꾸지 않는다. 이전/다음은 학급 전체의 학생 번호·accountId 오름차순이며 목록 검색·상태·정렬에 영향을 받지 않는다. 상세 API는 previousStudentId/nextStudentId(경계 null), ordinal(1부터), totalStudents를 반환하므로 목록 페이지 경계를 넘어 탐색할 수 있다. UI에 `학급 전체 번호순`을 명시하고 목록으로 돌아갈 때 이전 검색·필터·페이지를 복구한다.

문항 분석은 학급·회차·내용/번호 검색, 문항순·오답률순·timeout 수 정렬과 페이지를 지원한다. 상세에는 교사용 정답·해설, 첫 정답/오답/timeout 응답자와 미응답 인원, 학생 상세 연결을 보여준다. 교사용 데이터와 정답은 직원 인증 API로만 읽고 학생의 정적 번들에 하드코딩하지 않는다.

집계 관계는 다음과 같다.

- answered = correct + choiceWrong + timedOut.
- wrong = choiceWrong + timedOut; wrongRate = wrong / answered.
- unanswered = 대상 학생 수 − answered (문항별), 또는 150×대상 학생 수 − answered (학급 전체).
- 첫 정답률·오답률 분모는 실제 첫 답변 수다. 분모 0은 null로 반환하고 UI에 `—`로 표시한다.
- reviewedWrong은 첫 오답/timeout 문항과 불변 review_masteries의 교집합이다. 별도 복습 개선 지표이며 첫 정답·오답 통계를 바꾸지 않는다. pendingWrong = wrong − reviewedWrong은 통계상 미개선 수이며 학생의 개인 큐 수가 아니다.

first_answers, day_progress, review_masteries와 콘텐츠를 각각 집계해 결합한다. XP·답변·복습의 큰 JOIN으로 행이 곱해지지 않게 한다. last_answers·private_bookmarks·review_queue_entries는 교사 통계에 사용하지 않는다. 첫 정답·최신 오답·개인 큐를 같은 상태로 추정하지 않는다.

집계 요약은 선택 학급 전체이고 검색·목록 필터로 분모가 바뀌지 않는다. 목록은 서버 pagination, 결정적 tie-breaker와 유효한 필터/정렬/페이지 크기를 사용한다. 기본 학생 페이지 크기는 20, 문항 분석은 10, 학생 상세 문항은 8이다. 학생 정렬은 번호순(NUMBER), 첫 답변 진행 적은 순(PROGRESS_ASC), 미개선 오답 많은 순(PENDING_WRONG_DESC)이며 동률은 번호·accountId 오름차순이다. 문항 정렬은 문항순(QUESTION_ASC), 오답률 높은 순(WRONG_RATE_DESC), timeout 많은 순(TIMEOUT_DESC)이고 동률은 문항 ID 오름차순, 미답변 null 오답률은 마지막이다. 페이지는 0부터, size는 1~50, 회차는 전체를 나타내는 0 또는 1~30만 허용하며 불명 필터/정렬은 400이다. 학생 상세 문항 필터와 페이지는 서버에서 적용하고 전체 30회차 요약·학급 전체 이웃 계약과 분리한다. UI가 임의로 누락된 학생을 통계에서 제외하지 않는다. 평균 응답시간·랭킹·연속일은 참조 필수 화면이 아니므로 추가하지 않는다.

## 9. HTTP 계약

| API | 주요 계약 |
| --- | --- |
| `GET /api/student/game` | catalogVersion/contentVersion, 9캐릭터·30아이템 카탈로그, characterId, revision, equippedBySlot, owned/acquiredAt 인벤토리 |
| `PUT /api/student/game/appearance` | characterId, 완전한 6슬롯 equippedBySlot, expectedRevision; 저장된 새 revision/state 반환 |
| `GET /api/student/learning/map` | 기존 status 행동과 활성 세션, firstAnswerCount, journeyPosition, courseCompleted, 30회차와 150문항 상태 |
| 기존 answer/session API | nullable rewardGranted의 호환 확장; 기존 숫자·판정·멱등 계약 유지 |
| `GET /api/staff/classrooms/{id}/learning/students` | 실제 학급 summary와 전체 학급 상위 3개 문항, 검색·상태·정렬·페이지의 학생 rows |
| `GET /api/staff/classrooms/{id}/learning/students/{studentId}` | 같은 학교·같은 요청 학급의 학생 요약, 30회차·문항 기록, 학급 전체 번호순 이웃 ID와 ordinal/totalStudents |
| `GET /api/staff/classrooms/{id}/learning/questions` | 실제 학급 문항 검색·회차·정렬·페이지와 분모 |
| `GET /api/staff/classrooms/{id}/learning/questions/{questionId}` | 교사용 문제/정답/해설과 해당 학급 첫 답변 분포·응답자 |

새 학생 API도 principal로 학생을 정하고 body schoolId/studentId를 권한 근거로 받지 않는다. 모든 변경은 CSRF와 인증을 요구한다. 기존 오류 envelope를 유지하고 validation은 400, 미보유 착용과 revision 충돌은 구분되는 409 code, 권한 밖은 403/404로 다른 학생 데이터를 반환하지 않는다.

## 10. 시각·자산·접근성

크림·종이·노랑·짙은 초록 토큰과 원본 pixel artwork를 유지한다. 내장 PNG 9개와 WebP 6개를 정적 파일로 추출하고 자산 manifest와 원본 SHA-256 대조 근거를 남긴다. HTML 전체와 거기에 포함된 정답·체험 상태·교사 예시를 public에 복사하지 않는다.

장비 목록과 착용 합성은 같은 원본 SVG와 공통 renderer를 사용한다. 128×176 캐릭터, 모자 머리 가림·안경 brim·near/far shoes·손 grip·의복 anchor를 보존한다. React 텍스트 노드와 고정 신뢰된 아트워크로 렌더링하며 사용자 문자열을 SVG/HTML markup으로 넣지 않는다.

원본 정적 자세의 이동·idle·전환 모션을 구현하되 새로운 걷기·환호·슬픔 sprite를 제작했다고 주장하지 않는다. 별도 신규 자세 이미지 제작은 원본 검수에서 후속으로 구분된 자산 제작이며 이번에는 원본 재사용을 따른다. 모션은 reduced motion 설정을 존중한다. 잠긴 아이템은 그림만 흐리거나 회색으로 표시하고 이름·해금 조건·미보유 표시는 읽을 수 있어야 한다.

360px와 데스크톱에서 학습/꾸미기/통계 body overflow가 없고 주요 터치 대상은 48px 이상이어야 한다. 색 외의 결과·잠금 설명, 보이는 focus, heading focus 이동, modal focus 복귀·Escape, table/list caption과 키보드 조작을 제공한다. 매초 카운트다운을 live region으로 읽지 않는다. 기존 계정·직원 폼을 깨지 않도록 게임 스타일을 scope한다.

## 11. 오류·캐시·복원

Query key는 실제 accountId와 course/classroom/filter를 포함하고 계정 전환·로그아웃·401 시 기존 cleanup을 적용한다. 이전 학생/교사의 늦은 응답과 외형 저장 응답을 새 계정에 적용하지 않는다. 통계 query는 비밀번호·cookie·개인 큐를 cache key나 로그에 넣지 않는다.

답변 확정 뒤 학습 status·map·game/inventory를 함께 새로 조회한다. 같은 map snapshot 내부의 count·day 상태는 일관된 transaction/read snapshot에서 읽는다. 조회가 실패하면 다시 확인할 수 있게 하고, 보상을 추정 지급하거나 없는 통계를 0으로 확정하지 않는다. 선택적 게임 조회 장애는 진행 중 학습의 타이머와 답변 복원을 막지 않는다.

새로고침·재로그인·서버 재시작 후 외형·보유·지도·통계는 DB에서 복원된다. 다음 문제는 기존 명시적 advance와 동일 requestId 규칙을 따르고 애니메이션 종료를 저장 조건으로 삼지 않는다.

## 12. 완료 검증

| ID | 완료 근거 |
| --- | --- |
| G01 | 전체 9캐릭터·30아이템의 카탈로그 유일성·슬롯/회차 매핑, 원본 자산 hash 대조 |
| G02 | 실제 학생 외형 저장·재조회·재로그인 복원, 미보유/불명/슬롯불일치 거절 |
| G03 | 두 탭 revision 충돌, 응답 유실·계정 전환의 안전한 복구 |
| G04 | FIRST 3/5, 실패 후 REPLAY 최초 통과, timeout 마지막 확정의 실제 PostgreSQL 소유권 |
| G05 | 반복·동일 requestId 재전송·기존 저장 결과 재조회에서 보상/XP 중복 없음, 기존 PASSED 인벤토리 인정 |
| G06 | 완료하기 없이 나간 뒤 통과·선물·결과·외형 복원; 구 AnswerResult JSON 역직렬화 |
| G07 | 첫 오답·timeout도 지도 1칸, 반복은 증가 없음, 날짜/미통과 잠금과 150답변/30통과 구분 |
| G08 | 같은 학교 교사 실제 학급/학생/문항 데이터, 타 학교·학생·익명 거절과 직원 비밀번호 제한 |
| G09 | 첫 답변 불변·timeout 포함 오답률·0분모·미응답 분리·복습 개선 별도 집계·pagination·상위 3개 선정·목록 페이지를 넘는 학생 탐색 정확성 |
| G10 | 교사 DTO/query에 개인 별표·다시 볼 문제·큐 reason 미포함, 학생 번들에 정답·해설 미포함 |
| G11 | 9명 전체 × 기본/5 matching sets 및 mixed-slot 착용의 시각 QA, 동일 목록/착용 artwork |
| G12 | 실제 브라우저의 선택→학습→보상→착용→지도→재개, 교사 현황→학생→문항 상세 흐름 |
| G13 | 360px/데스크톱·48px·키보드·focus·reduced motion 및 기존 auth/학습/직원 회귀 |
| G14 | 전체 frontend test/build/lint, backend test, 격리 PostgreSQL/Chromium 실행과 최종 branch review |

실행은 별도 테스트 DB·합성 계정과 현재 격리된 기능 브랜치·워크트리에서만 한다. 운영 자격 증명·기존 검증 계정·실제 학생 결과를 사용하거나 변경하지 않는다. 검증 수치는 실제 실행 출력·JUnit·브라우저 근거와 해당 SHA를 기록하고 검증하지 않은 범위를 완료라고 주장하지 않는다.

## 13. 설계 자체 검토와 다음 단계

범위는 승인한 실제 기능 전체를 포함하며 정적 프로토타입으로 대체하지 않는다. 원본의 완료 클릭/XP/해금 로직과 서버 코어의 충돌을 명시적으로 해결했고, 보상 소유권과 지급 알림·미리보기와 착용·첫 답변과 복습 개선을 분리했다. 기존 학교 전체 조회와 개인 데이터 비공개 경계를 유지한다. 임의 신규 보상 경제·콘텐츠 교체·실제 사용자 변경·운영 배포를 추가하지 않는다.

다음 단계는 사용자가 이 written spec을 검토·승인하는 것이다. 승인 후 writing-plans로 파일·인터페이스·테스트·커밋별 구현 계획을 작성하고, 계획 승인과 이미 선택한 SDD 실행 방법에 따라 task별 새 구현자·독립 spec/quality 검토·전체 branch review를 수행한다. 구현 단계에는 controller가 제품 코드나 reviewer 수정을 직접 수행하지 않는다.
