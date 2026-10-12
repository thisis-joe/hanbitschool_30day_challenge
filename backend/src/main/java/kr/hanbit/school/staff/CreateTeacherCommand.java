package kr.hanbit.school.staff;

import jakarta.validation.constraints.NotBlank;

public record CreateTeacherCommand(@NotBlank String name, @NotBlank String staffLoginId) {}
