package kr.hanbit.school.account;

import java.nio.charset.StandardCharsets;
import org.springframework.stereotype.Component;

@Component
public class PasswordPolicy {
  public void validate(String password) {
    if (password == null
        || password.codePointCount(0, password.length()) < 8
        || password.getBytes(StandardCharsets.UTF_8).length > 72)
      throw new IllegalArgumentException("비밀번호는 8자 이상이며 너무 길지 않아야 합니다.");
  }
}
