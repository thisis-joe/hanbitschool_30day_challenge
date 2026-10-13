package kr.hanbit.school.staff.learning;

import java.util.UUID;
import kr.hanbit.school.security.AccountPrincipal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/staff/classrooms/{classroomId}/learning")
public class TeacherLearningController {
  private final TeacherLearningModule module;
  public TeacherLearningController(TeacherLearningModule module) { this.module = module; }

  @GetMapping("/students")
  public TeacherStudentsPage students(@AuthenticationPrincipal AccountPrincipal principal,
      @PathVariable UUID classroomId, @RequestParam(defaultValue = "") String search,
      @RequestParam(defaultValue = "ALL") String status, @RequestParam(defaultValue = "NUMBER") String sort,
      @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
    return module.students(principal, classroomId, new StudentListQuery(search, status, sort, page, size));
  }
}
