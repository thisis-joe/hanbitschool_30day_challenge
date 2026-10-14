package kr.hanbit.school.game;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StudentAppearanceRepository extends JpaRepository<StudentAppearance, UUID> {
  interface CharacterSelection {
    UUID getAccountId();
    String getCharacterId();
  }

  @Query("select a.studentAccountId as accountId, a.characterId as characterId"
      + " from StudentAppearance a where a.studentAccountId in :accountIds")
  List<CharacterSelection> findCharactersByAccountIds(@Param("accountIds") List<UUID> accountIds);
}
