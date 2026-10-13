package kr.hanbit.school.learning;

import kr.hanbit.school.security.AccountPrincipal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/student/learning")
public class JourneyController {
  private final JourneyModule journey;

  public JourneyController(JourneyModule journey) {
    this.journey = journey;
  }

  @GetMapping("/map")
  JourneyView view(@AuthenticationPrincipal AccountPrincipal principal) {
    return journey.view(principal);
  }
}
