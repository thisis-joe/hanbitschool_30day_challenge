package kr.hanbit.school.learning;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import kr.hanbit.school.content.AnswerChoice;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Immutable
@Table(name = "review_attempts")
public class ReviewAttempt {
  @Id
  @Column(name = "id", nullable = false, updatable = false)
  private UUID id;

  @Column(name = "student_account_id", nullable = false, updatable = false)
  private UUID studentAccountId;

  @Column(name = "version", nullable = false, length = 100, updatable = false)
  private String version;

  @Column(name = "question_id", nullable = false, updatable = false)
  private int questionId;

  @Column(name = "session_id", nullable = false, updatable = false)
  private UUID sessionId;

  @Column(name = "day_attempt_id", updatable = false)
  private UUID dayAttemptId;

  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.VARCHAR)
  @Column(name = "mode", nullable = false, length = 10, updatable = false)
  private LearningMode mode;

  @Column(name = "request_id", nullable = false, updatable = false)
  private UUID requestId;

  @Enumerated(EnumType.STRING)
  @Column(name = "choice", length = 1, updatable = false)
  private AnswerChoice choice;

  @Column(name = "timed_out", nullable = false, updatable = false)
  private boolean timedOut;

  @Column(name = "correct", nullable = false, updatable = false)
  private boolean correct;

  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.VARCHAR)
  @Column(name = "outcome", nullable = false, length = 10, updatable = false)
  private AnswerOutcome outcome;

  @Column(name = "answered_at", nullable = false, updatable = false)
  private Instant answeredAt;

  @Column(name = "response_millis", nullable = false, updatable = false)
  private long responseMillis;

  protected ReviewAttempt() {}

  public ReviewAttempt(
      UUID id,
      UUID studentAccountId,
      String version,
      int questionId,
      UUID sessionId,
      UUID dayAttemptId,
      LearningMode mode,
      UUID requestId,
      AnswerChoice choice,
      boolean timedOut,
      boolean correct,
      AnswerOutcome outcome,
      Instant answeredAt,
      long responseMillis) {
    this.id = id;
    this.studentAccountId = studentAccountId;
    this.version = version;
    this.questionId = questionId;
    this.sessionId = sessionId;
    this.dayAttemptId = dayAttemptId;
    this.mode = mode;
    this.requestId = requestId;
    this.choice = choice;
    this.timedOut = timedOut;
    this.correct = correct;
    this.outcome = outcome;
    this.answeredAt = LearningTime.persistable(answeredAt);
    this.responseMillis = responseMillis;
  }

  public UUID getId() {
    return id;
  }

  public UUID getStudentAccountId() {
    return studentAccountId;
  }

  public String getVersion() {
    return version;
  }

  public int getQuestionId() {
    return questionId;
  }

  public UUID getSessionId() {
    return sessionId;
  }

  public UUID getDayAttemptId() {
    return dayAttemptId;
  }

  public LearningMode getMode() {
    return mode;
  }

  public UUID getRequestId() {
    return requestId;
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

  public long getResponseMillis() {
    return responseMillis;
  }
}
