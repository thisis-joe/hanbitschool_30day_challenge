package kr.hanbit.school.account;

import java.util.UUID;
import kr.hanbit.school.classroom.*;
import kr.hanbit.school.shared.web.*;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.*;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class RegistrationModule {
  private final ClassroomResolver resolver;
  private final AccountRepository accounts;
  private final StudentProfileRepository profiles;
  private final PasswordEncoder encoder;
  private final PasswordPolicy policy;
  private final AuthenticationModule auth;
  private final TransactionTemplate writes;

  public RegistrationModule(
      ClassroomResolver r,
      AccountRepository a,
      StudentProfileRepository p,
      PasswordEncoder e,
      PasswordPolicy policy,
      AuthenticationModule auth,
      PlatformTransactionManager tm) {
    resolver = r;
    accounts = a;
    profiles = p;
    encoder = e;
    this.policy = policy;
    this.auth = auth;
    writes = new TransactionTemplate(tm);
    writes.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
  }

  public StudentMe register(StudentRegistrationCommand command) {
    var name = Inputs.text("name", command.name(), 50);
    var nickname = Inputs.text("nickname", command.nickname(), 20);
    if (command.studentNumber() < 1 || command.studentNumber() > 999)
      throw ApiException.validation("studentNumber", "번호는 1~999 사이입니다.");
    var link =
        new ResolveClassroomCommand(
            command.schoolId(), command.gradeLabel(), command.classNumber(), command.classCode());
    resolver.resolve(link);
    policy.validate(command.password());
    var hash = encoder.encode(command.password());
    var account =
        new Account(UUID.randomUUID(), command.schoolId(), Role.STUDENT, name, null, hash, false);
    try {
      writes.executeWithoutResult(
          tx -> {
            var c = resolver.resolve(link);
            accounts.saveAndFlush(account);
            profiles.saveAndFlush(
                new StudentProfile(account.getId(), c.getId(), command.studentNumber(), nickname));
          });
    } catch (DataIntegrityViolationException e) {
      for (Throwable cause = e; cause != null; cause = cause.getCause())
        if (cause instanceof ConstraintViolationException v
            && "uq_student_number".equals(v.getConstraintName()))
          throw new ApiException(409, "STUDENT_NUMBER_IN_USE", "이미 가입한 번호입니다. 번호를 확인하거나 로그인해 주세요.");
      throw e;
    }
    return (StudentMe) auth.meFor(account);
  }
}
