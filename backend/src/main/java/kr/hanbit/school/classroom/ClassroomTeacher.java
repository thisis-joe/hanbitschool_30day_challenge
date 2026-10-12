package kr.hanbit.school.classroom;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "classroom_teachers")
public class ClassroomTeacher {
  @EmbeddedId private ClassroomTeacherId id;

  protected ClassroomTeacher() {}

  public ClassroomTeacher(UUID classroomId, UUID teacherAccountId) {
    id = new ClassroomTeacherId(classroomId, teacherAccountId);
  }

  public ClassroomTeacherId getId() {
    return id;
  }
}
