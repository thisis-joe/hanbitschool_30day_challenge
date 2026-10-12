package kr.hanbit.school.content;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.List;

public record HanbitContentDocument(List<DayEntry> days) {
  @JsonCreator(mode = JsonCreator.Mode.DELEGATING)
  public HanbitContentDocument {
    days = days == null ? List.of() : List.copyOf(days);
  }

  @Override
  @JsonValue
  public List<DayEntry> days() {
    return days;
  }

  public record DayEntry(int day, String title, List<QuestionEntry> questions) {
    public DayEntry {
      questions = questions == null ? List.of() : List.copyOf(questions);
    }
  }

  public record QuestionEntry(
      int id, String text, AnswerChoice answer, String explanation) {}
}
