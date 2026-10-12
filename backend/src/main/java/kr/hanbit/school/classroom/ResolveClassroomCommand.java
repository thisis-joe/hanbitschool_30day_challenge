package kr.hanbit.school.classroom;

import jakarta.validation.constraints.*;
import java.util.UUID;

public record ResolveClassroomCommand(
    @NotNull UUID schoolId,
    @NotBlank String gradeLabel,
    @Min(1) @Max(99) int classNumber,
    @NotBlank String classCode) {}
