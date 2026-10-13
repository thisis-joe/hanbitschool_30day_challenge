package kr.hanbit.school.staff.learning;
import java.util.UUID;
public record TeacherRespondent(UUID accountId, int studentNumber, String name,
    String firstChoice, TeacherAnswerState outcome) {}
