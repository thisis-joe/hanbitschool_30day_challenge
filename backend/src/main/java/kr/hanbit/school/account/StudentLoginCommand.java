package kr.hanbit.school.account;

public record StudentLoginCommand(
    @jakarta.validation.constraints.NotNull java.util.UUID schoolId,
    @jakarta.validation.constraints.NotBlank String gradeLabel,
    @jakarta.validation.constraints.Min(1) @jakarta.validation.constraints.Max(99) int classNumber,
    @jakarta.validation.constraints.Min(1) @jakarta.validation.constraints.Max(999)
        int studentNumber,
    @jakarta.validation.constraints.NotNull String password) {}
