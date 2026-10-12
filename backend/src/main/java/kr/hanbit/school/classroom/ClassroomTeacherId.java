package kr.hanbit.school.classroom;

import jakarta.persistence.*;
import java.io.Serializable;
import java.util.UUID;

@Embeddable
public record ClassroomTeacherId(
    @Column(name = "classroom_id") UUID classroomId,
    @Column(name = "teacher_account_id") UUID teacherAccountId)
    implements Serializable {}
