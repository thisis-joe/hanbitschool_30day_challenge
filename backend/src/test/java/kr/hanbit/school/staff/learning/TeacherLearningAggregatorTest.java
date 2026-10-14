package kr.hanbit.school.staff.learning;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.*;
import java.util.stream.IntStream;
import kr.hanbit.school.content.*;
import kr.hanbit.school.learning.*;
import org.junit.jupiter.api.Test;

class TeacherLearningAggregatorTest {
  private final TeacherLearningAggregator aggregate = new TeacherLearningAggregator();
  private final Instant now = Instant.parse("2026-10-12T00:00:00Z");
  private final UUID a = new UUID(0, 1), b = new UUID(0, 2), c = new UUID(0, 3);

  @Test
  void emptyClassAndUnansweredKeepNullRates() {
    var empty = aggregate.summarize(facts(List.of(), List.of(), List.of(), List.of()));
    assertThat(empty.studentCount()).isZero();
    assertThat(empty.answered()).isZero();
    assertThat(empty.unanswered()).isZero();
    assertThat(empty.accuracy()).isNull();
    assertThat(empty.facts().accuracy()).isNull();
    assertThat(empty.interpretations().accuracy()).isNull();
    assertThat(empty.hardQuestions()).isEmpty();
    var untouched = facts(roster(), List.of(), List.of(), List.of());
    assertThat(aggregate.summarize(untouched).unanswered()).isEqualTo(450);
    assertThat(aggregate.students(untouched)).allSatisfy(row -> {
      assertThat(row.status()).isEqualTo("NEW");
      assertThat(row.accuracy()).isNull();
    });
    assertThat(aggregate.questions(untouched)).hasSize(150).allSatisfy(row -> {
      assertThat(row.unanswered()).isEqualTo(3);
      assertThat(row.wrongRate()).isNull();
    });
  }

  @Test
  void reviewCorrectNeverChangesFirstAccuracy() {
    var answers = List.of(first(a, 1, true, false), first(b, 1, false, false),
        first(c, 1, false, true), first(b, 2, false, false));
    var mastered = List.of(new ReviewMastery(b, "hanbit-v1", 1, UUID.randomUUID(), now),
        new ReviewMastery(a, "hanbit-v1", 1, UUID.randomUUID(), now));
    var input = facts(roster(), answers, List.of(), mastered);
    var summary = aggregate.summarize(input);
    assertThat(summary.studentCount()).isEqualTo(3);
    assertThat(summary.participatingCount()).isEqualTo(3);
    assertThat(summary.answered()).isEqualTo(4);
    assertThat(summary.correct()).isEqualTo(1);
    assertThat(summary.choiceWrong()).isEqualTo(2);
    assertThat(summary.timedOut()).isEqualTo(1);
    assertThat(summary.wrong()).isEqualTo(3);
    assertThat(summary.unanswered()).isEqualTo(446);
    assertThat(summary.accuracy()).isEqualTo(0.25);
    assertThat(summary.reviewedWrong()).isEqualTo(1);
    assertThat(summary.pendingWrong()).isEqualTo(2);
    // Question 1 is canonical O, including the wrong X choice and timeout; question 2 is X.
    assertThat(summary.facts()).isEqualTo(new Distinction(3, 1, 1.0 / 3));
    assertThat(summary.interpretations()).isEqualTo(new Distinction(1, 0, 0.0));
    assertThat(summary.hardQuestions()).extracting(TeacherQuestionRow::questionId).containsExactly(1);
    assertThat(summary.hardQuestions().getFirst().wrongRate()).isEqualTo(2.0 / 3);
    assertThat(summary.hardQuestions().getFirst().correctChoice()).isEqualTo("O");
    assertThat(aggregate.summarize(facts(roster(), answers, List.of(), List.of())).accuracy())
        .isEqualTo(summary.accuracy());
    var rows = aggregate.students(input);
    assertThat(rows.get(1).reviewedWrong()).isEqualTo(1);
    assertThat(rows.get(1).pendingWrong()).isEqualTo(1);
    assertThat(rows.get(2).timedOut()).isEqualTo(1);
  }

