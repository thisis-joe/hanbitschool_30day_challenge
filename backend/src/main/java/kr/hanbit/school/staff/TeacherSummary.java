package kr.hanbit.school.staff;

import java.util.UUID;

public record TeacherSummary(
    UUID accountId, String name, String staffLoginId, boolean mustChangePassword) {}
