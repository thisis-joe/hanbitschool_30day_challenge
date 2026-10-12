package kr.hanbit.school.learning;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Embeddable
public class IdempotencyRecordId implements Serializable {
  @Column(name = "student_account_id", nullable = false)
  private UUID studentAccountId;

  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.VARCHAR)
  @Column(name = "operation", nullable = false, length = 20)
  private IdempotencyOperation operation;

  @Column(name = "request_id", nullable = false)
  private UUID requestId;

  protected IdempotencyRecordId() {}

  public IdempotencyRecordId(
      UUID studentAccountId, IdempotencyOperation operation, UUID requestId) {
    this.studentAccountId = studentAccountId;
    this.operation = operation;
    this.requestId = requestId;
  }

  public UUID getStudentAccountId() {
    return studentAccountId;
  }

  public IdempotencyOperation getOperation() {
    return operation;
  }

  public UUID getRequestId() {
    return requestId;
  }

  @Override
  public boolean equals(Object other) {
    if (this == other) return true;
    if (!(other instanceof IdempotencyRecordId that)) return false;
    return Objects.equals(studentAccountId, that.studentAccountId)
        && operation == that.operation
        && Objects.equals(requestId, that.requestId);
  }

  @Override
  public int hashCode() {
    return Objects.hash(studentAccountId, operation, requestId);
  }
}
