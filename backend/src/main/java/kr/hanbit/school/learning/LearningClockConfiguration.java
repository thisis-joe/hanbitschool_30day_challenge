package kr.hanbit.school.learning;

import java.time.Clock;
import java.time.ZoneId;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class LearningClockConfiguration {
  public static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

  @Bean
  @ConditionalOnMissingBean(Clock.class)
  Clock learningClock() {
    return Clock.system(SEOUL);
  }
}
