package kr.hanbit.school.classroom;

import jakarta.persistence.*;
import java.time.*;
import java.util.UUID;

@Entity
@Table(name = "schools")
public class School {
  @Id
  @Column(name = "id", nullable = false)
  private UUID id;

  @Column(name = "name", nullable = false, length = 100)
  private String name;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  protected School() {}

  public School(UUID id, String name) {
    this.id = id;
    this.name = name;
    this.createdAt = Instant.now();
  }

  public UUID getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
