package kr.hanbit.school.classroom;

import java.time.LocalDate;
import java.util.UUID;

public record ClassroomSummary(
    UUID id,
    String gradeLabel,
    int classNumber,
    LocalDate startDate,
    long studentCount,
    boolean canManage,
    String joinCode) {}
