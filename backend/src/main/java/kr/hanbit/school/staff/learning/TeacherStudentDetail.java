package kr.hanbit.school.staff.learning;
import java.util.List;
import java.util.UUID;
public record TeacherStudentDetail(TeacherStudentRow student, List<TeacherDayRow> days,
    PageResult<TeacherAnswerRow> answers, UUID previousStudentId, UUID nextStudentId,
    int ordinal, int totalStudents, Distinction facts, Distinction interpretations) {
  public TeacherStudentDetail { days = List.copyOf(days); }
}
