package kr.hanbit.school.staff;

import java.security.SecureRandom;
import java.util.*;
import kr.hanbit.school.account.*;
import kr.hanbit.school.security.AccountPrincipal;
import kr.hanbit.school.shared.web.*;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class TeacherProvisioningModule {
  private final AuthenticationModule auth;
  private final AccountRepository accounts;
  private final PasswordEncoder encoder;
  private final SecureRandom random = new SecureRandom();

  public TeacherProvisioningModule(AuthenticationModule a, AccountRepository r, PasswordEncoder e) {
    auth = a;
    accounts = r;
    encoder = e;
  }

  private Account admin(AccountPrincipal p) {
    var a = auth.current(p);
    if (a.getRole() != Role.ADMIN) throw ApiException.forbidden();
    return a;
  }

  public TeacherIssued issue(AccountPrincipal p, CreateTeacherCommand c) {
    var a = admin(p);
    var name = Inputs.text("name", c.name(), 50);
    var login = Inputs.staffId(c.staffLoginId());
    byte[] bytes = new byte[24];
    random.nextBytes(bytes);
    var pass = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    var teacher =
        new Account(
            UUID.randomUUID(),
            a.getSchoolId(),
            Role.TEACHER,
            name,
            login,
            encoder.encode(pass),
            true);
    try {
      accounts.saveAndFlush(teacher);
    } catch (DataIntegrityViolationException e) {
      throw new ApiException(409, "STAFF_LOGIN_ID_IN_USE", "이미 사용 중인 교직원 아이디입니다.");
    }
    return new TeacherIssued(teacher.getId(), login, name, pass);
  }

  public List<TeacherSummary> list(AccountPrincipal p) {
    return accounts.findBySchoolIdAndRoleOrderByName(admin(p).getSchoolId(), Role.TEACHER).stream()
        .map(
            a ->
                new TeacherSummary(
                    a.getId(), a.getName(), a.getStaffLoginId(), a.isMustChangePassword()))
        .toList();
  }
}
