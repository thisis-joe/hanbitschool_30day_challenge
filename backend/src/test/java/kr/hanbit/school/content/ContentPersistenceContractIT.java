package kr.hanbit.school.content;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import kr.hanbit.school.support.PostgresTestConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties = {"hanbit.bootstrap.id=", "hanbit.bootstrap.password="})
@Import(PostgresTestConfiguration.class)
@Transactional
class ContentPersistenceContractIT {
  @Autowired JdbcTemplate jdbc;

  @Test
  void learningTablesAndPostgresTextColumnsExist() {
    for (String table : new String[] {"content_versions", "content_days", "questions"}) {
      assertThat(jdbc.queryForObject("select to_regclass(?)::text", String.class, table))
          .as(table)
          .isNotNull();
    }
    assertThat(
            jdbc.queryForList(
                "select column_name from information_schema.columns"
                    + " where table_schema='public' and table_name='questions'"
                    + " and data_type='text' order by column_name",
                String.class))
        .contains("explanation", "text");
  }

  @Test
  void duplicateExplanationsAreLegalButPositionsStayUniqueWithinADay() {
    String version = "contract-" + UUID.randomUUID();
    jdbc.update(
        "insert into content_versions(version,digest,active) values (?, ?, false)",
        version,
        "a".repeat(64));
    jdbc.update("insert into content_days(version,day,title) values (?,1,'첫날')", version);
    insertQuestion(version, 1, 1, 1, "같은 설명");
    insertQuestion(version, 2, 1, 2, "같은 설명");

    assertThat(
            jdbc.queryForObject(
                "select count(*) from questions where version=? and explanation='같은 설명'",
                Integer.class,
                version))
        .isEqualTo(2);
    assertThatThrownBy(() -> insertQuestion(version, 3, 1, 2, "다른 설명"))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void answerConstraintRejectsUnknownChoices() {
    String version = "contract-" + UUID.randomUUID();
    jdbc.update(
        "insert into content_versions(version,digest,active) values (?, ?, false)",
        version,
        "a".repeat(64));
    jdbc.update("insert into content_days(version,day,title) values (?,1,'첫날')", version);

    assertThatThrownBy(
            () ->
                jdbc.update(
                    "insert into questions(version,question_id,day,position,text,answer,explanation,time_limit_seconds)"
                        + " values (?,3,1,3,'질문','Y','설명',10)",
                    version))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  private void insertQuestion(String version, int id, int day, int position, String explanation) {
    jdbc.update(
        "insert into questions(version,question_id,day,position,text,answer,explanation,time_limit_seconds)"
            + " values (?,?,?,?,?,'O',?,10)",
        version,
        id,
        day,
        position,
        "질문 " + id,
        explanation);
  }
}
