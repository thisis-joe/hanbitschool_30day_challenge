package kr.hanbit.school.game;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StudentEquipmentRepository
    extends JpaRepository<StudentEquipment, StudentEquipmentId> {
  List<StudentEquipment> findByIdStudentAccountId(UUID studentAccountId);
}
