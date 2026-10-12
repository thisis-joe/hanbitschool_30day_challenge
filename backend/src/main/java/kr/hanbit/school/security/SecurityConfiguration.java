package kr.hanbit.school.security;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Map;
import kr.hanbit.school.account.AccountRepository;
import kr.hanbit.school.shared.web.ApiError;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.*;
import org.springframework.security.web.csrf.*;
import org.springframework.security.web.savedrequest.NullRequestCache;
import tools.jackson.databind.ObjectMapper;

@Configuration
public class SecurityConfiguration {
  @Bean
  HttpSessionSecurityContextRepository contextRepository() {
    return new HttpSessionSecurityContextRepository();
  }

  @Bean
  CsrfTokenRepository csrfRepository() {
    return new HttpSessionCsrfTokenRepository();
  }

  @Bean
  UserDetailsService unusedFormAuthentication() {
    return name -> {
      throw new UsernameNotFoundException("폼 로그인은 사용하지 않습니다.");
    };
  }

  @Bean
  SecurityFilterChain chain(
      HttpSecurity http,
      HttpSessionSecurityContextRepository context,
      CsrfTokenRepository csrf,
      AccountRepository accounts,
      ObjectMapper json)
      throws Exception {
    http.formLogin(AbstractHttpConfigurer::disable)
        .httpBasic(AbstractHttpConfigurer::disable)
        .logout(AbstractHttpConfigurer::disable)
        .requestCache(c -> c.requestCache(new NullRequestCache()))
        .securityContext(c -> c.securityContextRepository(context).requireExplicitSave(true))
        .csrf(c -> c.csrfTokenRepository(csrf))
        .authorizeHttpRequests(
            a ->
                a.requestMatchers(
                        "/api/auth/csrf",
                        "/api/public/**",
                        "/api/auth/students/login",
                        "/api/auth/staff/login",
                        "/api/auth/students/register",
                        "/api/auth/logout")
                    .permitAll()
                    .requestMatchers("/api/admin/**")
                    .hasRole("ADMIN")
                    .requestMatchers("/api/staff/**")
                    .hasAnyRole("TEACHER", "ADMIN")
                    .anyRequest()
                    .authenticated())
        .exceptionHandling(
            e ->
                e.authenticationEntryPoint(
                        (req, res, ex) -> error(json, res, 401, "UNAUTHENTICATED", "로그인이 필요합니다."))
                    .accessDeniedHandler(
                        (req, res, ex) ->
                            error(
                                json,
                                res,
                                403,
                                ex instanceof CsrfException ? "INVALID_CSRF_TOKEN" : "FORBIDDEN",
                                ex instanceof CsrfException ? "요청을 다시 시도해 주세요." : "접근 권한이 없습니다.")))
        .addFilterAfter(
            new AccountSessionFilter(accounts, json), SecurityContextHolderFilter.class);
    return http.build();
  }

  private void error(
      ObjectMapper json, HttpServletResponse response, int status, String code, String message)
      throws IOException {
    response.setStatus(status);
    response.setContentType("application/json;charset=UTF-8");
    response.getWriter().write(json.writeValueAsString(new ApiError(code, message, Map.of())));
  }
}
