package kr.hanbit.school.classroom;

import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/public/schools")
public class SchoolCatalogController {
  private final ClassroomModule module;

  public SchoolCatalogController(ClassroomModule m) {
    module = m;
  }

  @GetMapping
  public List<SchoolOption> schools() {
    return module.schools();
  }

  @GetMapping("/{id}/classrooms")
  public List<ClassroomOption> classes(@PathVariable UUID id) {
    return module.publicClasses(id);
  }
}
