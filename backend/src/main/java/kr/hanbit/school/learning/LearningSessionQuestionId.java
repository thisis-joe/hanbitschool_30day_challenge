package kr.hanbit.school.learning;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Embeddable
public class LearningSessionQuestionId implements Serializable {
  @Column(name = "session_id", nullable = false)
  private UUID sessionId;

  @Column(name = "position", nullable = false)
  private int position;

  protected LearningSessionQuestionId() {}

  public LearningSessionQuestionId(UUID sessionId, int position) {
    this.sessionId = sessionId;
    this.position = position;
  }

  public UUID getSessionId() {
    return sessionId;
  }

  public int getPosition() {
    return position;
  }

  @Override
  public boolean equals(Object other) {
    if (this == other) return true;
    if (!(other instanceof LearningSessionQuestionId that)) return false;
    return position == that.position && Objects.equals(sessionId, that.sessionId);
  }

  @Override
  public int hashCode() {
    return Objects.hash(sessionId, position);
  }
}
