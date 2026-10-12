package kr.hanbit.school.account;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.*;
import java.util.UUID;

@JsonIgnoreProperties(ignoreUnknown = true)
public record StudentRegistrationCommand(
    @NotNull UUID schoolId,
    @NotBlank String gradeLabel,
    @Min(1) @Max(99) int classNumber,
    @Min(1) @Max(999) int studentNumber,
    @NotBlank String name,
    @NotBlank String nickname,
    @NotNull String password,
    @NotBlank String classCode) {}
