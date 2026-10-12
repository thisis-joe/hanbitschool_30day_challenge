package kr.hanbit.school.learning.xp;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.UUID;
import kr.hanbit.school.support.PostgresTestConfiguration;
import kr.hanbit.school.support.TestFixtures;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties = {"hanbit.bootstrap.id=", "hanbit.bootstrap.password="})
@Import(PostgresTestConfiguration.class)
@Transactional
class JpaXpLedgerIT {
  @Autowired TestFixtures fixtures;
  @Autowired XpEntryRepository entries;
  @Autowired XpLedger ledger;
  @Autowired EntityManager entityManager;

  @Test
  void summaryUsesTheAppendOnlyEntriesAndKeepsTheSumAsALong() {
    var student = student(1);
    var otherStudent = student(2);
    entries.save(
        new XpEntry(
            UUID.randomUUID(),
            student,
            XpKind.FIRST_ANSWER,
            UUID.randomUUID(),
            2_000_000_000,
            Instant.parse("2026-10-12T00:00:00Z")));
    entries.save(
        new XpEntry(
            UUID.randomUUID(),
            student,
            XpKind.FIRST_DAY_PASS,
            UUID.randomUUID(),
            2_000_000_000,
            Instant.parse("2026-10-12T00:00:01Z")));
    entries.save(
        new XpEntry(
            UUID.randomUUID(),
            otherStudent,
            XpKind.REPEAT_ANSWER,
            UUID.randomUUID(),
            1,
            Instant.parse("2026-10-12T00:00:02Z")));
    entries.flush();
    entityManager.clear();

    assertThat(ledger.summary(student)).isEqualTo(new XpSummary(4_000_000_000L, 1_066_667));
    assertThat(ledger.summary(otherStudent)).isEqualTo(new XpSummary(1L, 1));
  }

  @Test
  void anEmptyLedgerStartsAtLevelOne() {
    assertThat(ledger.summary(student(1))).isEqualTo(new XpSummary(0L, 1));
  }

  private UUID student(int number) {
    var school = fixtures.school("XP 원장 학교 " + UUID.randomUUID());
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1", number);
    return fixtures.student(classroom, number, "학생", "XP" + number).getId();
  }
}
