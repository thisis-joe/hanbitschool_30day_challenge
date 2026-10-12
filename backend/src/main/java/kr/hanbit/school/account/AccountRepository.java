package kr.hanbit.school.account;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccountRepository extends JpaRepository<Account, UUID> {
  Optional<Account> findByStaffLoginId(String staffLoginId);

  boolean existsBySchoolIdAndRole(UUID schoolId, Role role);

  java.util.List<Account> findBySchoolIdAndRoleOrderByName(UUID schoolId, Role role);

  @org.springframework.data.jpa.repository.Modifying(
      clearAutomatically = true,
      flushAutomatically = true)
  @org.springframework.transaction.annotation.Transactional
  @org.springframework.data.jpa.repository.Query(
      "update Account a set"
          + " a.passwordHash=:hash,a.passwordVersion=a.passwordVersion+1,a.mustChangePassword=false"
          + " where a.id=:id and a.passwordVersion=:version")
  int updatePassword(
      @org.springframework.data.repository.query.Param("id") UUID accountId,
      @org.springframework.data.repository.query.Param("version") int expectedVersion,
      @org.springframework.data.repository.query.Param("hash") String encodedPassword);
}
