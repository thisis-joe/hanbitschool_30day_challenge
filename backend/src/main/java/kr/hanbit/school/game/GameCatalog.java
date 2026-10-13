package kr.hanbit.school.game;

import java.util.ArrayList;
import java.util.List;
import kr.hanbit.school.shared.web.ApiException;
import org.springframework.stereotype.Component;

@Component
public class GameCatalog {
  public static final String VERSION = "game-v1";
  static final List<String> SLOTS = List.of("face", "hat", "top", "bottom", "shoes", "hand");
  private static final List<CharacterOption> CHARACTERS =
      List.of(
          new CharacterOption("haru", "하루", "haru"),
          new CharacterOption("naru", "나루", "naru"),
          new CharacterOption("sodam", "소담", "sodam"),
          new CharacterOption("iden", "이든", "iden"),
          new CharacterOption("arin", "아린", "arin"),
          new CharacterOption("rumi", "루미", "rumi"),
          new CharacterOption("onyu", "온유", "onyu"),
          new CharacterOption("bora", "보라", "bora"),
          new CharacterOption("sion", "시온", "sion"));
  private static final List<GameItem> ITEMS = buildItems();

  public List<CharacterOption> characters() {
    return CHARACTERS;
  }

  public List<GameItem> items() {
    return ITEMS;
  }

  public GameItem rewardForDay(int day) {
    if (day < 1 || day > ITEMS.size())
      throw ApiException.validation("dayNumber", "보상 회차를 확인해 주세요.");
    return ITEMS.get(day - 1);
  }

  public CharacterOption requireCharacter(String id) {
    return CHARACTERS.stream()
        .filter(character -> character.id().equals(id))
        .findFirst()
        .orElseThrow(() -> ApiException.validation("characterId", "캐릭터를 확인해 주세요."));
  }

  public GameItem requireItem(String id) {
    return ITEMS.stream()
        .filter(item -> item.itemId().equals(id))
        .findFirst()
        .orElseThrow(() -> ApiException.validation("equippedBySlot", "장비를 확인해 주세요."));
  }

  private static List<GameItem> buildItems() {
    String[][] names = {
      {"책벌레안경", "새싹안경", "꿀빛안경", "그늘안경", "달무리안경"},
      {"산책모자", "이끼모자", "물결모자", "밤톨모자", "새벽왕관"},
      {"소풍조끼", "풀잎조끼", "구름조끼", "우체부조끼", "별밤조끼"},
      {"모래반바지", "솔잎반바지", "물빛반바지", "단풍반바지", "새벽반바지"},
      {"햇살운동화", "이끼부츠", "파도운동화", "골목부츠", "달빛운동화"},
      {"씨앗가방", "숲소풍가방", "편지가방", "노을지팡이", "밤별지팡이"}
    };
    var items = new ArrayList<GameItem>();
    for (int value = 1; value <= 5; value++) {
      for (int index = 0; index < SLOTS.size(); index++) {
        String slot = SLOTS.get(index);
        String id = slot + "-" + value;
        items.add(
            new GameItem(id, slot, value, (value - 1) * 6 + index + 1, names[index][value - 1], id));
      }
    }
    return List.copyOf(items);
  }
}
