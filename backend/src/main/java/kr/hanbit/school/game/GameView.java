package kr.hanbit.school.game;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public record GameView(
    String catalogVersion,
    String contentVersion,
    List<CharacterOption> characters,
    List<GameItem> items,
    String characterId,
    long revision,
    Map<String, String> equippedBySlot,
    List<InventoryItem> inventory) {
  public GameView {
    equippedBySlot = Collections.unmodifiableMap(new LinkedHashMap<>(equippedBySlot));
  }
}
