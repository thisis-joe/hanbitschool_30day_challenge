package kr.hanbit.school.learning;

import java.time.LocalDate;
import java.util.UUID;

public record StudentLearningContext(
    UUID studentAccountId, UUID classroomId, LocalDate startDate) {}
