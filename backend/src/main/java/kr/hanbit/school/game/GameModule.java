package kr.hanbit.school.game;

import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import kr.hanbit.school.content.ContentCatalog;
import kr.hanbit.school.learning.DayProgressRepository;
import kr.hanbit.school.learning.DayProgressState;
import kr.hanbit.school.learning.StudentLearningAccess;
import kr.hanbit.school.security.AccountPrincipal;
import kr.hanbit.school.shared.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GameModule {
  private final StudentLearningAccess access;
  private final ContentCatalog content;
  private final GameCatalog catalog;
  private final DayProgressRepository progress;
  private final StudentAppearanceRepository appearances;
  private final StudentEquipmentRepository equipment;
  private final Clock clock;

  public GameModule(
      StudentLearningAccess access,
      ContentCatalog content,
      GameCatalog catalog,
      DayProgressRepository progress,
      StudentAppearanceRepository appearances,
      StudentEquipmentRepository equipment,
      Clock clock) {
    this.access = access;
    this.content = content;
    this.catalog = catalog;
    this.progress = progress;
    this.appearances = appearances;
    this.equipment = equipment;
    this.clock = clock;
  }

  @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
  public GameView view(AccountPrincipal principal) {
    var student = access.requireStudent(principal);
    String version = content.activeVersion().getVersion();
    return render(student.studentAccountId(), version, ownership(student.studentAccountId(), version));
  }

  @Transactional
  public GameView save(AccountPrincipal principal, AppearanceCommand command) {
    var student = access.lockStudent(principal);
    validate(command);
    UUID studentId = student.studentAccountId();
    var appearance = appearances.findById(studentId).orElse(null);
    long revision = appearance == null ? 0 : appearance.getRevision();
    if (command.expectedRevision() != revision)
      throw new ApiException(409, "APPEARANCE_CONFLICT", "다른 화면에서 외형이 변경되었습니다. 다시 확인해 주세요.");
    String version = content.activeVersion().getVersion();
    var owned = ownership(studentId, version);
    for (var itemId : command.equippedBySlot().values()) {
      if (itemId != null && !owned.containsKey(itemId))
        throw new ApiException(409, "GAME_ITEM_NOT_OWNED", "아직 보유하지 않은 장비입니다.");
    }
    if (appearance == null)
      appearance = new StudentAppearance(studentId, command.characterId(), 1, clock.instant());
    else appearance.change(command.characterId(), clock.instant());
    appearances.saveAndFlush(appearance);
    equipment.saveAllAndFlush(
        GameCatalog.SLOTS.stream()
            .map(slot -> new StudentEquipment(studentId, slot, command.equippedBySlot().get(slot)))
            .toList());
    return render(studentId, version, owned);
  }

  private void validate(AppearanceCommand command) {
    if (command == null || command.expectedRevision() == null || command.expectedRevision() < 0)
      throw ApiException.validation("expectedRevision", "현재 외형의 버전을 확인해 주세요.");
    if (command.characterId() != null) catalog.requireCharacter(command.characterId());
    var equipped = command.equippedBySlot();
    if (equipped == null
        || equipped.size() != GameCatalog.SLOTS.size()
        || !equipped.keySet().containsAll(GameCatalog.SLOTS))
      throw ApiException.validation("equippedBySlot", "장비 여섯 슬롯을 모두 입력해 주세요.");
    for (String slot : GameCatalog.SLOTS) {
      String itemId = equipped.get(slot);
      if (itemId != null && !catalog.requireItem(itemId).slot().equals(slot))
        throw ApiException.validation("equippedBySlot", "장비의 슬롯을 확인해 주세요.");
    }
  }

  private Map<String, Instant> ownership(UUID studentId, String version) {
    var owned = new LinkedHashMap<String, Instant>();
    for (var day :
        progress.findByStudentAccountIdAndVersionAndDayLessThanEqualOrderByDayAsc(
            studentId, version, 30)) {
      if (day.getState() == DayProgressState.PASSED)
        owned.put(catalog.rewardForDay(day.getDay()).itemId(), day.getPassedAt());
    }
    return owned;
  }

  private GameView render(UUID studentId, String version, Map<String, Instant> owned) {
    var appearance = appearances.findById(studentId).orElse(null);
    var equipped = new LinkedHashMap<String, String>();
    for (String slot : GameCatalog.SLOTS) equipped.put(slot, null);
    for (var item : equipment.findByIdStudentAccountId(studentId))
      equipped.put(item.getSlot(), item.getItemId());
    return new GameView(
        GameCatalog.VERSION,
        version,
        catalog.characters(),
        catalog.items(),
        appearance == null ? null : appearance.getCharacterId(),
        appearance == null ? 0 : appearance.getRevision(),
        equipped,
        catalog.items().stream()
            .map(
                item ->
                    new InventoryItem(
                        item.itemId(), owned.containsKey(item.itemId()), owned.get(item.itemId())))
            .toList());
  }
}
