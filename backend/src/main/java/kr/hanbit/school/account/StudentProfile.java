package kr.hanbit.school.account;

import jakarta.persistence.*;
import java.time.*;
import java.util.UUID;

@Entity
@Table(name = "student_profiles")
public class StudentProfile {
  @Id
  @Column(name = "account_id", nullable = false)
  private UUID accountId;

  @Column(name = "classroom_id", nullable = false)
  private UUID classroomId;

  @Column(name = "student_number", nullable = false)
  private int studentNumber;

  @Column(name = "nickname", nullable = false, length = 20)
  private String nickname;

  protected StudentProfile() {}

  public StudentProfile(UUID accountId, UUID classroomId, int studentNumber, String nickname) {
    this.accountId = accountId;
    this.classroomId = classroomId;
    this.studentNumber = studentNumber;
    this.nickname = nickname;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public UUID getClassroomId() {
    return classroomId;
  }

  public int getStudentNumber() {
    return studentNumber;
  }

  public String getNickname() {
    return nickname;
  }
}
