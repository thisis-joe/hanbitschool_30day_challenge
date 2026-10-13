package kr.hanbit.school.staff.learning;

import java.util.UUID;
import kr.hanbit.school.account.*;
import kr.hanbit.school.classroom.*;
import kr.hanbit.school.security.AccountPrincipal;
import kr.hanbit.school.shared.web.ApiException;
import org.springframework.stereotype.Service;

@Service
public class StaffLearningAccess {
  private final AuthenticationModule auth;
  private final ClassroomRepository classrooms;
  private final StudentProfileRepository profiles;
  private final AccountRepository accounts;

  public StaffLearningAccess(AuthenticationModule auth, ClassroomRepository classrooms,
      StudentProfileRepository profiles, AccountRepository accounts) {
    this.auth = auth;
    this.classrooms = classrooms;
    this.profiles = profiles;
    this.accounts = accounts;
  }

  public Classroom requireClassroom(AccountPrincipal principal, UUID classroomId) {
    var account = auth.current(principal);
    if (account.getRole() == Role.STUDENT) throw ApiException.forbidden();
    if (account.isMustChangePassword())
      throw new ApiException(403, "PASSWORD_CHANGE_REQUIRED", "비밀번호를 먼저 변경해 주세요.");
    var classroom = classrooms.findById(classroomId)
        .orElseThrow(() -> new ApiException(404, "NOT_FOUND", "학급을 찾을 수 없습니다."));
    if (!classroom.getSchoolId().equals(account.getSchoolId())) throw ApiException.forbidden();
    return classroom;
  }

  public StudentProfile requireStudent(AccountPrincipal principal, UUID classroomId, UUID studentId) {
    var classroom = requireClassroom(principal, classroomId);
    var profile = profiles.findById(studentId)
        .orElseThrow(() -> new ApiException(404, "NOT_FOUND", "학생을 찾을 수 없습니다."));
    var account = accounts.findById(studentId).orElseThrow(ApiException::forbidden);
    if (!profile.getClassroomId().equals(classroom.getId())
        || !account.getSchoolId().equals(classroom.getSchoolId())
        || account.getRole() != Role.STUDENT) throw ApiException.forbidden();
    return profile;
  }
}
