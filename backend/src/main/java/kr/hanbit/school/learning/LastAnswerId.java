package kr.hanbit.school.learning;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Embeddable
public class LastAnswerId implements Serializable {
  @Column(name = "student_account_id", nullable = false)
  private UUID studentAccountId;

  @Column(name = "version", nullable = false, length = 100)
  private String version;

  @Column(name = "question_id", nullable = false)
  private int questionId;

  protected LastAnswerId() {}

  public LastAnswerId(UUID studentAccountId, String version, int questionId) {
    this.studentAccountId = studentAccountId;
    this.version = version;
    this.questionId = questionId;
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

  @Override
  public boolean equals(Object other) {
    if (this == other) {
      return true;
    }
    if (!(other instanceof LastAnswerId that)) {
      return false;
    }
    return questionId == that.questionId
        && Objects.equals(studentAccountId, that.studentAccountId)
        && Objects.equals(version, that.version);
  }

  @Override
  public int hashCode() {
    return Objects.hash(studentAccountId, version, questionId);
  }
}
