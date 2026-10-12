package kr.hanbit.school.shared.web;

import java.text.Normalizer;
import java.util.Locale;

public final class Inputs {
  private Inputs() {}

  public static String text(String field, String raw, int max) {
    if (raw == null) throw ApiException.validation(field, "입력해 주세요.");
    var s = Normalizer.normalize(raw.strip(), Normalizer.Form.NFC);
    if (s.isBlank()
        || s.codePointCount(0, s.length()) > max
        || s.codePoints()
            .anyMatch(c -> Character.isISOControl(c) || Character.getType(c) == Character.SURROGATE)
        || s.codePoints().allMatch(c -> Character.isWhitespace(c) || Character.isSpaceChar(c)))
      throw ApiException.validation(field, "입력 길이와 내용을 확인해 주세요.");
    return s;
  }

  public static String staffId(String raw) {
    var s = text("staffLoginId", raw, 40).toLowerCase(Locale.ROOT);
    if (!s.matches("[a-z0-9][a-z0-9._-]{2,39}"))
      throw ApiException.validation("staffLoginId", "아이디 형식을 확인해 주세요.");
    return s;
  }
}
