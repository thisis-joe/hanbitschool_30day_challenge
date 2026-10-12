package kr.hanbit.school;

import static org.assertj.core.api.Assertions.*;

import java.util.UUID;
import kr.hanbit.school.support.PostgresTestConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(properties = {"hanbit.bootstrap.id=", "hanbit.bootstrap.password="})
@Import(PostgresTestConfiguration.class)
class PersistenceContractIT {
  @Autowired JdbcTemplate jdbc;
  static final UUID SCHOOL = UUID.fromString("00000000-0000-4000-8000-000000000001");

  @Test
  void requiredTablesExist() {
    for (String table :
        new String[] {
          "schools", "accounts", "classrooms", "classroom_teachers", "student_profiles"
        })
      assertThat(jdbc.queryForObject("select to_regclass(?)::text", String.class, table))
          .as(table)
          .isNotNull();
  }

  @Test
  void classNumbersAreUniqueWithinSchoolGrade() {
    var grade = "grade" + UUID.randomUUID().toString().substring(0, 8);
    insertClass(grade, 1);
    assertThatThrownBy(() -> insertClass(grade, 1))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void studentNumberIsUniqueWithinClassButAllowedInAnotherClass() {
    var grade = "grade" + UUID.randomUUID().toString().substring(0, 8);
    var a = insertClass(grade, 1);
    var b = insertClass(grade, 2);
    insertStudent(a, 1);
    insertStudent(b, 1);
    assertThatThrownBy(() -> insertStudent(a, 1))
        .isInstanceOf(DataIntegrityViolationException.class);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from student_profiles where classroom_id in (?,?)",
                Integer.class,
                a,
                b))
        .isEqualTo(2);
  }

  @Test
  void invalidClassForeignKeyIsRejected() {
    assertThatThrownBy(() -> insertStudent(UUID.randomUUID(), 1))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  UUID insertClass(String grade, int n) {
    var id = UUID.randomUUID();
    var code = UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    jdbc.update(
        "insert into classrooms(id,school_id,grade_label,class_number,join_code,start_date) values"
            + " (?,?,?,?,?,date '2026-10-12')",
        id,
        SCHOOL,
        grade,
        n,
        code);
    return id;
  }

  void insertStudent(UUID c, int n) {
    var a = UUID.randomUUID();
    jdbc.update(
        "insert into accounts(id,school_id,role,name,password_hash) values"
            + " (?,?,'STUDENT','김민수','test-hash')",
        a,
        SCHOOL);
    try {
      jdbc.update(
          "insert into student_profiles(account_id,classroom_id,student_number,nickname) values"
              + " (?,?,?,'숲친구')",
          a,
          c,
          n);
    } catch (RuntimeException e) {
      jdbc.update("delete from accounts where id=?", a);
      throw e;
    }
  }
}
