package kr.hanbit.school.classroom;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
public class ClassroomResolveController {
  private final ClassroomResolver resolver;

  public ClassroomResolveController(ClassroomResolver r) {
    resolver = r;
  }

  @PostMapping("/api/public/classrooms/resolve")
  public ClassroomOption resolve(@Valid @RequestBody ResolveClassroomCommand c) {
    var found = resolver.resolve(c);
    return new ClassroomOption(found.getId(), found.getGradeLabel(), found.getClassNumber());
  }
}
