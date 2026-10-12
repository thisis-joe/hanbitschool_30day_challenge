package kr.hanbit.school.content;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;
import java.util.stream.IntStream;
import java.util.stream.Stream;
import kr.hanbit.school.support.PostgresTestConfiguration;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
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

  @ParameterizedTest
  @ValueSource(strings = {"title", "text", "explanation"})
  void whitespaceOnlyContentIsRejectedByDatabase(String column) {
    assertBlankContentRejected(column, "\t\n\r");
  }

  @ParameterizedTest(name = "{0} rejects Java whitespace code point {1}")
  @MethodSource("javaWhitespaceContent")
  void everyJavaWhitespaceCharacterIsRejectedByDatabase(String column, int codePoint) {
    assertThat(Character.isWhitespace(codePoint)).isTrue();
    assertBlankContentRejected(column, String.valueOf((char) codePoint));
  }

  static Stream<Arguments> javaWhitespaceContent() {
    int[] whitespace = {
      0x0009, 0x000A, 0x000B, 0x000C, 0x000D,
      0x001C, 0x001D, 0x001E, 0x001F, 0x0020,
      0x1680,
      0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006,
      0x2008, 0x2009, 0x200A,
      0x2028, 0x2029, 0x205F, 0x3000
    };
    return Stream.of("title", "text", "explanation")
        .flatMap(
            column ->
                IntStream.of(whitespace)
                    .mapToObj(codePoint -> Arguments.of(column, codePoint)));
  }

  @ParameterizedTest(name = "{0} accepts nonbreaking code point {1}")
  @MethodSource("nonWhitespaceContent")
  void nonbreakingUnicodeSpacesAreAcceptedByDatabase(String column, int codePoint) {
    assertThat(Character.isWhitespace(codePoint)).isFalse();
    String value = String.valueOf((char) codePoint);
    String table = column.equals("title") ? "content_days" : "questions";
    String identity = column.equals("title") ? "day=1" : "question_id=1";

    assertThat(
            jdbc.update(
                "update " + table + " set " + column + "=? where version=? and " + identity,
                value,
                "hanbit-v1"))
        .isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "select " + column + " from " + table + " where version=? and " + identity,
                String.class,
                "hanbit-v1"))
        .isEqualTo(value);
  }

  static Stream<Arguments> nonWhitespaceContent() {
    return Stream.of("title", "text", "explanation")
        .flatMap(
            column ->
                IntStream.of(0x00A0, 0x2007, 0x202F)
                    .mapToObj(codePoint -> Arguments.of(column, codePoint)));
  }

  private void assertBlankContentRejected(String column, String value) {
    String table = column.equals("title") ? "content_days" : "questions";
    String identity = column.equals("title") ? "day=1" : "question_id=1";

    assertThatThrownBy(
            () ->
                jdbc.update(
                    "update " + table + " set " + column + "=? where version=? and " + identity,
                    value,
                    "hanbit-v1"))
        .isInstanceOf(DataIntegrityViolationException.class)
        .hasStackTraceContaining(table + "_" + column + "_nonblank");
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
