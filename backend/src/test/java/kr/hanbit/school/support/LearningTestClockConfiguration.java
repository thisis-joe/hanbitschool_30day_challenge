package kr.hanbit.school.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

@TestConfiguration(proxyBeanMethods = false)
public class LearningTestClockConfiguration {
  @Bean
  @Primary
  MutableClock mutableClock() {
    return new MutableClock();
  }
}
