package kr.hanbit.school.staff.learning;
import java.util.*;
import java.util.stream.Collectors;
import kr.hanbit.school.learning.*;
import org.springframework.stereotype.Component;

@Component
public class TeacherLearningAggregator {
  public TeacherLearningSummary summarize(TeacherLearningFacts facts) {
    var students = students(facts);
    var questions = questions(facts);
    int answered = questions.stream().mapToInt(TeacherQuestionRow::answered).sum();
    int correct = questions.stream().mapToInt(TeacherQuestionRow::correct).sum();
    int choiceWrong = questions.stream().mapToInt(TeacherQuestionRow::choiceWrong).sum();
    int timedOut = questions.stream().mapToInt(TeacherQuestionRow::timedOut).sum();
    int wrong = choiceWrong + timedOut;
    int reviewedWrong = students.stream().mapToInt(TeacherStudentRow::reviewedWrong).sum();
    var hard = questions.stream()
        .filter(q -> q.answered() >= Math.min(3, students.size()) && q.wrong() > 0)
        .sorted(Comparator.comparing(TeacherQuestionRow::wrongRate, Comparator.reverseOrder())
            .thenComparing(TeacherQuestionRow::answered, Comparator.reverseOrder())
            .thenComparingInt(TeacherQuestionRow::questionId))
        .limit(3).toList();
    return new TeacherLearningSummary(students.size(),
        (int) students.stream().filter(s -> s.answered() > 0).count(),
        (int) students.stream().filter(s -> s.status().equals("COMPLETE")).count(),
        answered, correct, choiceWrong, timedOut, wrong, reviewedWrong, wrong - reviewedWrong,
        questions.stream().mapToInt(TeacherQuestionRow::unanswered).sum(), ratio(correct, answered),
        distinction(questions, "O"), distinction(questions, "X"), hard);
  }

  public List<TeacherStudentRow> students(TeacherLearningFacts facts) {
    var valid = firstAnswers(facts);
    var byStudent = valid.stream().collect(Collectors.groupingBy(FirstAnswer::getStudentAccountId));
    var mastered = facts.masteries().stream()
        .map(m -> new QuestionKey(m.getStudentAccountId(), m.getVersion(), m.getQuestionId()))
        .collect(Collectors.toSet());
    var versions = facts.questions().stream().map(q -> q.getVersion()).collect(Collectors.toSet());
    var passed = facts.progress().stream().filter(p -> p.getState() == DayProgressState.PASSED
        && versions.contains(p.getVersion()))
        .collect(Collectors.groupingBy(DayProgress::getStudentAccountId,
            Collectors.mapping(DayProgress::getDay, Collectors.toSet())));
    return facts.students().stream().map(student -> {
      var answers = byStudent.getOrDefault(student.accountId(), List.of());
      int answered = answers.size();
      int correct = (int) answers.stream().filter(FirstAnswer::isCorrect).count();
      int timeout = (int) answers.stream().filter(FirstAnswer::isTimedOut).count();
      int wrong = answered - correct;
      int reviewed = (int) answers.stream().filter(a -> !a.isCorrect()
          && mastered.contains(new QuestionKey(a.getStudentAccountId(), a.getVersion(), a.getQuestionId()))).count();
      int passedCount = passed.getOrDefault(student.accountId(), Set.of()).size();
      String status = answered == 0 ? "NEW" : passedCount == 30 ? "COMPLETE" : "IN_PROGRESS";
      return new TeacherStudentRow(student.accountId(), student.studentNumber(), student.name(),
          student.characterId(), status, answered, correct, wrong, timeout, reviewed, wrong - reviewed,
          passedCount, ratio(correct, answered));
    }).sorted(Comparator.comparingInt(TeacherStudentRow::studentNumber)
        .thenComparing(s -> s.accountId().toString())).toList();
  }

  public List<TeacherQuestionRow> questions(TeacherLearningFacts facts) {
    var byQuestion = firstAnswers(facts).stream().collect(Collectors.groupingBy(FirstAnswer::getQuestionId));
    return facts.questions().stream().map(question -> {
      var answers = byQuestion.getOrDefault(question.getQuestionId(), List.of());
      int answered = answers.size();
      int correct = (int) answers.stream().filter(FirstAnswer::isCorrect).count();
      int timeout = (int) answers.stream().filter(FirstAnswer::isTimedOut).count();
      int wrong = answered - correct;
      return new TeacherQuestionRow(question.getQuestionId(), question.getDay(), question.getText(),
          question.getAnswer().name(), answered, correct, wrong - timeout, timeout, wrong,
          facts.students().size() - answered, ratio(wrong, answered));
    }).sorted(Comparator.comparingInt(TeacherQuestionRow::questionId)).toList();
  }

  public List<TeacherAnswerRow> answers(TeacherLearningFacts facts, UUID studentId) {
    var first = firstAnswers(facts).stream().filter(a -> a.getStudentAccountId().equals(studentId))
        .collect(Collectors.toMap(FirstAnswer::getQuestionId, a -> a));
    var mastered = facts.masteries().stream().filter(m -> m.getStudentAccountId().equals(studentId))
        .map(m -> new QuestionKey(studentId, m.getVersion(), m.getQuestionId())).collect(Collectors.toSet());
    return facts.questions().stream().map(q -> {
      var answer = first.get(q.getQuestionId());
      return new TeacherAnswerRow(q.getQuestionId(), q.getDay(), q.getPosition(), q.getText(),
          q.getAnswer().name(), choice(answer), outcome(answer),
          answer == null ? null : answer.getAnsweredAt(),
          answer != null && !answer.isCorrect()
              && mastered.contains(new QuestionKey(studentId, q.getVersion(), q.getQuestionId())));
    }).sorted(Comparator.comparingInt(TeacherAnswerRow::questionId)).toList();
  }

