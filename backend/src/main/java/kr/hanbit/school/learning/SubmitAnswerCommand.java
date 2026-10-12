package kr.hanbit.school.learning;

import java.util.UUID;
import kr.hanbit.school.content.AnswerChoice;

public record SubmitAnswerCommand(UUID requestId, int questionId, AnswerChoice choice) {}
