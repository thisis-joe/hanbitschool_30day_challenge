package kr.hanbit.school.shared.web;

import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class ApiExceptionHandler {
  @ExceptionHandler(ApiException.class)
  ResponseEntity<ApiError> api(ApiException e, HttpServletRequest request) {
    if (e.status() == 401 && e.code().equals("UNAUTHENTICATED")) {
      var session = request.getSession(false);
      if (session != null) session.invalidate();
      SecurityContextHolder.clearContext();
    }
    return ResponseEntity.status(e.status()).body(e.error());
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<ApiError> invalid(MethodArgumentNotValidException e) {
    var fields = new LinkedHashMap<String, String>();
    for (var f : e.getBindingResult().getFieldErrors())
      fields.putIfAbsent(f.getField(), "입력 내용을 확인해 주세요.");
    return ResponseEntity.badRequest()
        .body(new ApiError("VALIDATION_ERROR", "입력 내용을 확인해 주세요.", fields));
  }

  @ExceptionHandler({
    HttpMessageNotReadableException.class,
    IllegalArgumentException.class,
    org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class
  })
  ResponseEntity<ApiError> malformed(Exception e) {
    return ResponseEntity.badRequest()
        .body(new ApiError("VALIDATION_ERROR", "입력 내용을 확인해 주세요.", Map.of()));
  }

  @ExceptionHandler({NoResourceFoundException.class, NoHandlerFoundException.class})
  ResponseEntity<ApiError> missing(Exception e) {
    return ResponseEntity.status(404)
        .body(new ApiError("NOT_FOUND", "요청한 항목을 찾을 수 없습니다.", Map.of()));
  }
}
