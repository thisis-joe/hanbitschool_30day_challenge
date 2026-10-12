package kr.hanbit.school.learning.xp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class XpPolicyTest {
  private final XpPolicy policy = new XpPolicy();

  @Test
  void firstAnswerUsesTheExactFinalAmountForEachStreakAndCatchUpCombination() {
    assertThat(policy.firstAnswer(false, 0, false)).isEqualTo(375);
    assertThat(policy.firstAnswer(false, 0, true)).isEqualTo(374);
    assertThat(policy.firstAnswer(true, 1, false)).isEqualTo(565);
    assertThat(policy.firstAnswer(true, 1, true)).isEqualTo(564);
    assertThat(policy.firstAnswer(true, 2, false)).isEqualTo(565);
    assertThat(policy.firstAnswer(true, 2, true)).isEqualTo(564);
    assertThat(policy.firstAnswer(true, 3, false)).isEqualTo(940);
    assertThat(policy.firstAnswer(true, 3, true)).isEqualTo(939);
    assertThat(policy.firstAnswer(true, 4, false)).isEqualTo(565);
    assertThat(policy.firstAnswer(true, 4, true)).isEqualTo(564);
    assertThat(policy.firstAnswer(true, 5, false)).isEqualTo(1315);
    assertThat(policy.firstAnswer(true, 5, true)).isEqualTo(1314);
  }

  @Test
  void aWrongAnswerIgnoresTheIncomingStreakBecauseTheResultingStreakIsReset() {
    assertThat(policy.firstAnswer(false, 3, false)).isEqualTo(375);
    assertThat(policy.firstAnswer(false, 5, true)).isEqualTo(374);
  }

  @Test
  void repeatAndFirstPassAmountsAreExact() {
    assertThat(policy.repeatAnswer()).isEqualTo(1);
    assertThat(policy.firstPass(false)).isEqualTo(1125);
    assertThat(policy.firstPass(true)).isEqualTo(1124);
  }

  @Test
  void levelUsesLongArithmeticAtEveryBoundary() {
    assertThat(policy.level(0)).isEqualTo(1);
    assertThat(policy.level(3749)).isEqualTo(1);
    assertThat(policy.level(3750)).isEqualTo(2);
    assertThat(policy.level(7499)).isEqualTo(2);
    assertThat(policy.level(7500)).isEqualTo(3);
    assertThat(policy.level(7_500_000_000L)).isEqualTo(2_000_001);
  }

  @Test
  void levelSupportsTheLargestIntLevelAndRejectsOverflowInsteadOfWrapping() {
    assertThat(policy.level(8_053_063_676_249L)).isEqualTo(Integer.MAX_VALUE);
    assertThatThrownBy(() -> policy.level(8_053_063_676_250L))
        .isInstanceOf(ArithmeticException.class);
    assertThatThrownBy(() -> policy.level(Long.MAX_VALUE))
        .isInstanceOf(ArithmeticException.class);
  }
}
