package kr.hanbit.school.security;

import java.util.Map;
import org.springframework.http.*;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
public class CsrfController {
  @GetMapping("/api/auth/csrf")
  ResponseEntity<Map<String, String>> token(CsrfToken csrf) {
    return ResponseEntity.ok()
        .cacheControl(CacheControl.noStore())
        .body(Map.of("headerName", csrf.getHeaderName(), "token", csrf.getToken()));
  }
}
