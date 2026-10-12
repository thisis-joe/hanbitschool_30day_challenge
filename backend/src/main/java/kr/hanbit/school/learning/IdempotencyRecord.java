package kr.hanbit.school.learning;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.Immutable;
import org.hibernate.type.SqlTypes;

@Entity
@Immutable
@Table(name = "idempotency_records")
public class IdempotencyRecord {
  @EmbeddedId private IdempotencyRecordId id;

  @JdbcTypeCode(SqlTypes.CHAR)
  @Column(name = "payload_hash", nullable = false, length = 64, columnDefinition = "char(64)")
  private String payloadHash;

  @JdbcTypeCode(SqlTypes.JSON)
  @Column(name = "response_json", nullable = false, columnDefinition = "jsonb")
  private String responseJson;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  protected IdempotencyRecord() {}

  public IdempotencyRecord(
      UUID studentAccountId,
      IdempotencyOperation operation,
      UUID requestId,
      String payloadHash,
      String responseJson,
      Instant createdAt) {
    this.id = new IdempotencyRecordId(studentAccountId, operation, requestId);
    this.payloadHash = payloadHash;
    this.responseJson = responseJson;
    this.createdAt = LearningTime.persistable(createdAt);
  }

  public UUID getStudentAccountId() {
    return id.getStudentAccountId();
  }

  public IdempotencyOperation getOperation() {
    return id.getOperation();
  }

  public UUID getRequestId() {
    return id.getRequestId();
  }

  public String getPayloadHash() {
    return payloadHash;
  }

  public String getResponseJson() {
    return responseJson;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
