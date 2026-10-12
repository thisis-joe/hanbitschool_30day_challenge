package kr.hanbit.school.learning;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "review_queue_entries")
public class ReviewQueueEntry {
  @EmbeddedId private ReviewQueueEntryId id;

  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.VARCHAR)
  @Column(name = "reason", nullable = false, length = 30)
  private ReviewQueueReason reason;

  @Column(name = "active", nullable = false)
  private boolean active;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  @Column(name = "released_at")
  private Instant releasedAt;

  protected ReviewQueueEntry() {}

  public ReviewQueueEntry(
      UUID studentAccountId,
      String version,
      int questionId,
      ReviewQueueReason reason,
      boolean active,
      Instant createdAt,
      Instant releasedAt) {
    this.id = new ReviewQueueEntryId(studentAccountId, version, questionId);
    this.reason = reason;
    this.active = active;
    this.createdAt = LearningTime.persistable(createdAt);
    this.releasedAt = releasedAt == null ? null : LearningTime.persistable(releasedAt);
  }

  public void releaseAuto(Instant at) {
    if (active && reason == ReviewQueueReason.AUTO_FIRST_WRONG) {
      active = false;
      releasedAt = LearningTime.persistable(at);
    }
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

  public ReviewQueueReason getReason() {
    return reason;
  }

  public boolean isActive() {
    return active;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getReleasedAt() {
    return releasedAt;
  }
}
