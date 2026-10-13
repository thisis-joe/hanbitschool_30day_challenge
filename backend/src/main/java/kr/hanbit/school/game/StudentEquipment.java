package kr.hanbit.school.game;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;

@Entity
@Table(name = "student_equipment")
public class StudentEquipment {
  @EmbeddedId private StudentEquipmentId id;

  @Column(name = "item_id", length = 30)
  private String itemId;

  protected StudentEquipment() {}

  public StudentEquipment(UUID studentAccountId, String slot, String itemId) {
    this.id = new StudentEquipmentId(studentAccountId, slot);
    this.itemId = itemId;
  }

  public String getSlot() {
    return id.getSlot();
  }

  public String getItemId() {
    return itemId;
  }
}
