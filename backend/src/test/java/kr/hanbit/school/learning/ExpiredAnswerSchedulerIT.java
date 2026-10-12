package kr.hanbit.school.learning;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.atomic.AtomicInteger;
import kr.hanbit.school.support.LearningAnswerTestSupport;
import kr.hanbit.school.support.LearningTestClockConfiguration;
import kr.hanbit.school.support.PostgresTestConfiguration;
import kr.hanbit.school.support.SessionTestClient;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.MockMvcPrint;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@SpringBootTest(
    properties = {
      "hanbit.bootstrap.id=",
      "hanbit.bootstrap.password=",
      "hanbit.learning.expiry-enabled=true",
      "hanbit.learning.expiry-delay-ms=50"
    })
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@Import({
  PostgresTestConfiguration.class,
  LearningTestClockConfiguration.class,
  SessionTestClient.class,
  ExpiredAnswerSchedulerIT.TickConfiguration.class
})
class ExpiredAnswerSchedulerIT extends LearningAnswerTestSupport {
  @Autowired ApplicationContext context;
  @Autowired ObservedScheduler ticks;

  @Test
  void realSchedulerRunsAtLeastTwoTicksAndTimeoutFactsAndFeedbackStayExactlyStable()
      throws Exception {
    assertThat(context.containsBean("expiredLearningSessionScheduler")).isTrue();
    var student = learning.student(LocalDate.of(2026, 10, 12));
    var login = client.loginStudent(student);
    var started = startDay(login, 1, UUID.randomUUID());
    var id = sessionId(started);
    var deadline = deadline(node(started));
    var observedAt = deadline.plusNanos(1);
    final int baseline = ticks.completed.get();
    clock.setInstant(observedAt);
    await()
        .atMost(Duration.ofSeconds(5))
        .untilAsserted(
            () -> {
              assertThat(ticks.completed.get()).isGreaterThanOrEqualTo(baseline + 2);
              assertThat(learning.count("first_answers", student)).isEqualTo(1);
            });
    var fact = jdbc.queryForMap("select * from first_answers where session_id=?", id);
    assertThat(fact.get("request_id")).isEqualTo(ExpiryRequestId.forQuestion(id, 1, deadline));
    assertThat(fact.get("choice")).isNull();
    assertThat(fact.get("timed_out")).isEqualTo(true);
    assertThat(fact.get("correct")).isEqualTo(false);
    assertThat(((java.sql.Timestamp) fact.get("answered_at")).toInstant()).isEqualTo(deadline);
    assertThat(fact.get("response_millis"))
        .isEqualTo(content.requireQuestion("hanbit-v1", 1).getTimeLimitSeconds() * 1000L);
    var projection =
        jdbc.queryForMap("select * from last_answers where student_account_id=?", student.getId());
    assertThat(projection.get("source_id")).isEqualTo(fact.get("id"));
    assertThat(projection.get("outcome")).isEqualTo("TIMED_OUT");
    var feedback = node(session(login, id)).path("lastAnswer");
    assertThat(feedback.path("outcome").asString()).isEqualTo("TIMED_OUT");
    assertThat(feedback.path("xpAwarded").asInt()).isEqualTo(375);
    assertThat(feedback.path("totalXp").asLong()).isEqualTo(375);
    assertThat(feedback.path("level").asInt()).isEqualTo(1);
    assertThat(feedback.path("correctChoice").asString()).isEqualTo("O");
    assertThat(feedback.path("explanation").asString())
        .isEqualTo(content.requireQuestion("hanbit-v1", 1).getExplanation());
    var stable =
        jdbc.queryForList(
            "select * from idempotency_records where student_account_id=? order by"
                + " operation,request_id",
            student.getId());
    final int later = ticks.completed.get();
    await().atMost(Duration.ofSeconds(5)).until(() -> ticks.completed.get() >= later + 2);
    assertThat(jdbc.queryForMap("select * from first_answers where session_id=?", id))
        .isEqualTo(fact);
    assertThat(
            jdbc.queryForMap(
                "select * from last_answers where student_account_id=?", student.getId()))
        .isEqualTo(projection);
    assertThat(node(session(login, id)).path("lastAnswer")).isEqualTo(feedback);
    assertThat(
            jdbc.queryForList(
                "select * from idempotency_records where student_account_id=? order by"
                    + " operation,request_id",
                student.getId()))
        .isEqualTo(stable);
    for (var table : List.of("first_answers", "last_answers", "xp_entries", "review_queue_entries"))
      assertThat(learning.count(table, student)).as(table).isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "select amount from xp_entries where source_id=?", Integer.class, fact.get("id")))
        .isEqualTo(375);
    assertThat(learning.count("review_attempts", student)).isZero();
  }

  @TestConfiguration(proxyBeanMethods = false)
  static class TickConfiguration {
    @Bean
    ObservedScheduler taskScheduler() {
      return new ObservedScheduler();
    }
  }

  /** Instrument the real scheduled Runnable; no mocked worker or manually invoked tick. */
  static class ObservedScheduler extends ThreadPoolTaskScheduler {
    final AtomicInteger completed = new AtomicInteger();

    private Runnable observe(Runnable task) {
      return () -> {
        task.run();
        completed.incrementAndGet();
      };
    }

    @Override
    public ScheduledFuture<?> scheduleWithFixedDelay(
        Runnable task, Instant startTime, Duration delay) {
      return super.scheduleWithFixedDelay(observe(task), startTime, delay);
    }

    @Override
    public ScheduledFuture<?> scheduleWithFixedDelay(Runnable task, Duration delay) {
      return super.scheduleWithFixedDelay(observe(task), delay);
    }
  }
}
