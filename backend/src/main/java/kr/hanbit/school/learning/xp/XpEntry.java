package kr.hanbit.school.learning.xp;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Immutable
@Table(name = "xp_entries")
public class XpEntry {
  public static final String RULE_VERSION = "learning-v1";

  @Id
  @Column(name = "id", nullable = false, updatable = false)
  private UUID id;

  @Column(name = "student_account_id", nullable = false, updatable = false)
  private UUID studentAccountId;

  @Enumerated(EnumType.STRING)
  @JdbcTypeCode(SqlTypes.VARCHAR)
  @Column(name = "kind", nullable = false, length = 20, updatable = false)
  private XpKind kind;

  @Column(name = "source_id", nullable = false, updatable = false)
  private UUID sourceId;

  @Column(name = "amount", nullable = false, updatable = false)
  private int amount;

  @Column(name = "rule_version", nullable = false, length = 30, updatable = false)
  private String ruleVersion;

  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;

  protected XpEntry() {}

  public XpEntry(
      UUID id,
      UUID studentAccountId,
      XpKind kind,
      UUID sourceId,
      int amount,
      Instant createdAt) {
    this.id = id;
    this.studentAccountId = studentAccountId;
    this.kind = kind;
    this.sourceId = sourceId;
    this.amount = amount;
    this.ruleVersion = RULE_VERSION;
    this.createdAt = createdAt.truncatedTo(ChronoUnit.MICROS);
  }

  public UUID getId() {
    return id;
  }

  public UUID getStudentAccountId() {
    return studentAccountId;
  }

  public XpKind getKind() {
    return kind;
  }

  public UUID getSourceId() {
    return sourceId;
  }

  public int getAmount() {
    return amount;
  }

  public String getRuleVersion() {
    return ruleVersion;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
