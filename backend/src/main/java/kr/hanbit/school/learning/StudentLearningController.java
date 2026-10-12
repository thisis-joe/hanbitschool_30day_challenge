package kr.hanbit.school.learning;

import java.util.UUID;
import kr.hanbit.school.security.AccountPrincipal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/student/learning")
public class StudentLearningController {
  private final LearningSessionModule sessions;
  private final LearningAnswerModule answers;

  public StudentLearningController(LearningSessionModule sessions, LearningAnswerModule answers) {
    this.sessions = sessions;
    this.answers = answers;
  }

  @GetMapping("/status")
  LearningStatus status(@AuthenticationPrincipal AccountPrincipal principal) {
    return sessions.status(principal);
  }

  @PostMapping("/sessions")
  LearningSessionView start(
      @AuthenticationPrincipal AccountPrincipal principal,
      @RequestBody StartLearningSessionCommand command) {
    return sessions.start(principal, command);
  }

  @GetMapping("/sessions/{sessionId}")
  LearningSessionView session(
      @AuthenticationPrincipal AccountPrincipal principal, @PathVariable UUID sessionId) {
    return sessions.session(principal, sessionId);
  }

  @PostMapping("/sessions/{sessionId}/answers")
  AnswerResult answer(
      @AuthenticationPrincipal AccountPrincipal principal,
      @PathVariable UUID sessionId,
      @RequestBody SubmitAnswerCommand command) {
    return answers.answer(principal, sessionId, command);
  }

  @PostMapping("/sessions/{sessionId}/advance")
  LearningSessionView advance(
      @AuthenticationPrincipal AccountPrincipal principal,
      @PathVariable UUID sessionId,
      @RequestBody AdvanceLearningSessionCommand command) {
    return answers.advance(principal, sessionId, command);
  }
}
