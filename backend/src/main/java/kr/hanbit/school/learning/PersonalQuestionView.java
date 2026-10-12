package kr.hanbit.school.learning;

import java.time.Instant;

public record PersonalQuestionView(
    int questionId,
    int dayNumber,
    int position,
    String text,
    boolean inReviewQueue,
    boolean mastered,
    boolean bookmarked,
    AnswerOutcome lastOutcome,
    Instant lastAnsweredAt) {}
