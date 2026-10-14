package kr.hanbit.school.staff.learning;
import java.util.UUID;
public record TeacherStudentRow(UUID accountId, int studentNumber, String name, String characterId,
    String status, int answered, int correct, int wrong, int timedOut, int reviewedWrong,
    int pendingWrong, int passedDayCount, Double accuracy) {}
