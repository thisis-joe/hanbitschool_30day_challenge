package kr.hanbit.school.shared.web;

public record ApiError(String code, String message, java.util.Map<String, String> fieldErrors) {}
