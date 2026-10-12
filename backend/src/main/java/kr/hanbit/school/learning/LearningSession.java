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
@Table(name = "learning_sessions")
public class LearningSession {
  @Id
  @Column(name = "id", nullable = false)
  private UUID id;

  @Column(name = "student_account_id", nullable = false)
  private UUID studentAccountId;

  @Column(name = "version", nullable = false, length = 100)
  private String version;

  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.VARCHAR)
  @Column(name = "mode", nullable = false, length = 10)
  private LearningMode mode;

  @Column(name = "day")
  private Integer day;

  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.VARCHAR)
  @Column(name = "state", nullable = false, length = 20)
  private LearningSessionState state;

  @Column(name = "current_position", nullable = false)
  private int currentPosition;

  @Column(name = "deadline_at", nullable = false)
  private Instant deadlineAt;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "last_result_json", columnDefinition = "jsonb")
  private String lastResultJson;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  protected LearningSession() {}

  public LearningSession(
      UUID id,
      UUID studentAccountId,
      String version,
      LearningMode mode,
      Integer day,
      LearningSessionState state,
      int currentPosition,
      Instant deadlineAt,
      String lastResultJson,
      Instant createdAt,
      Instant updatedAt) {
    this.id = id;
    this.studentAccountId = studentAccountId;
    this.version = version;
    this.mode = mode;
    this.day = day;
    this.state = state;
    this.currentPosition = currentPosition;
    this.deadlineAt = LearningTime.persistable(deadlineAt);
    this.lastResultJson = lastResultJson;
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

  public LearningMode getMode() {
    return mode;
  }

  public Integer getDay() {
    return day;
  }

  public LearningSessionState getState() {
    return state;
  }

  public int getCurrentPosition() {
    return currentPosition;
  }

  public Instant getDeadlineAt() {
    return deadlineAt;
  }

  public String getLastResultJson() {
    return lastResultJson;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }
}
