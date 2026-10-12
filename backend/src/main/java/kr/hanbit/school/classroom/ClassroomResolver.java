package kr.hanbit.school.classroom;

import java.util.Locale;
import kr.hanbit.school.shared.web.*;
import org.springframework.stereotype.Service;

@Service
public class ClassroomResolver {
  private final ClassroomRepository classes;

  public ClassroomResolver(ClassroomRepository c) {
    classes = c;
  }

  public Classroom resolve(ResolveClassroomCommand command) {
    var grade = Inputs.text("gradeLabel", command.gradeLabel(), 20);
    var raw = command.classCode();
    if (raw == null) throw invalid();
    var code = raw.strip().toUpperCase(Locale.ROOT);
    if (!code.matches("[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}")) throw invalid();
    var c = classes.findByJoinCode(code).orElseThrow(this::invalid);
    if (!c.getSchoolId().equals(command.schoolId())
        || !c.getGradeLabel().equals(grade)
        || c.getClassNumber() != command.classNumber()) throw invalid();
    return c;
  }

  private ApiException invalid() {
    return new ApiException(400, "INVALID_CLASS_LINK", "학교·학년·반과 가입 코드를 확인해 주세요.");
  }
}
