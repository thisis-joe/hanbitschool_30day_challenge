package kr.hanbit.school.content;

import org.springframework.stereotype.Component;

@Component
public class QuestionTimeLimit {
  public int secondsFor(String text) {
    long length = text.codePoints().filter(codePoint -> !Character.isWhitespace(codePoint)).count();
    if (length <= 12) return 10;
    if (length <= 16) return 11;
    if (length <= 20) return 12;
    if (length <= 25) return 13;
    if (length <= 31) return 14;
    return 15;
  }
}
