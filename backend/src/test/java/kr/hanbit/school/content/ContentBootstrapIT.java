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
  void failedInstallLeavesNoVersionRows() throws Exception {
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
  void importerInstallsAllRowsAtomicallyWhenVersionIsMissing() {
    jdbc.update("delete from content_versions");

    importer.install(VERSION, DIGEST, new ClassPathResource("content/hanbit-v1.json"));

    assertThat(jdbc.queryForObject("select count(*) from content_versions", Integer.class))
        .isEqualTo(1);
    assertThat(jdbc.queryForObject("select count(*) from content_days", Integer.class)).isEqualTo(30);
    assertThat(jdbc.queryForObject("select count(*) from questions", Integer.class)).isEqualTo(150);
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
