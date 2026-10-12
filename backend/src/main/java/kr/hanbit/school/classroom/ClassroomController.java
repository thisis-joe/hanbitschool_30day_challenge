package kr.hanbit.school.classroom;

import jakarta.validation.Valid;
import java.util.*;
import kr.hanbit.school.security.AccountPrincipal;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/staff/classrooms")
public class ClassroomController {
  private final ClassroomModule module;

  public ClassroomController(ClassroomModule m) {
    module = m;
  }

  @PostMapping
  public ResponseEntity<ClassroomSummary> create(
      @AuthenticationPrincipal AccountPrincipal p, @Valid @RequestBody CreateClassroomCommand c) {
    return ResponseEntity.status(201).body(module.create(p, c));
  }

  @GetMapping
  public List<ClassroomSummary> list(
      @AuthenticationPrincipal AccountPrincipal p,
      @RequestParam(defaultValue = "MINE") ClassroomScope scope) {
    return module.list(p, scope);
  }

  @GetMapping("/{id}/students")
  public List<StudentRosterRow> students(
      @AuthenticationPrincipal AccountPrincipal p, @PathVariable UUID id) {
    return module.students(p, id);
  }
}
