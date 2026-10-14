package kr.hanbit.school.staff.learning;
import java.util.List;
public record TeacherLearningSummary(int studentCount, int participatingCount, int completeCount,
    int answered, int correct, int choiceWrong, int timedOut, int wrong, int reviewedWrong,
    int pendingWrong, int unanswered, Double accuracy, Distinction facts, Distinction interpretations,
    List<TeacherQuestionRow> hardQuestions) {
  public TeacherLearningSummary { hardQuestions = List.copyOf(hardQuestions); }
}
