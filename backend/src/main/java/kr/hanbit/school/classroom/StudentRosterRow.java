package kr.hanbit.school.classroom;

import java.util.UUID;

public record StudentRosterRow(
    UUID accountId, String gradeLabel, int classNumber, int studentNumber, String name) {}
