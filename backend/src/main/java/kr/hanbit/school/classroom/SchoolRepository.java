package kr.hanbit.school.classroom;

import java.util.*;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SchoolRepository extends JpaRepository<School, UUID> {
  java.util.List<School> findAllByOrderByName();
}
