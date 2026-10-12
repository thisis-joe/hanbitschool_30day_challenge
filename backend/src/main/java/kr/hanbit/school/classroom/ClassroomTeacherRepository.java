package kr.hanbit.school.classroom;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClassroomTeacherRepository
    extends JpaRepository<ClassroomTeacher, ClassroomTeacherId> {
  boolean existsByIdClassroomIdAndIdTeacherAccountId(UUID classroomId, UUID teacherAccountId);
}
