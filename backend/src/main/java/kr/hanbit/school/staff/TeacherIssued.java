package kr.hanbit.school.staff;

import java.util.UUID;

public record TeacherIssued(
    UUID accountId, String staffLoginId, String name, String initialPassword) {}
