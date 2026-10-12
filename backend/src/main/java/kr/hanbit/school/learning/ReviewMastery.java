package kr.hanbit.school.learning;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.Immutable;

@Entity
@Immutable
@Table(name = "review_masteries")
public class ReviewMastery {
  @EmbeddedId private ReviewMasteryId id;

  @Column(name = "first_correct_attempt_id", nullable = false, updatable = false)
  private UUID firstCorrectAttemptId;

  @Column(name = "mastered_at", nullable = false, updatable = false)
  private Instant masteredAt;

  protected ReviewMastery() {}

  public ReviewMastery(
      UUID studentAccountId,
      String version,
      int questionId,
      UUID firstCorrectAttemptId,
      Instant masteredAt) {
    this.id = new ReviewMasteryId(studentAccountId, version, questionId);
    this.firstCorrectAttemptId = firstCorrectAttemptId;
    this.masteredAt = LearningTime.persistable(masteredAt);
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

  public UUID getFirstCorrectAttemptId() {
    return firstCorrectAttemptId;
  }

  public Instant getMasteredAt() {
    return masteredAt;
  }
}
