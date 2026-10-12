package kr.hanbit.school.learning;

import java.time.Clock;
import java.util.HashMap;
import java.util.List;
import java.util.UUID;
import kr.hanbit.school.content.ContentCatalog;
import kr.hanbit.school.content.LearningQuestion;
import kr.hanbit.school.learning.xp.XpLedger;
import kr.hanbit.school.security.AccountPrincipal;
import kr.hanbit.school.shared.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service
public class LearningSessionModule {
  private final StudentLearningAccess access;
  private final ContentCatalog content;
  private final LearningCalendar calendar;
  private final LearningSessionRepository sessions;
  private final LearningSessionQuestionRepository sessionQuestions;
  private final DayProgressRepository progress;
  private final DayAttemptRepository attempts;
  private final FirstAnswerRepository firstAnswers;
  private final XpLedger xp;
  private final LearningIdempotency idempotency;
  private final RequestFingerprint fingerprints;
  private final ObjectMapper json;
  private final Clock clock;

  public LearningSessionModule(
      StudentLearningAccess access,
      ContentCatalog content,
      LearningCalendar calendar,
      LearningSessionRepository sessions,
      LearningSessionQuestionRepository sessionQuestions,
      DayProgressRepository progress,
      DayAttemptRepository attempts,
      FirstAnswerRepository firstAnswers,
      XpLedger xp,
      LearningIdempotency idempotency,
      RequestFingerprint fingerprints,
      ObjectMapper json,
      Clock clock) {
    this.access = access;
    this.content = content;
    this.calendar = calendar;
    this.sessions = sessions;
    this.sessionQuestions = sessionQuestions;
    this.progress = progress;
    this.attempts = attempts;
    this.firstAnswers = firstAnswers;
    this.xp = xp;
    this.idempotency = idempotency;
    this.fingerprints = fingerprints;
    this.json = json;
    this.clock = clock;
  }

  @Transactional(readOnly = true)
  public LearningStatus status(AccountPrincipal principal) {
    var student = access.requireStudent(principal);
    String version = content.activeVersion().getVersion();
    int cap = calendar.calendarCap(student.startDate());
    var active = sessions.findActiveByStudentAccountId(student.studentAccountId());
    LearningSessionView activeView = null;
    if (active.isPresent()) activeView = view(active.get(), version);
    Integer earliest = earliestUnpassed(student.studentAccountId(), version, cap);
    int passed =
        Math.toIntExact(
            progress.countByStudentAccountIdAndVersionAndState(
                student.studentAccountId(), version, DayProgressState.PASSED));
    int answered =
        Math.toIntExact(
            firstAnswers.countByStudentAccountIdAndVersion(student.studentAccountId(), version));
    var summary = xp.summary(student.studentAccountId());
    return new LearningStatus(
        version,
        cap,
        earliest,
        passed,
        answered,
        summary.totalXp(),
        summary.level(),
        nextAction(student.studentAccountId(), version, cap, earliest, activeView),
        activeView);
  }

