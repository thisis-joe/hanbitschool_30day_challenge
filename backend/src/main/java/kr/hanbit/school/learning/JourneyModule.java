package kr.hanbit.school.learning;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import kr.hanbit.school.content.ContentCatalog;
import kr.hanbit.school.game.GameCatalog;
import kr.hanbit.school.security.AccountPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class JourneyModule {
  private final StudentLearningAccess access;
  private final LearningSessionModule sessions;
  private final ContentCatalog content;
  private final GameCatalog catalog;
  private final DayProgressRepository progress;
  private final FirstAnswerRepository firstAnswers;

  public JourneyModule(
      StudentLearningAccess access,
      LearningSessionModule sessions,
      ContentCatalog content,
      GameCatalog catalog,
      DayProgressRepository progress,
      FirstAnswerRepository firstAnswers) {
    this.access = access;
    this.sessions = sessions;
    this.content = content;
    this.catalog = catalog;
    this.progress = progress;
    this.firstAnswers = firstAnswers;
  }

  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public JourneyView view(AccountPrincipal principal) {
    var student = access.requireStudent(principal);
    var status = sessions.status(principal);
    String version = status.contentVersion();
    var daysByNumber = new HashMap<Integer, DayProgress>();
    for (var day :
        progress.findByStudentAccountIdAndVersionAndDayLessThanEqualOrderByDayAsc(
            student.studentAccountId(), version, 30)) daysByNumber.put(day.getDay(), day);
    var answersByQuestion = new HashMap<Integer, FirstAnswer>();
    for (var answer :
        firstAnswers.findByStudentAccountIdAndVersionOrderByQuestionIdAsc(
            student.studentAccountId(), version)) answersByQuestion.put(answer.getQuestionId(), answer);

    var days = new ArrayList<JourneyDay>();
    var questions = new ArrayList<JourneyQuestion>();
    for (int dayNumber = 1; dayNumber <= 30; dayNumber++) {
      int answeredCount = 0;
      for (var question : content.questionsForDay(version, dayNumber)) {
        var answer = answersByQuestion.get(question.getQuestionId());
        if (answer != null) answeredCount++;
        questions.add(
            new JourneyQuestion(
                question.getQuestionId(),
                dayNumber,
                question.getPosition(),
                answer == null ? "UNANSWERED" : answer.getOutcome().name()));
      }
      var row = daysByNumber.get(dayNumber);
      var state = row == null ? DayProgressState.NOT_STARTED : row.getState();
      boolean passed = state == DayProgressState.PASSED;
      String availability =
          passed
              ? "PASSED"
              : dayNumber > status.calendarCap()
                  ? "LOCKED_DATE"
                  : java.util.Objects.equals(dayNumber, status.earliestUnpassedDay())
                      ? "AVAILABLE"
                      : "LOCKED_PREVIOUS";
      days.add(
          new JourneyDay(
              dayNumber,
              state,
              availability,
              answeredCount,
              row == null ? null : row.getPassedAt(),
              catalog.rewardForDay(dayNumber).itemId(),
              passed));
    }
    return new JourneyView(
        version,
        status.calendarCap(),
        status.nextAction(),
        status.activeSession() == null ? null : status.activeSession().sessionId(),
        status.firstAnswerCount(),
        status.firstAnswerCount(),
        days.stream().allMatch(JourneyDay::rewardOwned),
        List.copyOf(days),
        List.copyOf(questions));
  }
}
