package kr.hanbit.school.account;

public record StaffMe(
    java.util.UUID accountId,
    Role role,
    java.util.UUID schoolId,
    String schoolName,
    String name,
    String staffLoginId,
    boolean mustChangePassword)
    implements AccountMe {}
