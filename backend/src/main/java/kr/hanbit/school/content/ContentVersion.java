package kr.hanbit.school.content;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "content_versions")
public class ContentVersion {
  @Id
  @Column(name = "version", nullable = false, length = 100)
  private String version;

  @Column(name = "digest", nullable = false, length = 64)
  private String digest;

  @Column(name = "active", nullable = false)
  private boolean active;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt;

  protected ContentVersion() {}

  public ContentVersion(String version, String digest, boolean active) {
    this.version = version;
    this.digest = digest;
    this.active = active;
    this.createdAt = Instant.now();
  }

  public String getVersion() {
    return version;
  }

  public String getDigest() {
    return digest;
  }

  public boolean isActive() {
    return active;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
