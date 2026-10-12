package kr.hanbit.school.content;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.io.Serializable;
import java.util.Objects;

@Embeddable
public class ContentDayId implements Serializable {
  @Column(name = "version", nullable = false, length = 100)
  private String version;

  @Column(name = "day", nullable = false)
  private int day;

  protected ContentDayId() {}

  public ContentDayId(String version, int day) {
    this.version = version;
    this.day = day;
  }

  public String getVersion() {
    return version;
  }

  public int getDay() {
    return day;
  }

  @Override
  public boolean equals(Object other) {
    if (this == other) return true;
    if (!(other instanceof ContentDayId that)) return false;
    return day == that.day && Objects.equals(version, that.version);
  }

  @Override
  public int hashCode() {
    return Objects.hash(version, day);
  }
}