  @Transactional
  public LearningSessionView start(
      AccountPrincipal principal, StartLearningSessionCommand command) {
    var student = access.lockStudent(principal);
    validateFirst(command);
    String version = content.activeVersion().getVersion();
    String payloadHash = fingerprints.start(command);
    var replay =
        idempotency.replay(
            student.studentAccountId(),
            IdempotencyOperation.START_SESSION,
            command.requestId(),
            payloadHash,
            LearningSessionView.class);
    if (replay.isPresent()) {
      requireActiveVersion(replay.get().contentVersion(), version);
      return replay.get();
    }

    var active = sessions.findActiveByStudentAccountId(student.studentAccountId());
    if (active.isPresent()) {
      requireActiveVersion(active.get().getVersion(), version);
      if (sameTarget(active.get(), command)) {
        var resumed = view(active.get(), version);
        idempotency.record(
            student.studentAccountId(),
            IdempotencyOperation.START_SESSION,
            command.requestId(),
            payloadHash,
            resumed);
        return resumed;
      }
      throw conflict();
    }

    int cap = calendar.calendarCap(student.startDate());
    int requestedDay = command.dayNumber();
    if (requestedDay > cap)
      throw new ApiException(403, "DAY_NOT_YET_AVAILABLE", "아직 시작할 수 없는 회차입니다.");
    Integer earliest = earliestUnpassed(student.studentAccountId(), version, cap);
    if (earliest == null || requestedDay < earliest)
      throw ApiException.validation("dayNumber", "FIRST는 가장 앞선 미시작 회차만 시작할 수 있습니다.");
    if (requestedDay > earliest)
      throw new ApiException(409, "PREVIOUS_DAY_NOT_PASSED", "앞선 회차를 먼저 통과해 주세요.");
    var existingProgress =
        progress.findByStudentAccountIdAndVersionAndDay(
            student.studentAccountId(), version, requestedDay);
    if (existingProgress.isPresent()
        && existingProgress.get().getState() != DayProgressState.NOT_STARTED) throw conflict();

    var questions = content.questionsForDay(version, requestedDay);
    if (questions.size() != 5)
      throw new IllegalStateException("회차 학습 문항은 정확히 5개여야 합니다.");
    var now = LearningTime.persistable(clock.instant());
    var progressRow =
        existingProgress.orElseGet(
            () ->
                new DayProgress(
                    UUID.randomUUID(),
                    student.studentAccountId(),
                    version,
                    requestedDay,
                    DayProgressState.NOT_STARTED,
                    null,
                    now,
                    now));
    progressRow.startFirst(now);
    progress.saveAndFlush(progressRow);
    var session =
        sessions.saveAndFlush(
            new LearningSession(
                UUID.randomUUID(),
                student.studentAccountId(),
                version,
                LearningMode.FIRST,
                requestedDay,
                LearningSessionState.QUESTION_ACTIVE,
                1,
                LearningTime.deadline(clock, questions.getFirst().getTimeLimitSeconds()),
                null,
                now,
                now));
    sessionQuestions.saveAllAndFlush(toSessionQuestions(session.getId(), version, questions));
    attempts.saveAndFlush(
        new DayAttempt(
            UUID.randomUUID(),
            session.getId(),
            progressRow.getId(),
            student.studentAccountId(),
            version,
            requestedDay,
            attempts.nextAttemptNumber(student.studentAccountId(), version, requestedDay),
            DayAttemptState.ACTIVE,
            0,
            0,
            0,
            calendar.isCatchUp(requestedDay, cap),
            now,
            null));
    var created = view(session, version);
    idempotency.record(
        student.studentAccountId(),
        IdempotencyOperation.START_SESSION,
        command.requestId(),
        payloadHash,
        created);
    return created;
  }

  @Transactional(readOnly = true)
  public LearningSessionView session(AccountPrincipal principal, UUID sessionId) {
    var student = access.requireStudent(principal);
    var owned =
        sessions
            .findOwned(sessionId, student.studentAccountId())
            .orElseThrow(
                () -> new ApiException(404, "NOT_FOUND", "요청한 항목을 찾을 수 없습니다."));
    return view(owned, content.activeVersion().getVersion());
  }

  private NextLearningAction nextAction(
      UUID studentId,
      String version,
      int cap,
      Integer earliest,
      LearningSessionView active) {
    if (active != null) return NextLearningAction.CONTINUE_SESSION;
    if (cap == 0) return NextLearningAction.WAIT_FOR_START_DATE;
    if (earliest == null)
      return cap == 30
          ? NextLearningAction.COURSE_COMPLETE
          : NextLearningAction.WAIT_FOR_NEXT_DAY;
    var row = progress.findByStudentAccountIdAndVersionAndDay(studentId, version, earliest);
    return row.isPresent() && row.get().getState() == DayProgressState.RETRY_REQUIRED
        ? NextLearningAction.START_REPLAY
        : NextLearningAction.START_FIRST;
  }

