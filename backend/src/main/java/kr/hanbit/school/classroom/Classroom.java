package kr.hanbit.school.classroom;

import jakarta.persistence.*;
import java.time.*;
import java.util.UUID;

@Entity
@Table(name = "classrooms")
public class Classroom {
  @Id
  @Column(name = "id", nullable = false)
  private UUID id;

  @Column(name = "school_id", nullable = false)
  private UUID schoolId;

  @Column(name = "grade_label", nullable = false, length = 20)
  private String gradeLabel;

  @Column(name = "class_number", nullable = false)
  private int classNumber;

  @Column(name = "join_code", nullable = false, length = 8)
  private String joinCode;

  @Column(name = "start_date", nullable = false)
  private LocalDate startDate;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  protected Classroom() {}

  public Classroom(
      UUID id,
      UUID schoolId,
      String gradeLabel,
      int classNumber,
      String joinCode,
      LocalDate startDate) {
    this.id = id;
    this.schoolId = schoolId;
    this.gradeLabel = gradeLabel;
    this.classNumber = classNumber;
    this.joinCode = joinCode;
    this.startDate = startDate;
    this.createdAt = Instant.now();
  }

  public UUID getId() {
    return id;
  }

  public UUID getSchoolId() {
    return schoolId;
  }

  public String getGradeLabel() {
    return gradeLabel;
  }

  public int getClassNumber() {
    return classNumber;
  }

  public String getJoinCode() {
    return joinCode;
  }

  public LocalDate getStartDate() {
    return startDate;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
