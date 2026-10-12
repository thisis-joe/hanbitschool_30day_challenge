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
@Table(name = "day_progress")
public class DayProgress {
  @Id
  @Column(name = "id", nullable = false)
  private UUID id;

  @Column(name = "student_account_id", nullable = false)
  private UUID studentAccountId;

  @Column(name = "version", nullable = false, length = 100)
  private String version;

  @Column(name = "day", nullable = false)
  private int day;

  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.VARCHAR)
  @Column(name = "state", nullable = false, length = 20)
  private DayProgressState state;

  @Column(name = "passed_at")
  private Instant passedAt;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  protected DayProgress() {}

  public DayProgress(
      UUID id,
      UUID studentAccountId,
      String version,
      int day,
      DayProgressState state,
      Instant passedAt,
      Instant createdAt,
      Instant updatedAt) {
    this.id = id;
    this.studentAccountId = studentAccountId;
    this.version = version;
    this.day = day;
    this.state = state;
    this.passedAt = passedAt == null ? null : LearningTime.persistable(passedAt);
    this.createdAt = LearningTime.persistable(createdAt);
    this.updatedAt = LearningTime.persistable(updatedAt);
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

  public int getDay() {
    return day;
  }

  public DayProgressState getState() {
    return state;
  }

  public Instant getPassedAt() {
    return passedAt;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }

  void startFirst(Instant startedAt) {
    if (state != DayProgressState.NOT_STARTED)
      throw new IllegalStateException("미시작 회차만 첫 학습을 시작할 수 있습니다.");
    state = DayProgressState.IN_PROGRESS;
    updatedAt = LearningTime.persistable(startedAt);
  }

  void finishFirst(boolean passed, Instant finishedAt) {
    if (state != DayProgressState.IN_PROGRESS)
      throw new IllegalStateException("진행 중인 회차만 첫 학습을 종료할 수 있습니다.");
    state = passed ? DayProgressState.PASSED : DayProgressState.RETRY_REQUIRED;
    passedAt = passed ? LearningTime.persistable(finishedAt) : null;
    updatedAt = LearningTime.persistable(finishedAt);
  }

  void startReplay(Instant startedAt) {
    if (state == DayProgressState.PASSED) return;
    if (state != DayProgressState.RETRY_REQUIRED)
      throw new IllegalStateException("재도전이 필요한 회차만 다시 시작할 수 있습니다.");
    state = DayProgressState.IN_PROGRESS;
    updatedAt = LearningTime.persistable(startedAt);
  }
}
