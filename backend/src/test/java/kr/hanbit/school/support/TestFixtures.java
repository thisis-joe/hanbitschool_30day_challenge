package kr.hanbit.school.support;

import java.time.LocalDate;
import java.util.*;
import kr.hanbit.school.account.*;
import kr.hanbit.school.classroom.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Transactional
public class TestFixtures {
  public static final String PASSWORD = "Hanbit!2026";
  private final SchoolRepository schools;
  private final AccountRepository accounts;
  private final ClassroomRepository classes;
  private final ClassroomTeacherRepository teachers;
  private final StudentProfileRepository profiles;
  private final PasswordEncoder encoder;

  public TestFixtures(
      SchoolRepository s,
      AccountRepository a,
      ClassroomRepository c,
      ClassroomTeacherRepository t,
      StudentProfileRepository p,
      PasswordEncoder e) {
    schools = s;
    accounts = a;
    classes = c;
    teachers = t;
    profiles = p;
    encoder = e;
  }

  public School school(String name) {
    return schools.saveAndFlush(new School(UUID.randomUUID(), name));
  }

  public Account admin(School s) {
    return staff(s, Role.ADMIN, false);
  }

  public Account teacher(School s) {
    return staff(s, Role.TEACHER, false);
  }

  public Account initialTeacher(School s) {
    return staff(s, Role.TEACHER, true);
  }

  private Account staff(School s, Role r, boolean change) {
    return accounts.saveAndFlush(
        new Account(
            UUID.randomUUID(),
            s.getId(),
            r,
            "교사",
            "staff." + UUID.randomUUID().toString().substring(0, 8),
            encoder.encode(PASSWORD),
            change));
  }

  public Classroom classroom(School s, Account teacher, String grade, int n) {
    return classroom(s, teacher, grade, n, LocalDate.of(2026, 10, 12));
  }

  public Classroom classroom(
      School s, Account teacher, String grade, int n, LocalDate startDate) {
    var c =
        classes.saveAndFlush(
            new Classroom(
                UUID.randomUUID(),
                s.getId(),
                grade,
                n,
                UUID.randomUUID()
                    .toString()
                    .substring(0, 8)
                    .toUpperCase()
                    .replace('0', 'A')
                    .replace('1', 'B'),
                startDate));
    teachers.saveAndFlush(new ClassroomTeacher(c.getId(), teacher.getId()));
    return c;
  }

  public Account student(Classroom c, int n, String name, String nick) {
    var a =
        accounts.saveAndFlush(
            new Account(
                UUID.randomUUID(),
                c.getSchoolId(),
                Role.STUDENT,
                name,
                null,
                encoder.encode(PASSWORD),
                false));
    profiles.saveAndFlush(new StudentProfile(a.getId(), c.getId(), n, nick));
    return a;
  }
}
