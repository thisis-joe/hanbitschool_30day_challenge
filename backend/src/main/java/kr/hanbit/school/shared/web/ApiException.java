package kr.hanbit.school.shared.web;

import java.util.Map;

public class ApiException extends RuntimeException {
  private final int status;
  private final String code;
  private final Map<String, String> fields;

  public ApiException(int status, String code, String message) {
    this(status, code, message, Map.of());
  }

  public ApiException(int status, String code, String message, Map<String, String> fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  public int status() {
    return status;
  }

  public String code() {
    return code;
  }

  public ApiError error() {
    return new ApiError(code, getMessage(), fields);
  }

  public static ApiException unauthorized() {
    return new ApiException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
  }

  public static ApiException forbidden() {
    return new ApiException(403, "FORBIDDEN", "접근 권한이 없습니다.");
  }

  public static ApiException validation(String field, String message) {
    return new ApiException(400, "VALIDATION_ERROR", "입력 내용을 확인해 주세요.", Map.of(field, message));
  }
}
