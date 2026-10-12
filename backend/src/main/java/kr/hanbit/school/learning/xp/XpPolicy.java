package kr.hanbit.school.learning.xp;

import org.springframework.stereotype.Component;

@Component
public class XpPolicy {
  private static final long XP_PER_LEVEL = 3_750L;

  public int firstAnswer(boolean correct, int resultingStreak, boolean catchUp) {
    int amount = 375;
    if (correct) {
      amount += 190;
      if (resultingStreak == 5) {
        amount += 750;
      } else if (resultingStreak == 3) {
        amount += 375;
      }
    }
    return catchUp ? amount - 1 : amount;
  }

  public int repeatAnswer() {
    return 1;
  }

  public int firstPass(boolean catchUp) {
    return catchUp ? 1_124 : 1_125;
  }

  public int level(long totalXp) {
    return Math.toIntExact(totalXp / XP_PER_LEVEL + 1L);
  }
}
