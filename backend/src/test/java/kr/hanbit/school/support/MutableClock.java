package kr.hanbit.school.support;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Objects;

public final class MutableClock extends Clock {
  public static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

  private Instant instant = Instant.EPOCH;
  private final ZoneId zone;

  public MutableClock() {
    this(SEOUL);
  }

  private MutableClock(ZoneId zone) {
    this.zone = Objects.requireNonNull(zone);
  }

  public void setInstant(Instant instant) {
    this.instant = Objects.requireNonNull(instant);
  }

  @Override
  public ZoneId getZone() {
    return zone;
  }

  @Override
  public Clock withZone(ZoneId zone) {
    var clock = new MutableClock(zone);
    clock.setInstant(instant);
    return clock;
  }

  @Override
  public Instant instant() {
    return instant;
  }
}
