package kr.hanbit.school.learning;

import java.util.List;
import kr.hanbit.school.security.AccountPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/student/learning")
public class StudentLearningQuestionController {
  private final PersonalLearningModule personal;

  public StudentLearningQuestionController(PersonalLearningModule personal) {
    this.personal = personal;
  }

  @GetMapping("/questions")
  List<PersonalQuestionView> list(
      @AuthenticationPrincipal AccountPrincipal principal,
      @RequestParam(required = false) PersonalQuestionFilter filter) {
    return personal.list(principal, filter);
  }

  @PutMapping("/review-queue/{questionId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void addReviewQueue(
      @AuthenticationPrincipal AccountPrincipal principal, @PathVariable int questionId) {
    personal.addReviewQueue(principal, questionId);
  }

  @DeleteMapping("/review-queue/{questionId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void removeReviewQueue(
      @AuthenticationPrincipal AccountPrincipal principal, @PathVariable int questionId) {
    personal.removeReviewQueue(principal, questionId);
  }

  @PutMapping("/bookmarks/{questionId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void addBookmark(
      @AuthenticationPrincipal AccountPrincipal principal, @PathVariable int questionId) {
    personal.addBookmark(principal, questionId);
  }

  @DeleteMapping("/bookmarks/{questionId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void removeBookmark(
      @AuthenticationPrincipal AccountPrincipal principal, @PathVariable int questionId) {
    personal.removeBookmark(principal, questionId);
  }
}
