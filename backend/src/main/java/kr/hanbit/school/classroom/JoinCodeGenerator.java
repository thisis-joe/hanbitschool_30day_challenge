package kr.hanbit.school.classroom;

import java.security.SecureRandom;
import org.springframework.stereotype.Component;

@Component
public class JoinCodeGenerator {
  private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  private final SecureRandom random = new SecureRandom();

  public String generate() {
    var code = new StringBuilder(8);
    for (int i = 0; i < 8; i++) code.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
    return code.toString();
  }
}
