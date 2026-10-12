package kr.hanbit.school.support;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import jakarta.persistence.EntityManager;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** Two independent request threads, both proven to wait on the same real PostgreSQL row. */
public final class LearningRaceHarness {
  private final DataSource dataSource;
  private final JdbcTemplate jdbc;
  private final EntityManager entities;
  private final TransactionTemplate reads;

  public LearningRaceHarness(
      DataSource dataSource,
      JdbcTemplate jdbc,
      EntityManager entities,
      PlatformTransactionManager transactions) {
    this.dataSource = dataSource;
    this.jdbc = jdbc;
    this.entities = entities;
    reads = new TransactionTemplate(transactions);
    reads.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    reads.setReadOnly(true);
  }

  public <T> List<T> raceSession(UUID sessionId, Callable<T> left, Callable<T> right)
      throws Exception {
    return race("learning_sessions", "id", sessionId, left, right);
  }

  public <T> List<T> raceStudent(UUID studentId, Callable<T> left, Callable<T> right)
      throws Exception {
    return race("student_profiles", "account_id", studentId, left, right);
  }

  private <T> List<T> race(String table, String key, UUID id, Callable<T> left, Callable<T> right)
      throws Exception {
    var barrier = new CyclicBarrier(2);
    try (var gate = dataSource.getConnection()) {
      gate.setAutoCommit(false);
      int gatePid;
      try (var statement = gate.createStatement();
          var result = statement.executeQuery("select pg_backend_pid()")) {
        result.next();
        gatePid = result.getInt(1);
      }
      try (var statement =
          gate.prepareStatement(
              "select " + key + " from " + table + " where " + key + "=? for update")) {
        statement.setObject(1, id);
        try (var result = statement.executeQuery()) {
          assertThat(result.next()).isTrue();
        }
      }
      try (var pool = Executors.newFixedThreadPool(2)) {
        var a =
            pool.submit(
                () -> {
                  barrier.await(5, TimeUnit.SECONDS);
                  return left.call();
                });
        var b =
            pool.submit(
                () -> {
                  barrier.await(5, TimeUnit.SECONDS);
                  return right.call();
                });
        try {
          await()
              .atMost(Duration.ofSeconds(5))
              .until(
                  () ->
                      jdbc.queryForObject(
                              "with recursive blocked(pid) as (values (?::int) union select a.pid"
                                  + " from pg_stat_activity a join blocked b on"
                                  + " b.pid=any(pg_blocking_pids(a.pid))) select count(*) from"
                                  + " blocked b join pg_stat_activity a on a.pid=b.pid where"
                                  + " b.pid<>? and a.query like 'select%' and position(? in"
                                  + " a.query)>0 and (a.query like '%for no key update%' or a.query"
                                  + " like '%for update%')",
                              Integer.class, gatePid, gatePid, table)
                          == 2);
        } finally {
          // Release the gate before executor close waits, including when an assertion fails.
          gate.rollback();
        }
        return java.util.Arrays.asList(a.get(10, TimeUnit.SECONDS), b.get(10, TimeUnit.SECONDS));
      }
    }
  }

  public <T> T fresh(Supplier<T> query) {
    return reads.execute(
        status -> {
          entities.clear();
          return query.get();
        });
  }
}
