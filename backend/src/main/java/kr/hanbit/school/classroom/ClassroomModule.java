package kr.hanbit.school.classroom;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;
import kr.hanbit.school.account.*;
import kr.hanbit.school.security.AccountPrincipal;
import kr.hanbit.school.shared.web.*;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.*;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class ClassroomModule {
  private final AuthenticationModule auth;
  private final ClassroomRepository classes;
  private final ClassroomTeacherRepository teachers;
  private final StudentProfileRepository profiles;
  private final AccountRepository accounts;
  private final SchoolRepository schools;
  private final JoinCodeGenerator codes;
  private final TransactionTemplate writes;

  public ClassroomModule(
      AuthenticationModule a,
      ClassroomRepository c,
      ClassroomTeacherRepository t,
      StudentProfileRepository p,
      AccountRepository ac,
      SchoolRepository s,
      JoinCodeGenerator g,
      PlatformTransactionManager tm) {
    auth = a;
    classes = c;
    teachers = t;
    profiles = p;
    accounts = ac;
    schools = s;
    codes = g;
    writes = new TransactionTemplate(tm);
    writes.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
  }

  private Account staff(AccountPrincipal p) {
    var a = auth.current(p);
    if (a.getRole() == Role.STUDENT) throw ApiException.forbidden();
    if (a.isMustChangePassword())
      throw new ApiException(403, "PASSWORD_CHANGE_REQUIRED", "비밀번호를 먼저 변경해 주세요.");
    return a;
  }

  public ClassroomSummary create(AccountPrincipal p, CreateClassroomCommand command) {
    var a = staff(p);
    var grade = Inputs.text("gradeLabel", command.gradeLabel(), 20);
    if (command.classNumber() < 1 || command.classNumber() > 99 || command.startDate() == null)
      throw ApiException.validation("classNumber", "학급 정보를 확인해 주세요.");
    for (int i = 0; i < 5; i++) {
      var c =
          new Classroom(
              UUID.randomUUID(),
              a.getSchoolId(),
              grade,
              command.classNumber(),
              codes.generate(),
              command.startDate());
      try {
        writes.executeWithoutResult(
            tx -> {
              classes.saveAndFlush(c);
              if (a.getRole() == Role.TEACHER)
                teachers.saveAndFlush(new ClassroomTeacher(c.getId(), a.getId()));
            });
        return summary(c, a);
      } catch (DataIntegrityViolationException e) {
        if (constraint(e, "uq_classroom_tuple"))
          throw new ApiException(409, "CLASSROOM_ALREADY_EXISTS", "이미 등록된 학급입니다.");
        if (!constraint(e, "uq_join_code")) throw e;
      }
    }
    throw new ApiException(503, "JOIN_CODE_UNAVAILABLE", "가입 코드 생성에 실패했습니다. 다시 시도해 주세요.");
  }

  private boolean constraint(Throwable e, String name) {
    for (var cause = e; cause != null; cause = cause.getCause())
      if (cause instanceof ConstraintViolationException v && name.equals(v.getConstraintName()))
        return true;
    return false;
  }

  public List<ClassroomSummary> list(AccountPrincipal p, ClassroomScope scope) {
    var a = staff(p);
    return classes.findBySchoolIdOrderByGradeLabelAscClassNumberAsc(a.getSchoolId()).stream()
        .filter(c -> scope == ClassroomScope.SCHOOL || manages(c, a))
        .map(c -> summary(c, a))
        .toList();
  }

  private boolean manages(Classroom c, Account a) {
    return a.getRole() == Role.ADMIN
        || teachers.existsByIdClassroomIdAndIdTeacherAccountId(c.getId(), a.getId());
  }

  private ClassroomSummary summary(Classroom c, Account a) {
    boolean manage = manages(c, a);
    return new ClassroomSummary(
        c.getId(),
        c.getGradeLabel(),
        c.getClassNumber(),
        c.getStartDate(),
        profiles.countByClassroomId(c.getId()),
        manage,
        manage ? c.getJoinCode() : null);
  }

  public List<StudentRosterRow> students(AccountPrincipal p, UUID id) {
    var a = staff(p);
    var c =
        classes
            .findById(id)
            .orElseThrow(() -> new ApiException(404, "NOT_FOUND", "학급을 찾을 수 없습니다."));
    if (!c.getSchoolId().equals(a.getSchoolId())) throw ApiException.forbidden();
    var rows = profiles.findByClassroomIdOrderByStudentNumber(id);
    var names =
        accounts.findAllById(rows.stream().map(StudentProfile::getAccountId).toList()).stream()
            .collect(Collectors.toMap(Account::getId, Function.identity()));
    return rows.stream()
        .map(
            row ->
                new StudentRosterRow(
                    row.getAccountId(),
                    c.getGradeLabel(),
                    c.getClassNumber(),
                    row.getStudentNumber(),
                    names.get(row.getAccountId()).getName()))
        .toList();
  }

  public List<SchoolOption> schools() {
    return schools.findAllByOrderByName().stream()
        .map(s -> new SchoolOption(s.getId(), s.getName()))
        .toList();
  }

  public List<ClassroomOption> publicClasses(UUID school) {
    return classes.findBySchoolIdOrderByGradeLabelAscClassNumberAsc(school).stream()
        .map(c -> new ClassroomOption(c.getId(), c.getGradeLabel(), c.getClassNumber()))
        .toList();
  }
}
