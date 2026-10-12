package kr.hanbit.school.classroom;

import jakarta.validation.constraints.*;
import java.time.LocalDate;

public record CreateClassroomCommand(
    @NotBlank String gradeLabel, @Min(1) @Max(99) int classNumber, @NotNull LocalDate startDate) {}
