package kr.hanbit.school.content;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "content_days")
public class ContentDay {
  @EmbeddedId private ContentDayId id;

  @Column(name = "title", nullable = false, columnDefinition = "text")
  private String title;

  protected ContentDay() {}

  public ContentDay(String version, int day, String title) {
    this.id = new ContentDayId(version, day);
    this.title = title;
  }

  public String getVersion() {
    return id.getVersion();
  }

  public int getDay() {
    return id.getDay();
  }

  public String getTitle() {
    return title;
  }
}
