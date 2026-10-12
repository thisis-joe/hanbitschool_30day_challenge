package kr.hanbit.school.learning;

import java.util.UUID;

public record LearningSessionView(
    UUID sessionId,
    String contentVersion,
    LearningMode mode,
    Integer dayNumber,
    LearningSessionState state,
    int answeredCount,
    int questionCount,
    QuestionPrompt question,
    AnswerResult lastAnswer) {}
