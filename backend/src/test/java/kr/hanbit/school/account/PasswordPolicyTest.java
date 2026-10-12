package kr.hanbit.school.account;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.Test;

class PasswordPolicyTest {
  final PasswordPolicy policy = new PasswordPolicy();

  @Test
  void shortPasswordIsRejected() {
    assertThatThrownBy(() -> policy.validate("1234567"))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void unicodeByteOverflowIsRejected() {
    assertThatThrownBy(() -> policy.validate("한".repeat(25)))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void validPasswordAndSpaceArePreserved() {
    assertThatCode(() -> policy.validate(" Hanbit!2026 ")).doesNotThrowAnyException();
  }
}
