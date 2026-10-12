package kr.hanbit.school.learning;

import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

public final class LearningTime {
  private LearningTime() {}

  public static Instant persistable(Instant instant) {
    return instant.truncatedTo(ChronoUnit.MICROS);
  }

  public static Instant deadline(Clock clock, int seconds) {
    return persistable(clock.instant().plusSeconds(seconds));
  }
}
