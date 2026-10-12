package kr.hanbit.school.content;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class QuestionTimeLimitTest {
  private final QuestionTimeLimit limits = new QuestionTimeLimit();

  @ParameterizedTest(name = "{0} non-whitespace code points -> {1} seconds")
  @MethodSource("boundaries")
  void assignsSecondsAtEveryLengthBoundary(int length, int seconds) {
    assertThat(limits.secondsFor("가".repeat(length))).isEqualTo(seconds);
  }

  static Stream<Arguments> boundaries() {
    return Stream.of(
        Arguments.of(0, 10),
        Arguments.of(12, 10),
        Arguments.of(13, 11),
        Arguments.of(16, 11),
        Arguments.of(17, 12),
        Arguments.of(20, 12),
        Arguments.of(21, 13),
        Arguments.of(25, 13),
        Arguments.of(26, 14),
        Arguments.of(31, 14),
        Arguments.of(32, 15));
  }

  @ParameterizedTest
  @MethodSource("whitespaceExamples")
  void ignoresWhitespaceAndCountsUnicodeCodePoints(String text, int seconds) {
    assertThat(limits.secondsFor(text)).isEqualTo(seconds);
  }

  static Stream<Arguments> whitespaceExamples() {
    return Stream.of(
        Arguments.of("가".repeat(12) + " \t\n", 10),
        Arguments.of("가".repeat(12) + " \t\n나", 11),
        Arguments.of("가".repeat(11) + "😀", 10));
  }
}
