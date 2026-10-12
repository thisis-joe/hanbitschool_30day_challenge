package kr.hanbit.school.learning;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.time.LocalDate;
import kr.hanbit.school.support.MutableClock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class LearningCalendarTest {
  private final MutableClock clock = new MutableClock();
  private final LearningCalendar calendar = new LearningCalendar(clock);

  @BeforeEach
  void setTime() {
    clock.setInstant(Instant.parse("2026-10-12T00:00:00Z"));
  }

  @Test
  void calendarCapIsClampedBeforeStartAndAfterDayThirty() {
    var start = LocalDate.of(2026, 10, 12);

    assertThat(calendar.calendarCap(start, LocalDate.of(2026, 10, 11))).isZero();
    assertThat(calendar.calendarCap(start, start)).isEqualTo(1);
    assertThat(calendar.calendarCap(start, LocalDate.of(2026, 11, 10))).isEqualTo(30);
    assertThat(calendar.calendarCap(start, LocalDate.of(2026, 11, 11))).isEqualTo(30);
    assertThat(calendar.calendarCap(start, LocalDate.of(2026, 11, 30))).isEqualTo(30);
  }

  @Test
  void currentDateChangesAtSeoulMidnight() {
    var start = LocalDate.of(2026, 10, 12);
    clock.setInstant(Instant.parse("2026-10-11T14:59:59.999999999Z"));
    assertThat(calendar.calendarCap(start)).isZero();

    clock.setInstant(Instant.parse("2026-10-11T15:00:00Z"));
    assertThat(calendar.calendarCap(start)).isEqualTo(1);
  }

  @Test
  void onlyDaysBelowTheCalendarCapAreCatchUpDays() {
    assertThat(calendar.isCatchUp(1, 2)).isTrue();
    assertThat(calendar.isCatchUp(2, 2)).isFalse();
  }

  @Test
  void deadlinesAreTruncatedToPostgresMicrosecondPrecision() {
    clock.setInstant(Instant.parse("2026-10-12T00:00:00.123456789Z"));

    assertThat(LearningTime.deadline(clock, 10))
        .isEqualTo(Instant.parse("2026-10-12T00:00:10.123456Z"));
  }
}
