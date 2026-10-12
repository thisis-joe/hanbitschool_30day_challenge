package kr.hanbit.school.account;

import kr.hanbit.school.classroom.*;
import kr.hanbit.school.security.AccountPrincipal;
import kr.hanbit.school.shared.web.*;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthenticationModule {
  private final AccountRepository accounts;
  private final StudentProfileRepository profiles;
  private final ClassroomRepository classes;
  private final SchoolRepository schools;
  private final PasswordEncoder encoder;
  private final PasswordPolicy policy;

  public AuthenticationModule(
      AccountRepository a,
      StudentProfileRepository p,
      ClassroomRepository c,
      SchoolRepository s,
      PasswordEncoder e,
      PasswordPolicy policy) {
    accounts = a;
    profiles = p;
    classes = c;
    schools = s;
    encoder = e;
    this.policy = policy;
  }

  public AccountPrincipal authenticateStudent(StudentLoginCommand c) {
    var classroom =
        classes
            .findBySchoolIdAndGradeLabelAndClassNumber(
                c.schoolId(), Inputs.text("gradeLabel", c.gradeLabel(), 20), c.classNumber())
            .orElseThrow(this::badCredentials);
    var profile =
        profiles
            .findByClassroomIdAndStudentNumber(classroom.getId(), c.studentNumber())
            .orElseThrow(this::badCredentials);
    var a = accounts.findById(profile.getAccountId()).orElseThrow(this::badCredentials);
    if (a.getRole() != Role.STUDENT
        || !a.getSchoolId().equals(c.schoolId())
        || !matches(c.password(), a.getPasswordHash())) throw badCredentials();
    return principal(a);
  }

  public AccountPrincipal authenticateStaff(StaffLoginCommand c) {
    var a =
        accounts
            .findByStaffLoginId(Inputs.staffId(c.staffLoginId()))
            .orElseThrow(this::badCredentials);
    if (a.getRole() == Role.STUDENT || !matches(c.password(), a.getPasswordHash()))
      throw badCredentials();
    return principal(a);
  }

  public Account current(AccountPrincipal p) {
    if (p == null) throw ApiException.unauthorized();
    var a = accounts.findById(p.accountId()).orElseThrow(ApiException::unauthorized);
    if (!a.getSchoolId().equals(p.schoolId())
        || a.getRole() != p.role()
        || a.getPasswordVersion() != p.passwordVersion()) throw ApiException.unauthorized();
    return a;
  }

  public AccountMe me(AccountPrincipal p) {
    return meFor(current(p));
  }

  public AccountMe meFor(Account a) {
    var school = schools.findById(a.getSchoolId()).orElseThrow();
    if (a.getRole() == Role.STUDENT) {
      var p = profiles.findById(a.getId()).orElseThrow();
      var c = classes.findById(p.getClassroomId()).orElseThrow();
      return new StudentMe(
          a.getId(),
          a.getRole(),
          a.getSchoolId(),
          school.getName(),
          c.getId(),
          c.getGradeLabel(),
          c.getClassNumber(),
          p.getStudentNumber(),
          a.getName(),
          p.getNickname());
    }
    return new StaffMe(
        a.getId(),
        a.getRole(),
        a.getSchoolId(),
        school.getName(),
        a.getName(),
        a.getStaffLoginId(),
        a.isMustChangePassword());
  }

  public AccountPrincipal changePassword(AccountPrincipal p, ChangePasswordCommand c) {
    var a = current(p);
    if (!matches(c.currentPassword(), a.getPasswordHash()))
      throw new ApiException(400, "VALIDATION_ERROR", "현재 비밀번호를 확인해 주세요.");
    policy.validate(c.newPassword());
    if (a.isMustChangePassword() && matches(c.newPassword(), a.getPasswordHash()))
      throw ApiException.validation("newPassword", "초기 비밀번호와 다른 비밀번호를 입력해 주세요.");
    var hash = encoder.encode(c.newPassword());
    if (accounts.updatePassword(a.getId(), p.passwordVersion(), hash) != 1)
      throw ApiException.unauthorized();
    return new AccountPrincipal(p.accountId(), p.schoolId(), p.role(), p.passwordVersion() + 1);
  }

  private boolean matches(String raw, String encoded) {
    try {
      return raw != null && encoder.matches(raw, encoded);
    } catch (IllegalArgumentException e) {
      return false;
    }
  }

  private ApiException badCredentials() {
    return new ApiException(401, "INVALID_CREDENTIALS", "로그인 정보를 확인해 주세요.");
  }

  public static AccountPrincipal principal(Account a) {
    return new AccountPrincipal(a.getId(), a.getSchoolId(), a.getRole(), a.getPasswordVersion());
  }
}
