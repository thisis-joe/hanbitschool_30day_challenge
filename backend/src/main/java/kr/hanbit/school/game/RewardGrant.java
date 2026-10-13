package kr.hanbit.school.game;

import java.time.Instant;

public record RewardGrant(String itemId, int dayNumber, Instant acquiredAt) {}