  @Test
  void hardQuestionThresholdOrderingLimitAndCompletionAreIndependent() {
    var answers = new ArrayList<FirstAnswer>();
    for (int q : List.of(1, 2, 3, 4)) {
      answers.add(first(a, q, false, false));
      answers.add(first(b, q, false, false));
      answers.add(first(c, q, q == 1, false));
    }
    answers.add(first(a, 5, false, false)); // Too few responses for this class.
    var progress = IntStream.rangeClosed(1, 30).mapToObj(day ->
        new DayProgress(UUID.randomUUID(), a, "hanbit-v1", day, DayProgressState.PASSED, now, now, now)).toList();
    var input = facts(roster(), answers, progress, List.of());
    assertThat(aggregate.summarize(input).hardQuestions())
        .extracting(TeacherQuestionRow::questionId).containsExactly(2, 3, 4);
    assertThat(aggregate.summarize(input).completeCount()).isEqualTo(1);
    assertThat(aggregate.students(input).getFirst().status()).isEqualTo("COMPLETE");
    var small = facts(roster().subList(0, 1), List.of(first(a, 1, false, false)), List.of(), List.of());
    assertThat(aggregate.summarize(small).hardQuestions()).hasSize(1);
  }

  @Test
  void otherVersionAndOutsideRosterFactsNeverAffectClass() {
    var oldMastery = new ReviewMastery(a, "old-version", 1, UUID.randomUUID(), now);
    var oldProgress = IntStream.rangeClosed(1, 30).mapToObj(day ->
        new DayProgress(UUID.randomUUID(), a, "old-version", day, DayProgressState.PASSED, now, now, now)).toList();
    var outsiderFirst = first(new UUID(0, 4), 1, true, false);
    var currentFirst = first(a, 1, false, false);
    var staleFirst = new FirstAnswer(UUID.randomUUID(), a, "old-version", 2, UUID.randomUUID(),
        UUID.randomUUID(), UUID.randomUUID(), AnswerChoice.X, false, true, now, 1);
    var input = facts(roster(), List.of(currentFirst, outsiderFirst, staleFirst), oldProgress, List.of(oldMastery));
    var row = aggregate.students(input).getFirst();
    assertThat(row.reviewedWrong()).isZero();
    assertThat(row.pendingWrong()).isEqualTo(1);
    assertThat(row.passedDayCount()).isZero();
    assertThat(row.status()).isEqualTo("IN_PROGRESS");
    assertThat(aggregate.summarize(input).answered()).isEqualTo(1);
    assertThat(aggregate.summarize(input).completeCount()).isZero();
  }

  private List<TeacherLearningFacts.Student> roster() {
    return List.of(new TeacherLearningFacts.Student(a, 1, "가", null),
        new TeacherLearningFacts.Student(b, 2, "나", "bora"),
        new TeacherLearningFacts.Student(c, 3, "다", null));
  }

  private TeacherLearningFacts facts(List<TeacherLearningFacts.Student> students,
      List<FirstAnswer> first, List<DayProgress> progress, List<ReviewMastery> mastery) {
    var questions = IntStream.rangeClosed(1, 150).mapToObj(q -> new LearningQuestion(
        "hanbit-v1", q, (q - 1) / 5 + 1, (q - 1) % 5 + 1, "문항 " + q,
        q % 2 == 1 ? AnswerChoice.O : AnswerChoice.X, "해설", 30)).toList();
    return new TeacherLearningFacts(students, questions, first, progress, mastery);
  }

  private FirstAnswer first(UUID student, int q, boolean correct, boolean timeout) {
    var canonical = q % 2 == 1 ? AnswerChoice.O : AnswerChoice.X;
    var chosen = correct ? canonical : canonical == AnswerChoice.O ? AnswerChoice.X : AnswerChoice.O;
    return new FirstAnswer(UUID.randomUUID(), student, "hanbit-v1", q, UUID.randomUUID(),
        UUID.randomUUID(), UUID.randomUUID(), timeout ? null : chosen, timeout, correct, now, 1);
  }
}
