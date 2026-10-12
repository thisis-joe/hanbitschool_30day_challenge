package kr.hanbit.school.account;

import jakarta.validation.Valid;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
public class StudentRegistrationController {
  private final RegistrationModule module;

  public StudentRegistrationController(RegistrationModule m) {
    module = m;
  }

  @PostMapping("/api/auth/students/register")
  public ResponseEntity<StudentMe> register(@Valid @RequestBody StudentRegistrationCommand c) {
    return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(module.register(c));
  }
}
