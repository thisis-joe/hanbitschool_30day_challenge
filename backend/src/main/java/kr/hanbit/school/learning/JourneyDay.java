package kr.hanbit.school.learning;

import java.time.Instant;

public record JourneyDay(
    int dayNumber,
    DayProgressState state,
    String availability,
    int firstAnsweredCount,
    Instant passedAt,
    String rewardItemId,
    boolean rewardOwned) {}
