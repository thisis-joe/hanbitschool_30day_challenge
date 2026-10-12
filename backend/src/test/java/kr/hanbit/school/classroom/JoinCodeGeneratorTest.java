package kr.hanbit.school.classroom;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;

class JoinCodeGeneratorTest {
  @Test
  void codesUseEightUnambiguousRandomCharacters() throws Exception {
    var type = Class.forName("kr.hanbit.school.classroom.JoinCodeGenerator");
    var generator = type.getConstructor().newInstance();
    var codes = new java.util.HashSet<String>();
    for (int i = 0; i < 1000; i++) {
      var code = (String) type.getMethod("generate").invoke(generator);
      assertThat(code).matches("[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}");
      codes.add(code);
    }
    assertThat(codes).hasSize(1000);
  }
}
