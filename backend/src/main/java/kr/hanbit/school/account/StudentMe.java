package kr.hanbit.school.account;

public record StudentMe(
    java.util.UUID accountId,
    Role role,
    java.util.UUID schoolId,
    String schoolName,
    java.util.UUID classroomId,
    String gradeLabel,
    int classNumber,
    int studentNumber,
    String name,
    String nickname)
    implements AccountMe {}
