package kr.hanbit.school.security;

public record AccountPrincipal(
    java.util.UUID accountId,
    java.util.UUID schoolId,
    kr.hanbit.school.account.Role role,
    int passwordVersion)
    implements java.io.Serializable {}
