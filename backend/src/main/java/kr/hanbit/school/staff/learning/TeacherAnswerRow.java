package kr.hanbit.school.staff.learning;
import java.time.Instant;
public record TeacherAnswerRow(int questionId, int dayNumber, int position, String text,
    String correctChoice, String firstChoice, TeacherAnswerState outcome,
    Instant firstAnsweredAt, boolean reviewedWrong) {}
