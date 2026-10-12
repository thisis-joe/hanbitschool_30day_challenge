package kr.hanbit.school.learning.xp;

import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class JpaXpLedger implements XpLedger {
  private final XpEntryRepository entries;
  private final XpPolicy policy;

  public JpaXpLedger(XpEntryRepository entries, XpPolicy policy) {
    this.entries = entries;
    this.policy = policy;
  }

  @Override
  @Transactional(readOnly = true)
  public XpSummary summary(UUID studentAccountId) {
    long totalXp = entries.sumAmountByStudentAccountId(studentAccountId);
    return new XpSummary(totalXp, policy.level(totalXp));
  }
}
