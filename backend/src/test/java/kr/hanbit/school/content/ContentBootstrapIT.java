package kr.hanbit.school.content;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import kr.hanbit.school.support.PostgresTestConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(properties = {"hanbit.bootstrap.id=", "hanbit.bootstrap.password="})
@Import(PostgresTestConfiguration.class)
@Transactional
class ContentBootstrapIT {
  private static final String VERSION = "hanbit-v1";
  private static final String DIGEST =
      "775b8cd7314ecfad9f93ad0ced97d4ca956093ae48b148d4fa438959214dfaeb";

  @Autowired ContentBootstrap bootstrap;
  @Autowired ContentImporter importer;
  @Autowired ContentCatalog catalog;
  @Autowired JdbcTemplate jdbc;
  @Autowired ObjectMapper mapper;

  @Test
  void bootstrapInstallsTheActiveCatalogAndCatalogKeepsQuestionOrder() {
    assertThat(catalog.activeVersion().getVersion()).isEqualTo(VERSION);
    assertThat(catalog.questionsForDay(VERSION, 1))
        .hasSize(5)
        .extracting(LearningQuestion::getPosition)
        .containsExactly(1, 2, 3, 4, 5);
    assertThat(catalog.requireQuestion(VERSION, 1).getText())
        .isEqualTo("친구가 교실 문을 닫고 나갈 때 쾅 소리가 났다.");
  }

  @Test
  void cleanSameHashRestartPerformsNoWrites() {
    var before = rowVersions();

    bootstrap.initialize();

    assertThat(rowVersions()).isEqualTo(before);
  }

  @Test
  void sameHashWithMissingOrChangedRowsFailsClosed() {
    jdbc.update("delete from questions where version=? and question_id=150", VERSION);
    assertThatThrownBy(bootstrap::initialize).isInstanceOf(IllegalStateException.class);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from questions where version=?", Integer.class, VERSION))
        .isEqualTo(149);
  }

  @Test
  void sameHashWithChangedRowsFailsClosedWithoutRepair() {
    jdbc.update("update questions set text='훼손됨' where version=? and question_id=1", VERSION);
    assertThatThrownBy(bootstrap::initialize).isInstanceOf(IllegalStateException.class);
    assertThat(
            jdbc.queryForObject(
                "select text from questions where version=? and question_id=1",
                String.class,
                VERSION))
        .isEqualTo("훼손됨");
  }

  @Test
  void differentHashFailsClosed() {
    jdbc.update("update content_versions set digest=? where version=?", "f".repeat(64), VERSION);

    assertThatThrownBy(bootstrap::initialize).isInstanceOf(IllegalStateException.class);
    assertThat(
            jdbc.queryForObject(
                "select digest from content_versions where version=?", String.class, VERSION))
        .isEqualTo("f".repeat(64));
  }

  @Test
  void inactiveCanonicalVersionFailsClosedWithoutRepair() {
    jdbc.update("update content_versions set active=false where version=?", VERSION);

    assertThatThrownBy(bootstrap::initialize).isInstanceOf(IllegalStateException.class);
    assertThat(
            jdbc.queryForObject(
                "select active from content_versions where version=?", Boolean.class, VERSION))
        .isFalse();
  }

  @Test
  void conflictingActiveVersionPreventsCanonicalInstallWithoutWrites() {
    deleteAllContent();
    jdbc.update(
        "insert into content_versions(version,digest,active) values ('other-v1',?,true)",
        "a".repeat(64));

    assertThatThrownBy(bootstrap::initialize).isInstanceOf(IllegalStateException.class);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from content_versions where version=?", Integer.class, VERSION))
        .isZero();
    assertThat(
            jdbc.queryForObject(
                "select active from content_versions where version='other-v1'", Boolean.class))
        .isTrue();
  }

  @Test
  void invalidDocumentIsRejectedBeforeCreatingVersionRows() throws Exception {
    String invalidVersion = "invalid-v1";
    var invalid =
        mapper.readValue(
            """
            [{"day":1,"title":"하루","questions":[]}]
            """,
            HanbitContentDocument.class);
    var bytes = mapper.writeValueAsBytes(invalid.days());
    var digest = new ContentDigest().normalizedSha256(invalid);

    assertThatThrownBy(
            () -> importer.install(invalidVersion, digest, new ByteArrayResource(bytes)))
        .isInstanceOf(IllegalStateException.class);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from content_versions where version=?",
                Integer.class,
                invalidVersion))
        .isZero();
  }

  @Test
  @Transactional(propagation = Propagation.NOT_SUPPORTED)
  void failedInstallLeavesNoVersionRows() {
    String failedVersion = "rollback-v1";
    deleteAllContent();
    try {
      jdbc.execute(
          """
          create function reject_rollback_question() returns trigger language plpgsql as $$
          begin
            if new.version = 'rollback-v1' then
              raise exception 'forced question insert failure';
            end if;
            return new;
          end
          $$
          """);
      jdbc.execute(
          "create trigger reject_rollback_question before insert on questions"
              + " for each row execute function reject_rollback_question()");

      assertThatThrownBy(
              () ->
                  importer.install(
                      failedVersion,
                      DIGEST,
                      new ClassPathResource("content/hanbit-v1.json")))
          .isInstanceOf(RuntimeException.class)
          .hasStackTraceContaining("forced question insert failure");
      assertThat(
              jdbc.queryForObject(
                  "select count(*) from content_versions where version=?",
                  Integer.class,
                  failedVersion))
          .isZero();
      assertThat(
              jdbc.queryForObject(
                  "select count(*) from content_days where version=?",
                  Integer.class,
                  failedVersion))
          .isZero();
      assertThat(
              jdbc.queryForObject(
                  "select count(*) from questions where version=?", Integer.class, failedVersion))
          .isZero();
    } finally {
      jdbc.execute("drop trigger if exists reject_rollback_question on questions");
      jdbc.execute("drop function if exists reject_rollback_question()");
      deleteAllContent();
      bootstrap.initialize();
    }
  }

  @Test
  void importerInstallsAllRowsAtomicallyWhenVersionIsMissing() {
    deleteAllContent();

    importer.install(VERSION, DIGEST, new ClassPathResource("content/hanbit-v1.json"));

    assertThat(jdbc.queryForObject("select count(*) from content_versions", Integer.class))
        .isEqualTo(1);
    assertThat(jdbc.queryForObject("select count(*) from content_days", Integer.class)).isEqualTo(30);
    assertThat(jdbc.queryForObject("select count(*) from questions", Integer.class)).isEqualTo(150);
  }

  private void deleteAllContent() {
    jdbc.update("delete from questions");
    jdbc.update("delete from content_days");
    jdbc.update("delete from content_versions");
  }

  private String rowVersions() {
    return jdbc.queryForObject(
        "select md5(string_agg(marker, ',' order by marker)) from ("
            + " select 'v:'||version||':'||xmin::text marker from content_versions where version=?"
            + " union all select 'd:'||day||':'||xmin::text from content_days where version=?"
            + " union all select 'q:'||question_id||':'||xmin::text from questions where version=?"
            + ") rows",
        String.class,
        VERSION,
        VERSION,
        VERSION);
  }
}
