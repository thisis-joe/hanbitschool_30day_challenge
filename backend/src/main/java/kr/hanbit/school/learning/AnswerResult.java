package kr.hanbit.school.learning;

import java.util.UUID;
import kr.hanbit.school.content.AnswerChoice;
import kr.hanbit.school.game.RewardGrant;

public record AnswerResult(
    UUID attemptAnswerId,
    int questionId,
    AnswerOutcome outcome,
    AnswerChoice correctChoice,
    String explanation,
    int xpAwarded,
    long totalXp,
    int level,
    int attemptCorrectCount,
    int attemptAnsweredCount,
    DayAttemptState attemptState,
    DayProgressState dayState,
    boolean nextDayAvailable,
    boolean reviewPromptEligible,
    RewardGrant rewardGranted) {}
