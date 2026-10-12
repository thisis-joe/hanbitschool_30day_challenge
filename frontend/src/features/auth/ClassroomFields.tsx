import { useQuery } from '@tanstack/react-query';
import { getSchools, getClassrooms } from './api';
import type { ClassroomSelection } from './types';
import { errorMessage } from '../../lib/http';
export function ClassroomFields({
  value,
  onChange,
}: {
  value: ClassroomSelection;
  onChange: (value: ClassroomSelection) => void;
}) {
  const schools = useQuery({ queryKey: ['public', 'schools'], queryFn: getSchools });
  const classes = useQuery({
    queryKey: ['public', 'classrooms', value.schoolId],
    queryFn: () => getClassrooms(value.schoolId),
    enabled: !!value.schoolId,
  });
  const grades = [...new Set((classes.data ?? []).map((c) => c.gradeLabel))];
  const error = schools.error ?? classes.error;
  return (
    <>
      <label htmlFor="school">학교</label>
      <select
        id="school"
        value={value.schoolId}
        required
        onChange={(e) => onChange({ schoolId: e.target.value, gradeLabel: '', classNumber: 0 })}
      >
        <option value="">학교 선택</option>
        {schools.data?.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <div className="form-row">
        <div>
          <label htmlFor="grade">학년</label>
          <select
            id="grade"
            required
            disabled={!value.schoolId || classes.isPending}
            value={value.gradeLabel}
            onChange={(e) => onChange({ ...value, gradeLabel: e.target.value, classNumber: 0 })}
          >
            <option value="">학년 선택</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="class">반</label>
          <select
            id="class"
            required
            disabled={!value.gradeLabel}
            value={value.classNumber || ''}
            onChange={(e) => onChange({ ...value, classNumber: Number(e.target.value) })}
          >
            <option value="">반 선택</option>
            {classes.data
              ?.filter((c) => c.gradeLabel === value.gradeLabel)
              .map((c) => (
                <option key={c.id} value={c.classNumber}>
                  {c.classNumber}반
                </option>
              ))}
          </select>
        </div>
      </div>
      {error ? (
        <div role="alert">
          {errorMessage(error)}{' '}
          <button
            type="button"
            className="secondary"
            onClick={() => {
              void schools.refetch();
              if (value.schoolId) void classes.refetch();
            }}
          >
            다시 시도
          </button>
        </div>
      ) : null}
    </>
  );
}
