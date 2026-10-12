package kr.hanbit.school.account;

public record ChangePasswordCommand(
    @jakarta.validation.constraints.NotNull String currentPassword,
    @jakarta.validation.constraints.NotNull String newPassword) {}
