package kr.hanbit.school.account;

public record StaffLoginCommand(
    @jakarta.validation.constraints.NotBlank String staffLoginId,
    @jakarta.validation.constraints.NotNull String password) {}
