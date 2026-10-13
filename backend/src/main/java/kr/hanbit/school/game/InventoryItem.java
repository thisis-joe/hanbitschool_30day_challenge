package kr.hanbit.school.game;

import java.time.Instant;

public record InventoryItem(String itemId, boolean owned, Instant acquiredAt) {}
