package kr.hanbit.school.learning.xp;

import java.util.UUID;

public interface XpLedger {
  XpSummary summary(UUID studentAccountId);
}
