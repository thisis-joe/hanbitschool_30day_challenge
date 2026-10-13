package kr.hanbit.school.game;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Embeddable
public class StudentEquipmentId implements Serializable {
  @Column(name = "student_account_id", nullable = false)
  private UUID studentAccountId;

  @Column(name = "slot", nullable = false, length = 20)
  private String slot;

  protected StudentEquipmentId() {}

  public StudentEquipmentId(UUID studentAccountId, String slot) {
    this.studentAccountId = studentAccountId;
    this.slot = slot;
  }

  public String getSlot() {
    return slot;
  }

  @Override
  public boolean equals(Object other) {
    if (this == other) return true;
    if (!(other instanceof StudentEquipmentId that)) return false;
    return Objects.equals(studentAccountId, that.studentAccountId) && Objects.equals(slot, that.slot);
  }

  @Override
  public int hashCode() {
    return Objects.hash(studentAccountId, slot);
  }
}
