package kr.hanbit.school.game;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import kr.hanbit.school.shared.web.ApiException;
import org.junit.jupiter.api.Test;

class GameCatalogTest {
  private final GameCatalog catalog = new GameCatalog();

  @Test
  void charactersResolveStableIdsToKoreanNamesAndAssets() {
    assertThat(catalog.characters())
        .extracting(CharacterOption::id)
        .containsExactly("haru", "naru", "sodam", "iden", "arin", "rumi", "onyu", "bora", "sion");
    assertThat(catalog.characters())
        .extracting(CharacterOption::name)
        .containsExactly("하루", "나루", "소담", "이든", "아린", "루미", "온유", "보라", "시온");
    assertThat(catalog.requireCharacter("iden"))
        .isEqualTo(new CharacterOption("iden", "이든", "iden"));
    assertThat(catalog.characters()).allSatisfy(c -> assertThat(c.assetKey()).isEqualTo(c.id()));
  }

  @Test
  void everyDayResolvesOneOrderedRewardWithTheApprovedNameAndSlot() {
    assertThat(catalog.items()).hasSize(30);
    assertThat(catalog.items())
        .extracting(GameItem::itemId)
        .containsExactly(
            "face-1", "hat-1", "top-1", "bottom-1", "shoes-1", "hand-1",
            "face-2", "hat-2", "top-2", "bottom-2", "shoes-2", "hand-2",
            "face-3", "hat-3", "top-3", "bottom-3", "shoes-3", "hand-3",
            "face-4", "hat-4", "top-4", "bottom-4", "shoes-4", "hand-4",
            "face-5", "hat-5", "top-5", "bottom-5", "shoes-5", "hand-5");
    String[] names = {
      "책벌레안경", "산책모자", "소풍조끼", "모래반바지", "햇살운동화", "씨앗가방",
      "새싹안경", "이끼모자", "풀잎조끼", "솔잎반바지", "이끼부츠", "숲소풍가방",
      "꿀빛안경", "물결모자", "구름조끼", "물빛반바지", "파도운동화", "편지가방",
      "그늘안경", "밤톨모자", "우체부조끼", "단풍반바지", "골목부츠", "노을지팡이",
      "달무리안경", "새벽왕관", "별밤조끼", "새벽반바지", "달빛운동화", "밤별지팡이"
    };
    assertThat(catalog.items()).extracting(GameItem::name).containsExactly(names);
    assertThat(catalog.items())
        .extracting(GameItem::rewardDay)
        .containsExactly(
            1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
            16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30);
    assertThat(catalog.rewardForDay(1))
        .isEqualTo(new GameItem("face-1", "face", 1, 1, "책벌레안경", "face-1"));
    assertThat(catalog.rewardForDay(30))
        .isEqualTo(new GameItem("hand-5", "hand", 5, 30, "밤별지팡이", "hand-5"));
    assertThat(catalog.requireItem("top-3"))
        .isEqualTo(new GameItem("top-3", "top", 3, 15, "구름조끼", "top-3"));
    assertThat(catalog.items()).allSatisfy(i -> assertThat(i.assetKey()).isEqualTo(i.itemId()));
  }

  @Test
  void invalidCatalogReferencesAreValidationErrors() {
    for (String id : new String[] {null, "", "하루", "HARU", "unknown"})
      assertThatThrownBy(() -> catalog.requireCharacter(id))
          .isInstanceOfSatisfying(
              ApiException.class,
              e -> {
                assertThat(e.status()).isEqualTo(400);
                assertThat(e.code()).isEqualTo("VALIDATION_ERROR");
              });
    for (String id : new String[] {null, "", "face-0", "face-6", "hat-01", "unknown"})
      assertThatThrownBy(() -> catalog.requireItem(id)).isInstanceOf(ApiException.class);
    for (int day : new int[] {-1, 0, 31})
      assertThatThrownBy(() -> catalog.rewardForDay(day)).isInstanceOf(ApiException.class);
  }
}
