package kr.hanbit.school.staff;

import java.util.Locale;
import java.util.UUID;
import kr.hanbit.school.account.*;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
@EnableConfigurationProperties(AdminBootstrapProperties.class)
public class AdminBootstrap implements ApplicationRunner {
  public static final UUID SCHOOL_ID = UUID.fromString("00000000-0000-4000-8000-000000000001");
  private final AdminBootstrapProperties properties;
  private final AccountRepository accounts;
  private final PasswordEncoder encoder;
  private final PasswordPolicy policy;

  public AdminBootstrap(
      AdminBootstrapProperties properties,
      AccountRepository accounts,
      PasswordEncoder encoder,
      PasswordPolicy policy) {
    this.properties = properties;
    this.accounts = accounts;
    this.encoder = encoder;
    this.policy = policy;
  }

  public void run(ApplicationArguments args) {
    initialize();
  }

  public void initialize() {
    var id = properties.id() == null ? "" : properties.id().trim().toLowerCase(Locale.ROOT);
    var password = properties.password() == null ? "" : properties.password();
    if (id.isEmpty() && password.isEmpty()) return;
    if (id.isEmpty() || password.isEmpty())
      throw new IllegalStateException("관리자 초기화 설정을 모두 입력해 주세요.");
    if (accounts.existsBySchoolIdAndRole(SCHOOL_ID, Role.ADMIN)) return;
    if (!id.matches("[a-z0-9][a-z0-9._-]{2,39}"))
      throw new IllegalStateException("관리자 ID 형식을 확인해 주세요.");
    policy.validate(password);
    accounts.saveAndFlush(
        new Account(
            UUID.randomUUID(), SCHOOL_ID, Role.ADMIN, "관리자", id, encoder.encode(password), false));
  }
}
