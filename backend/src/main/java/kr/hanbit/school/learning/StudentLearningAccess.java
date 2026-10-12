package kr.hanbit.school.learning;

import kr.hanbit.school.account.AuthenticationModule;
import kr.hanbit.school.account.Role;
import kr.hanbit.school.account.StudentProfile;
import kr.hanbit.school.account.StudentProfileRepository;
import kr.hanbit.school.classroom.ClassroomRepository;
import kr.hanbit.school.security.AccountPrincipal;
import kr.hanbit.school.shared.web.ApiException;
import org.springframework.stereotype.Service;

@Service
public class StudentLearningAccess {
  private final AuthenticationModule authentication;
  private final StudentProfileRepository profiles;
  private final ClassroomRepository classrooms;

  public StudentLearningAccess(
      AuthenticationModule authentication,
      StudentProfileRepository profiles,
      ClassroomRepository classrooms) {
    this.authentication = authentication;
    this.profiles = profiles;
    this.classrooms = classrooms;
  }

  public StudentLearningContext requireStudent(AccountPrincipal principal) {
    var account = authentication.current(principal);
    if (account.getRole() != Role.STUDENT) throw ApiException.forbidden();
    return context(
        account.getId(),
        account.getSchoolId(),
        profiles.findById(account.getId()).orElseThrow(ApiException::unauthorized));
  }

  public StudentLearningContext lockStudent(AccountPrincipal principal) {
    var account = authentication.current(principal);
    if (account.getRole() != Role.STUDENT) throw ApiException.forbidden();
    return context(
        account.getId(),
        account.getSchoolId(),
        profiles.findLockedByAccountId(account.getId()).orElseThrow(ApiException::unauthorized));
  }

  private StudentLearningContext context(
      java.util.UUID accountId, java.util.UUID schoolId, StudentProfile profile) {
    if (!profile.getAccountId().equals(accountId)) throw ApiException.unauthorized();
    var classroom =
        classrooms.findById(profile.getClassroomId()).orElseThrow(ApiException::unauthorized);
    if (!classroom.getSchoolId().equals(schoolId)) throw ApiException.unauthorized();
    return new StudentLearningContext(accountId, classroom.getId(), classroom.getStartDate());
  }
}
