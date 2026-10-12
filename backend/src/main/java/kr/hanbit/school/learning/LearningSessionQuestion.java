package kr.hanbit.school.learning;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;

@Entity
@Table(name = "learning_session_questions")
public class LearningSessionQuestion {
  @EmbeddedId private LearningSessionQuestionId id;

  @Column(name = "version", nullable = false, length = 100)
  private String version;

  @Column(name = "question_id", nullable = false)
  private int questionId;

  protected LearningSessionQuestion() {}

  public LearningSessionQuestion(UUID sessionId, int position, String version, int questionId) {
    this.id = new LearningSessionQuestionId(sessionId, position);
    this.version = version;
    this.questionId = questionId;
  }

  public UUID getSessionId() {
    return id.getSessionId();
  }

  public int getPosition() {
    return id.getPosition();
  }

  public String getVersion() {
    return version;
  }

  public int getQuestionId() {
    return questionId;
  }
}
