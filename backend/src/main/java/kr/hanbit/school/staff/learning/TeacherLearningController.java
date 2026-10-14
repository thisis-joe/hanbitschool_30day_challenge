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

  @GetMapping("/students/{studentId}")
  public TeacherStudentDetail student(@AuthenticationPrincipal AccountPrincipal principal,
      @PathVariable UUID classroomId, @PathVariable UUID studentId,
      @RequestParam(defaultValue = "0") int day, @RequestParam(defaultValue = "WRONG") String filter,
      @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "8") int size) {
    return module.student(principal, classroomId, studentId, new AnswerListQuery(day, filter, page, size));
  }

  @GetMapping("/questions")
  public PageResult<TeacherQuestionRow> questions(@AuthenticationPrincipal AccountPrincipal principal,
      @PathVariable UUID classroomId, @RequestParam(defaultValue = "0") int day,
      @RequestParam(defaultValue = "") String search, @RequestParam(defaultValue = "WRONG_RATE_DESC") String sort,
      @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "10") int size) {
    return module.questions(principal, classroomId, new QuestionListQuery(day, search, sort, page, size));
  }

  @GetMapping("/questions/{questionId}")
  public TeacherQuestionDetail question(@AuthenticationPrincipal AccountPrincipal principal,
      @PathVariable UUID classroomId, @PathVariable int questionId) {
    return module.question(principal, classroomId, questionId);
  }
}
