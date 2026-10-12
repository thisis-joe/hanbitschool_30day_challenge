package kr.hanbit.school.learning;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "day_attempts")
public class DayAttempt {
  @Id
  @Column(name = "id", nullable = false)
  private UUID id;

  @Column(name = "session_id", nullable = false)
  private UUID sessionId;

  @Column(name = "day_progress_id", nullable = false)
  private UUID dayProgressId;

  @Column(name = "student_account_id", nullable = false)
  private UUID studentAccountId;

  @Column(name = "version", nullable = false, length = 100)
  private String version;

  @Column(name = "day", nullable = false)
  private int day;

  @Column(name = "attempt_number", nullable = false)
  private int attemptNumber;

  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.VARCHAR)
  @Column(name = "state", nullable = false, length = 20)
  private DayAttemptState state;

  @Column(name = "answered_count", nullable = false)
  private int answeredCount;

  @Column(name = "correct_count", nullable = false)
  private int correctCount;

  @Column(name = "current_streak", nullable = false)
  private int currentStreak;

  @Column(name = "catch_up", nullable = false)
  private boolean catchUp;

  @Column(name = "started_at", nullable = false)
  private Instant startedAt;

  @Column(name = "finished_at")
  private Instant finishedAt;

  protected DayAttempt() {}

  public DayAttempt(
      UUID id,
      UUID sessionId,
      UUID dayProgressId,
      UUID studentAccountId,
      String version,
      int day,
      int attemptNumber,
      DayAttemptState state,
      int answeredCount,
      int correctCount,
      int currentStreak,
      boolean catchUp,
      Instant startedAt,
      Instant finishedAt) {
    this.id = id;
    this.sessionId = sessionId;
    this.dayProgressId = dayProgressId;
    this.studentAccountId = studentAccountId;
    this.version = version;
    this.day = day;
    this.attemptNumber = attemptNumber;
    this.state = state;
    this.answeredCount = answeredCount;
    this.correctCount = correctCount;
    this.currentStreak = currentStreak;
    this.catchUp = catchUp;
    this.startedAt = LearningTime.persistable(startedAt);
    this.finishedAt = finishedAt == null ? null : LearningTime.persistable(finishedAt);
  }

  public UUID getId() {
    return id;
  }

  public UUID getSessionId() {
    return sessionId;
  }

  public UUID getDayProgressId() {
    return dayProgressId;
  }

  public UUID getStudentAccountId() {
    return studentAccountId;
  }

  public String getVersion() {
    return version;
  }

  public int getDay() {
    return day;
  }

  public int getAttemptNumber() {
    return attemptNumber;
  }

  public DayAttemptState getState() {
    return state;
  }

  public int getAnsweredCount() {
    return answeredCount;
  }

  public int getCorrectCount() {
    return correctCount;
  }

  public int getCurrentStreak() {
    return currentStreak;
  }

  public boolean isCatchUp() {
    return catchUp;
  }

  public Instant getStartedAt() {
    return startedAt;
  }

  public Instant getFinishedAt() {
    return finishedAt;
  }

  void recordAnswer(boolean correct, Instant answeredAt) {
    if (state != DayAttemptState.ACTIVE || answeredCount >= 5)
      throw new IllegalStateException("진행 중인 회차 시도에만 답변을 추가할 수 있습니다.");
    answeredCount++;
    if (correct) correctCount++;
    currentStreak = correct ? currentStreak + 1 : 0;
    if (answeredCount == 5) {
      state = correctCount >= 3 ? DayAttemptState.PASSED : DayAttemptState.RETRY_REQUIRED;
      finishedAt = LearningTime.persistable(answeredAt);
    }
  }
}
