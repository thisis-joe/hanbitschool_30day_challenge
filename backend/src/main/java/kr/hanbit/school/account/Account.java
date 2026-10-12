package kr.hanbit.school.account;

import jakarta.persistence.*;
import java.time.*;
import java.util.UUID;

@Entity
@Table(name = "accounts")
public class Account {
  @Id
  @Column(name = "id", nullable = false)
  private UUID id;

  @Column(name = "school_id", nullable = false)
  private UUID schoolId;

  @Enumerated(EnumType.STRING)
  @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.VARCHAR)
  @Column(name = "role", nullable = false, length = 10)
  private Role role;

  @Column(name = "name", nullable = false, length = 50)
  private String name;

  @Column(name = "staff_login_id", nullable = true, length = 40)
  private String staffLoginId;

  @Column(name = "password_hash", nullable = false, length = 255)
  private String passwordHash;

  @Column(name = "password_version", nullable = false)
  private int passwordVersion;

  @Column(name = "must_change_password", nullable = false)
  private boolean mustChangePassword;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  protected Account() {}

  public Account(
      UUID id,
      UUID schoolId,
      Role role,
      String name,
      String staffLoginId,
      String passwordHash,
      boolean mustChangePassword) {
    this.id = id;
    this.schoolId = schoolId;
    this.role = role;
    this.name = name;
    this.staffLoginId = staffLoginId;
    this.passwordHash = passwordHash;
    this.passwordVersion = 1;
    this.mustChangePassword = mustChangePassword;
    this.createdAt = Instant.now();
  }

  public UUID getId() {
    return id;
  }

  public UUID getSchoolId() {
    return schoolId;
  }

  public Role getRole() {
    return role;
  }

  public String getName() {
    return name;
  }

  public String getStaffLoginId() {
    return staffLoginId;
  }

  public String getPasswordHash() {
    return passwordHash;
  }

  public int getPasswordVersion() {
    return passwordVersion;
  }

  public boolean isMustChangePassword() {
    return mustChangePassword;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
