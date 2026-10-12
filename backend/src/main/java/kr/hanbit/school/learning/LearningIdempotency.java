package kr.hanbit.school.learning;

import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.util.Optional;
import java.util.UUID;
import kr.hanbit.school.shared.web.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Service
public class LearningIdempotency {
  private final IdempotencyRecordRepository records;
  private final EntityManager entityManager;
  private final ObjectMapper json;
  private final Clock clock;

  public LearningIdempotency(
      IdempotencyRecordRepository records,
      EntityManager entityManager,
      ObjectMapper json,
      Clock clock) {
    this.records = records;
    this.entityManager = entityManager;
    this.json = json;
    this.clock = clock;
  }

  @Transactional(readOnly = true)
  public <T> Optional<T> replay(
      UUID studentId,
      IdempotencyOperation operation,
      UUID requestId,
      String payloadHash,
      Class<T> responseType) {
    var stored =
        records.findById(new IdempotencyRecordId(studentId, operation, requestId));
    if (stored.isEmpty()) return Optional.empty();
    if (!stored.get().getPayloadHash().equals(payloadHash))
      throw new ApiException(
          409, "IDEMPOTENCY_KEY_REUSED", "같은 요청 ID를 다른 요청에 사용할 수 없습니다.");
    return Optional.of(json.readValue(stored.get().getResponseJson(), responseType));
  }

  @Transactional
  public void record(
      UUID studentId,
      IdempotencyOperation operation,
      UUID requestId,
      String payloadHash,
      Object response) {
    entityManager.persist(
        new IdempotencyRecord(
            studentId,
            operation,
            requestId,
            payloadHash,
            json.writeValueAsString(response),
            clock.instant()));
    entityManager.flush();
  }
}
