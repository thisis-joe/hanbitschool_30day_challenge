package kr.hanbit.school.staff;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("hanbit.bootstrap")
public record AdminBootstrapProperties(String id, String password) {}
