package kr.hanbit.school.support;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.LocalDate;
import java.util.UUID;
import kr.hanbit.school.account.Account;
import kr.hanbit.school.learning.DayProgressState;
import kr.hanbit.school.learning.LearningTime;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class LearningTestFixtures {
  public static final String VERSION = "hanbit-v1";

  private final TestFixtures fixtures;
  private final JdbcTemplate jdbc;
  private final Clock clock;

  public LearningTestFixtures(TestFixtures fixtures, JdbcTemplate jdbc, Clock clock) {
    this.fixtures = fixtures;
    this.jdbc = jdbc;
    this.clock = clock;
  }

  public Account student(LocalDate startDate) {
    var school = fixtures.school("학습학교 " + UUID.randomUUID());
    var teacher = fixtures.teacher(school);
    var classroom = fixtures.classroom(school, teacher, "1학년", 1, startDate);
    return fixtures.student(classroom, 1, "학습학생", "별빛");
  }

  public UUID progress(Account student, int day, DayProgressState state) {
    var id = UUID.randomUUID();
    var now = Timestamp.from(LearningTime.persistable(clock.instant()));
    jdbc.update(
        "insert into day_progress"
            + "(id,student_account_id,version,day,state,passed_at,created_at,updated_at)"
            + " values (?,?,?,?,?,?,?,?)",
        id,
        student.getId(),
        VERSION,
        day,
        state.name(),
        state == DayProgressState.PASSED ? now : null,
        now,
        now);
    return id;
  }

  public void passedThrough(Account student, int lastDay) {
    for (int day = 1; day <= lastDay; day++) progress(student, day, DayProgressState.PASSED);
  }

  public int count(String table, Account student) {
    return jdbc.queryForObject(
        "select count(*) from " + table + " where student_account_id=?",
        Integer.class,
        student.getId());
  }

  public void idempotency(
      Account student, String operation, UUID requestId, String payloadHash, String responseJson) {
    jdbc.update(
        "insert into idempotency_records"
            + "(student_account_id,operation,request_id,payload_hash,response_json,created_at)"
            + " values (?,?,?,?,cast(? as jsonb),?)",
        student.getId(),
        operation,
        requestId,
        payloadHash,
        responseJson,
        Timestamp.from(LearningTime.persistable(clock.instant())));
  }
}
