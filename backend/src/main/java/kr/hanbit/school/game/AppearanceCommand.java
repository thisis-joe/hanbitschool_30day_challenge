package kr.hanbit.school.game;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import java.util.Map;

public record AppearanceCommand(
    String characterId,
    @NotNull Map<String, String> equippedBySlot,
    @NotNull @PositiveOrZero Long expectedRevision) {}
