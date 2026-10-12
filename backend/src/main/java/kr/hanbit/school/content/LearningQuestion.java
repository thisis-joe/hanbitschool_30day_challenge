package kr.hanbit.school.content;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

@Entity
@Table(name = "questions")
public class LearningQuestion {
  @EmbeddedId private LearningQuestionId id;

  @Column(name = "day", nullable = false)
  private int day;

  @Column(name = "position", nullable = false)
  private int position;

  @Column(name = "text", nullable = false, columnDefinition = "text")
  private String text;

  @Enumerated(EnumType.STRING)
  @Column(name = "answer", nullable = false, length = 1)
  private AnswerChoice answer;

  @Column(name = "explanation", nullable = false, columnDefinition = "text")
  private String explanation;

  @Column(name = "time_limit_seconds", nullable = false)
  private int timeLimitSeconds;

  protected LearningQuestion() {}

  public LearningQuestion(
      String version,
      int questionId,
      int day,
      int position,
      String text,
      AnswerChoice answer,
      String explanation,
      int timeLimitSeconds) {
    this.id = new LearningQuestionId(version, questionId);
    this.day = day;
    this.position = position;
    this.text = text;
    this.answer = answer;
    this.explanation = explanation;
    this.timeLimitSeconds = timeLimitSeconds;
  }

  public String getVersion() {
    return id.getVersion();
  }

  public int getQuestionId() {
    return id.getQuestionId();
  }

  public int getDay() {
    return day;
  }

  public int getPosition() {
    return position;
  }

  public String getText() {
    return text;
  }

  public AnswerChoice getAnswer() {
    return answer;
  }

  public String getExplanation() {
    return explanation;
  }

  public int getTimeLimitSeconds() {
    return timeLimitSeconds;
  }
}
