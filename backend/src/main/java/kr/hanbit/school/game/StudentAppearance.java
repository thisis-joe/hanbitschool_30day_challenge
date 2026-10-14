package kr.hanbit.school.game;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import kr.hanbit.school.learning.LearningTime;

@Entity
@Table(name = "student_appearances")
public class StudentAppearance {
  @Id
  @Column(name = "student_account_id", nullable = false)
  private UUID studentAccountId;

  @Column(name = "character_id", length = 20)
  private String characterId;

  @Column(name = "revision", nullable = false)
  private long revision;

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  protected StudentAppearance() {}

  public StudentAppearance(
      UUID studentAccountId, String characterId, long revision, Instant updatedAt) {
    this.studentAccountId = studentAccountId;
    this.characterId = characterId;
    this.revision = revision;
    this.updatedAt = LearningTime.persistable(updatedAt);
  }

  public String getCharacterId() {
    return characterId;
  }

  public long getRevision() {
    return revision;
  }

  void change(String characterId, Instant updatedAt) {
    this.characterId = characterId;
    this.revision++;
    this.updatedAt = LearningTime.persistable(updatedAt);
  }
}
