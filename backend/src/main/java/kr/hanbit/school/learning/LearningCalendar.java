package kr.hanbit.school.learning;

import java.time.Clock;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import org.springframework.stereotype.Component;

@Component
public class LearningCalendar {
  private final Clock clock;

  public LearningCalendar(Clock clock) {
    this.clock = clock;
  }

  public int calendarCap(LocalDate startDate) {
    return calendarCap(startDate, LocalDate.now(clock));
  }

  public int calendarCap(LocalDate startDate, LocalDate today) {
    long day = ChronoUnit.DAYS.between(startDate, today) + 1;
    return (int) Math.clamp(day, 0, 30);
  }

  public boolean isCatchUp(int dayNumber, int calendarCap) {
    return dayNumber < calendarCap;
  }
}
