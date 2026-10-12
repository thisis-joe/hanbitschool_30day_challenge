package kr.hanbit.school.security;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.*;
import kr.hanbit.school.account.AccountRepository;
import kr.hanbit.school.shared.web.*;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

public class AccountSessionFilter extends OncePerRequestFilter {
  private final AccountRepository accounts;
  private final ObjectMapper json;
  private static final Set<String> CHANGE_ALLOWED =
      Set.of("/api/auth/me", "/api/auth/password", "/api/auth/logout", "/api/auth/csrf");

  public AccountSessionFilter(AccountRepository a, ObjectMapper j) {
    accounts = a;
    json = j;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    var auth = SecurityContextHolder.getContext().getAuthentication();
    if (auth != null && auth.getPrincipal() instanceof AccountPrincipal p) {
      var a = accounts.findById(p.accountId()).orElse(null);
      if (a == null
          || a.getRole() != p.role()
          || !a.getSchoolId().equals(p.schoolId())
          || a.getPasswordVersion() != p.passwordVersion()) {
        var s = request.getSession(false);
        if (s != null) s.invalidate();
        SecurityContextHolder.clearContext();
        error(response, 401, "UNAUTHENTICATED", "다시 로그인해 주세요.");
        return;
      }
      if (a.isMustChangePassword() && !CHANGE_ALLOWED.contains(request.getRequestURI())) {
        error(response, 403, "PASSWORD_CHANGE_REQUIRED", "비밀번호를 먼저 변경해 주세요.");
        return;
      }
    }
    chain.doFilter(request, response);
  }

  private void error(HttpServletResponse response, int status, String code, String message)
      throws IOException {
    response.setStatus(status);
    response.setContentType("application/json;charset=UTF-8");
    response.getWriter().write(json.writeValueAsString(new ApiError(code, message, Map.of())));
  }
}
