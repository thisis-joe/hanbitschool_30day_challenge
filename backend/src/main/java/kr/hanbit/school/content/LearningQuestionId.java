package kr.hanbit.school.content;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.io.Serializable;
import java.util.Objects;

@Embeddable
public class LearningQuestionId implements Serializable {
  @Column(name = "version", nullable = false, length = 100)
  private String version;

  @Column(name = "question_id", nullable = false)
  private int questionId;

  protected LearningQuestionId() {}

  public LearningQuestionId(String version, int questionId) {
    this.version = version;
    this.questionId = questionId;
  }

  public String getVersion() {
    return version;
  }

  public int getQuestionId() {
    return questionId;
  }

  @Override
  public boolean equals(Object other) {
    if (this == other) return true;
    if (!(other instanceof LearningQuestionId that)) return false;
    return questionId == that.questionId && Objects.equals(version, that.version);
  }

  @Override
  public int hashCode() {
    return Objects.hash(version, questionId);
  }
}
