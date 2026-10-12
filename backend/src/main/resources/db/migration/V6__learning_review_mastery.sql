create unique index uq_review_attempt_mastery_identity
    on review_attempts(id, student_account_id, version, question_id, correct);

create table review_masteries (
    student_account_id uuid not null,
    version varchar(100) not null,
    question_id integer not null,
    first_correct_attempt_id uuid not null,
    -- A generated discriminator makes correctness part of the source FK;
    -- even direct SQL cannot attach a wrong or timed-out repeat fact.
    first_correct boolean generated always as (true) stored,
    mastered_at timestamptz not null,
    primary key (student_account_id, version, question_id),
    constraint review_masteries_student_fk foreign key (student_account_id)
        references accounts(id) on delete no action,
    constraint review_masteries_question_fk foreign key (version, question_id)
        references questions(version, question_id) on delete no action,
    constraint review_masteries_first_correct_identity_fk
        foreign key (first_correct_attempt_id, student_account_id, version, question_id, first_correct)
        references review_attempts(id, student_account_id, version, question_id, correct) on delete no action
);

create table review_queue_entries (
    student_account_id uuid not null,
    version varchar(100) not null,
    question_id integer not null,
    reason varchar(30) not null,
    active boolean not null,
    created_at timestamptz not null,
    released_at timestamptz,
    primary key (student_account_id, version, question_id),
    constraint review_queue_entries_student_fk foreign key (student_account_id)
        references accounts(id) on delete no action,
    constraint review_queue_entries_question_fk foreign key (version, question_id)
        references questions(version, question_id) on delete no action,
    constraint review_queue_entries_reason_check check (reason in ('AUTO_FIRST_WRONG', 'USER_AFTER_LATER_WRONG')),
    constraint review_queue_entries_active_release_check check (active = (released_at is null)),
    constraint review_queue_entries_release_time_check check (released_at is null or released_at >= created_at)
);
