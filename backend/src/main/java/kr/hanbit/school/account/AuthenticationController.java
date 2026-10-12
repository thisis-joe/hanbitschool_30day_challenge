package kr.hanbit.school.account;

import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import kr.hanbit.school.security.*;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthenticationController {
  private final AuthenticationModule module;
  private final SessionLoginHandler sessions;

  public AuthenticationController(AuthenticationModule m, SessionLoginHandler s) {
    module = m;
    sessions = s;
  }

  @PostMapping("/students/login")
  AccountMe student(
      @Valid @RequestBody StudentLoginCommand c, HttpServletRequest req, HttpServletResponse res) {
    var p = module.authenticateStudent(c);
    sessions.establish(p, req, res);
    return module.me(p);
  }

  @PostMapping("/staff/login")
  AccountMe staff(
      @Valid @RequestBody StaffLoginCommand c, HttpServletRequest req, HttpServletResponse res) {
    var p = module.authenticateStaff(c);
    sessions.establish(p, req, res);
    return module.me(p);
  }

  @GetMapping("/me")
  AccountMe me(@AuthenticationPrincipal AccountPrincipal p) {
    return module.me(p);
  }

  @PostMapping("/password")
  AccountMe password(
      @AuthenticationPrincipal AccountPrincipal p,
      @Valid @RequestBody ChangePasswordCommand c,
      HttpServletRequest req,
      HttpServletResponse res) {
    var updated = module.changePassword(p, c);
    sessions.establish(updated, req, res);
    return module.me(updated);
  }

  @PostMapping("/logout")
  ResponseEntity<Void> logout(HttpServletRequest req, HttpServletResponse res) {
    SecurityContextHolder.clearContext();
    var s = req.getSession(false);
    if (s != null) s.invalidate();
    res.addHeader(
        HttpHeaders.SET_COOKIE,
        ResponseCookie.from("JSESSIONID", "")
            .path("/")
            .httpOnly(true)
            .sameSite("Lax")
            .maxAge(0)
            .secure(req.isSecure())
            .build()
            .toString());
    return ResponseEntity.noContent().build();
  }
}
