package kr.hanbit.school.staff.learning;
import java.util.List;
public record TeacherQuestionDetail(TeacherQuestionRow question, String explanation,
    List<TeacherRespondent> correct, List<TeacherRespondent> wrong, int unanswered) {
  public TeacherQuestionDetail {
    correct = List.copyOf(correct);
    wrong = List.copyOf(wrong);
  }
}