  Integer earliestUnpassed(UUID studentId, String version, int cap) {
    if (cap == 0) return null;
    var byDay = new HashMap<Integer, DayProgress>();
    for (var row :
        progress.findByStudentAccountIdAndVersionAndDayLessThanEqualOrderByDayAsc(
            studentId, version, cap)) byDay.put(row.getDay(), row);
    for (int day = 1; day <= cap; day++) {
      var row = byDay.get(day);
      if (row == null || row.getState() != DayProgressState.PASSED) return day;
    }
    return null;
  }

  LearningSessionView view(LearningSession session, String activeVersion) {
    requireActiveVersion(session.getVersion(), activeVersion);
    var questions =
        sessionQuestions.findByIdSessionIdOrderByIdPositionAsc(session.getId());
    for (var row : questions) requireActiveVersion(row.getVersion(), activeVersion);
    int answeredCount =
        attempts.findBySessionId(session.getId()).map(DayAttempt::getAnsweredCount).orElse(0);
    var row =
        questions.stream()
            .filter(candidate -> candidate.getPosition() == session.getCurrentPosition())
            .findFirst()
            .orElseThrow(() -> new IllegalStateException("현재 세션 문항을 찾을 수 없습니다."));
    LearningQuestion question = content.requireQuestion(activeVersion, row.getQuestionId());
    QuestionPrompt prompt =
        new QuestionPrompt(
            question.getQuestionId(),
            question.getDay(),
            row.getPosition(),
            question.getText(),
            question.getTimeLimitSeconds(),
            session.getDeadlineAt());
    return new LearningSessionView(
        session.getId(),
        session.getVersion(),
        session.getMode(),
        session.getDay(),
        session.getState(),
        answeredCount,
        questions.size(),
        prompt,
        session.getState() == LearningSessionState.QUESTION_ACTIVE
            ? null
            : readLastAnswer(session.getLastResultJson()));
  }

  private AnswerResult readLastAnswer(String responseJson) {
    if (responseJson == null) return null;
    return json.readValue(responseJson, AnswerResult.class);
  }

  private List<LearningSessionQuestion> toSessionQuestions(
      UUID sessionId, String version, List<LearningQuestion> questions) {
    return java.util.stream.IntStream.range(0, questions.size())
        .mapToObj(
            index ->
                new LearningSessionQuestion(
                    sessionId, index + 1, version, questions.get(index).getQuestionId()))
        .toList();
  }

  private boolean sameTarget(LearningSession active, StartLearningSessionCommand command) {
    return active.getMode() == command.mode()
        && java.util.Objects.equals(active.getDay(), command.dayNumber());
  }

  private void validateFirst(StartLearningSessionCommand command) {
    if (command == null) throw ApiException.validation("request", "요청 내용을 입력해 주세요.");
    if (command.requestId() == null)
      throw ApiException.validation("requestId", "요청 ID를 입력해 주세요.");
    if (command.mode() != LearningMode.FIRST)
      throw ApiException.validation("mode", "현재는 FIRST 학습만 시작할 수 있습니다.");
    if (command.dayNumber() == null || command.dayNumber() < 1 || command.dayNumber() > 30)
      throw ApiException.validation("dayNumber", "회차는 1에서 30 사이여야 합니다.");
    if (command.questionIds() != null && !command.questionIds().isEmpty())
      throw ApiException.validation("questionIds", "FIRST 학습에는 문항 목록을 지정할 수 없습니다.");
  }

  void requireActiveVersion(String sessionVersion, String activeVersion) {
    if (!java.util.Objects.equals(sessionVersion, activeVersion))
      throw new ApiException(
          409, "CONTENT_VERSION_MISMATCH", "현재 콘텐츠와 세션 콘텐츠가 일치하지 않습니다.");
  }

  private ApiException conflict() {
    return new ApiException(409, "SESSION_CONFLICT", "다른 학습 세션이 진행 중입니다.");
  }
}