  public List<TeacherDayRow> days(TeacherLearningFacts facts, UUID studentId,
      List<TeacherAnswerRow> answers) {
    var versions = facts.questions().stream().map(q -> q.getVersion()).collect(Collectors.toSet());
    var progress = facts.progress().stream().filter(p -> p.getStudentAccountId().equals(studentId)
        && versions.contains(p.getVersion())).collect(Collectors.toMap(DayProgress::getDay, p -> p));
    var byDay = answers.stream().filter(a -> a.outcome() != TeacherAnswerState.UNANSWERED)
        .collect(Collectors.groupingBy(TeacherAnswerRow::dayNumber));
    var rows = new ArrayList<TeacherDayRow>();
    for (int day = 1; day <= 30; day++) {
      var first = byDay.getOrDefault(day, List.of());
      var actual = progress.get(day);
      rows.add(new TeacherDayRow(day, actual == null ? "NOT_STARTED" : actual.getState().name(),
          first.size(), (int) first.stream().filter(a -> a.outcome() == TeacherAnswerState.CORRECT).count(),
          (int) first.stream().filter(a -> a.outcome() == TeacherAnswerState.TIMED_OUT).count(),
          actual == null ? null : actual.getPassedAt()));
    }
    return List.copyOf(rows);
  }

  public Distinction distinctionForAnswers(List<TeacherAnswerRow> answers, String correctChoice) {
    var selected = answers.stream().filter(a -> a.correctChoice().equals(correctChoice)
        && a.outcome() != TeacherAnswerState.UNANSWERED).toList();
    int correct = (int) selected.stream().filter(a -> a.outcome() == TeacherAnswerState.CORRECT).count();
    return new Distinction(selected.size(), correct, ratio(correct, selected.size()));
  }

  public TeacherQuestionDetail question(TeacherLearningFacts facts, int questionId) {
    var canonical = facts.questions().stream().filter(q -> q.getQuestionId() == questionId).findFirst()
        .orElseThrow(() -> new kr.hanbit.school.shared.web.ApiException(404, "NOT_FOUND", "문항을 찾을 수 없습니다."));
    var row = questions(facts).stream().filter(q -> q.questionId() == questionId).findFirst().orElseThrow();
    var answers = firstAnswers(facts).stream().filter(a -> a.getQuestionId() == questionId)
        .collect(Collectors.toMap(FirstAnswer::getStudentAccountId, a -> a));
    var respondents = facts.students().stream().filter(s -> answers.containsKey(s.accountId()))
        .sorted(Comparator.comparingInt(TeacherLearningFacts.Student::studentNumber)
            .thenComparing(s -> s.accountId().toString()))
        .map(s -> new TeacherRespondent(s.accountId(), s.studentNumber(), s.name(),
            choice(answers.get(s.accountId())), outcome(answers.get(s.accountId())))).toList();
    return new TeacherQuestionDetail(row, canonical.getExplanation(),
        respondents.stream().filter(r -> r.outcome() == TeacherAnswerState.CORRECT).toList(),
        respondents.stream().filter(r -> r.outcome() != TeacherAnswerState.CORRECT).toList(), row.unanswered());
  }

  private TeacherAnswerState outcome(FirstAnswer answer) {
    if (answer == null) return TeacherAnswerState.UNANSWERED;
    if (answer.isTimedOut()) return TeacherAnswerState.TIMED_OUT;
    return answer.isCorrect() ? TeacherAnswerState.CORRECT : TeacherAnswerState.WRONG;
  }

  private String choice(FirstAnswer answer) {
    return answer == null || answer.getChoice() == null ? null : answer.getChoice().name();
  }

  private List<FirstAnswer> firstAnswers(TeacherLearningFacts facts) {
    var students = facts.students().stream().map(TeacherLearningFacts.Student::accountId).collect(Collectors.toSet());
    var questions = facts.questions().stream().collect(Collectors.toMap(q -> q.getQuestionId(), q -> q.getVersion()));
    return facts.firstAnswers().stream().filter(a -> students.contains(a.getStudentAccountId())
        && a.getVersion().equals(questions.get(a.getQuestionId()))).toList();
  }

  private Distinction distinction(List<TeacherQuestionRow> questions, String choice) {
    int answered = questions.stream().filter(q -> q.correctChoice().equals(choice)).mapToInt(TeacherQuestionRow::answered).sum();
    int correct = questions.stream().filter(q -> q.correctChoice().equals(choice)).mapToInt(TeacherQuestionRow::correct).sum();
    return new Distinction(answered, correct, ratio(correct, answered));
  }

  private Double ratio(int numerator, int denominator) {
    return denominator == 0 ? null : (double) numerator / denominator;
  }

  private record QuestionKey(UUID studentId, String version, int questionId) {}
}
