package kr.hanbit.school.learning;

import java.time.Instant;

public record QuestionPrompt(
    int questionId,
    int dayNumber,
    int position,
    String text,
    int timeLimitSeconds,
    Instant deadlineAt) {}
