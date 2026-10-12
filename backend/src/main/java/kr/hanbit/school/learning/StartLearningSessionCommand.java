package kr.hanbit.school.learning;

import java.util.List;
import java.util.UUID;

public record StartLearningSessionCommand(
    LearningMode mode, Integer dayNumber, List<Integer> questionIds, UUID requestId) {}
