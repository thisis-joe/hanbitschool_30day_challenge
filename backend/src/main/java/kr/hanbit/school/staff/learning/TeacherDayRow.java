package kr.hanbit.school.staff.learning;
import java.time.Instant;
public record TeacherDayRow(int dayNumber, String state, int answered, int correct,
    int timedOut, Instant passedAt) {}
