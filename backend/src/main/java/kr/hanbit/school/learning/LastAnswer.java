package kr.hanbit.school.learning;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import kr.hanbit.school.content.AnswerChoice;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "last_answers")
public class LastAnswer {
  @EmbeddedId private LastAnswerId id;

  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.VARCHAR)
  @Column(name = "source_type", nullable = false, length = 10)
  private AnswerSourceType sourceType;

  @Column(name = "source_id", nullable = false)
  private UUID sourceId;

  @Enumerated(EnumType.STRING)
  @Column(name = "choice", length = 1)
  private AnswerChoice choice;

  @Column(name = "timed_out", nullable = false)
  private boolean timedOut;

  @Column(name = "correct", nullable = false)
  private boolean correct;

  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.VARCHAR)
  @Column(name = "outcome", nullable = false, length = 10)
  private AnswerOutcome outcome;

  @Column(name = "answered_at", nullable = false)
  private Instant answeredAt;

  protected LastAnswer() {}

  public LastAnswer(
      UUID studentAccountId,
      String version,
      int questionId,
      AnswerSourceType sourceType,
      UUID sourceId,
      AnswerChoice choice,
      boolean timedOut,
      boolean correct,
      AnswerOutcome outcome,
      Instant answeredAt) {
    this.id = new LastAnswerId(studentAccountId, version, questionId);
    update(sourceType, sourceId, choice, timedOut, correct, outcome, answeredAt);
  }

  public void update(
      AnswerSourceType sourceType,
      UUID sourceId,
      AnswerChoice choice,
      boolean timedOut,
      boolean correct,
      AnswerOutcome outcome,
      Instant answeredAt) {
    this.sourceType = sourceType;
    this.sourceId = sourceId;
    this.choice = choice;
    this.timedOut = timedOut;
    this.correct = correct;
    this.outcome = outcome;
    this.answeredAt = LearningTime.persistable(answeredAt);
  }

  public UUID getStudentAccountId() {
    return id.getStudentAccountId();
  }

  public String getVersion() {
    return id.getVersion();
  }

  public int getQuestionId() {
    return id.getQuestionId();
  }

  public AnswerSourceType getSourceType() {
    return sourceType;
  }

  public UUID getSourceId() {
    return sourceId;
  }

  public AnswerChoice getChoice() {
    return choice;
  }

  public boolean isTimedOut() {
    return timedOut;
  }

  public boolean isCorrect() {
    return correct;
  }

  public AnswerOutcome getOutcome() {
    return outcome;
  }

  public Instant getAnsweredAt() {
    return answeredAt;
  }
}
