package kr.hanbit.school.learning.xp;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface XpEntryRepository extends JpaRepository<XpEntry, UUID> {
  long countByKindAndSourceId(XpKind kind, UUID sourceId);

  @Query("select coalesce(sum(entry.amount), 0L) from XpEntry entry where entry.studentAccountId = :student")
  long sumAmountByStudentAccountId(@Param("student") UUID studentAccountId);
}
