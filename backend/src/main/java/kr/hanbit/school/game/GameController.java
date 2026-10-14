package kr.hanbit.school.game;

import jakarta.validation.Valid;
import kr.hanbit.school.security.AccountPrincipal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/student/game")
public class GameController {
  private final GameModule game;

  public GameController(GameModule game) {
    this.game = game;
  }

  @GetMapping
  GameView view(@AuthenticationPrincipal AccountPrincipal principal) {
    return game.view(principal);
  }

  @PutMapping("/appearance")
  GameView save(
      @AuthenticationPrincipal AccountPrincipal principal,
      @Valid @RequestBody AppearanceCommand command) {
    return game.save(principal, command);
  }
}
