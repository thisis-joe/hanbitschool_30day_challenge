package kr.hanbit.school.staff;

import jakarta.validation.Valid;
import java.util.List;
import kr.hanbit.school.security.AccountPrincipal;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/admin/teachers")
public class TeacherController {
  private final TeacherProvisioningModule module;

  public TeacherController(TeacherProvisioningModule m) {
    module = m;
  }

  @PostMapping
  public ResponseEntity<TeacherIssued> issue(
      @AuthenticationPrincipal AccountPrincipal p, @Valid @RequestBody CreateTeacherCommand c) {
    return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(module.issue(p, c));
  }

  @GetMapping
  public List<TeacherSummary> list(@AuthenticationPrincipal AccountPrincipal p) {
    return module.list(p);
  }
}
