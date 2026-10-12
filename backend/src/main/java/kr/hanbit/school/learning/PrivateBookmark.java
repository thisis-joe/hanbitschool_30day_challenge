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
@Table(name = "private_bookmarks")
public class PrivateBookmark {
  @EmbeddedId private PrivateBookmarkId id;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  protected PrivateBookmark() {}

  public PrivateBookmark(UUID studentAccountId, String version, int questionId, Instant createdAt) {
    this.id = new PrivateBookmarkId(studentAccountId, version, questionId);
    this.createdAt = LearningTime.persistable(createdAt);
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

  public Instant getCreatedAt() {
    return createdAt;
  }
}
