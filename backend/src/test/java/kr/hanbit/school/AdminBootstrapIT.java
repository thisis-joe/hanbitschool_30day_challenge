package kr.hanbit.school;

import static org.assertj.core.api.Assertions.*;

import kr.hanbit.school.account.*;
import kr.hanbit.school.staff.*;
import kr.hanbit.school.support.PostgresTestConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.crypto.password.PasswordEncoder;

@SpringBootTest(properties = {"hanbit.bootstrap.id=", "hanbit.bootstrap.password="})
@Import(PostgresTestConfiguration.class)
class AdminBootstrapIT {
  @Autowired AccountRepository accounts;
  @Autowired PasswordEncoder encoder;
  @Autowired PasswordPolicy policy;

  @Test
  void initializeIsIdempotentAndNeverChangesExistingPassword() {
    var bootstrap =
        new AdminBootstrap(
            new AdminBootstrapProperties("hanbit.admin", "Hanbit!2026"), accounts, encoder, policy);
    bootstrap.initialize();
    var first = accounts.findByStaffLoginId("hanbit.admin");
    assertThat(first).isPresent();
    assertThat(encoder.matches("Hanbit!2026", first.get().getPasswordHash())).isTrue();
    new AdminBootstrap(
            new AdminBootstrapProperties("hanbit.admin", "Different!2026"),
            accounts,
            encoder,
            policy)
        .initialize();
    var second = accounts.findByStaffLoginId("hanbit.admin").orElseThrow();
    assertThat(second.getId()).isEqualTo(first.get().getId());
    assertThat(second.getPasswordHash()).isEqualTo(first.get().getPasswordHash());
  }

  @Test
  void partialCredentialsAreRejectedWithoutEchoingSecrets() {
    var b =
        new AdminBootstrap(
            new AdminBootstrapProperties("", "Private!2026"), accounts, encoder, policy);
    assertThatThrownBy(b::initialize)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageNotContaining("Private!2026");
  }
}
