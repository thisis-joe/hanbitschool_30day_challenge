create table private_bookmarks (
    student_account_id uuid not null,
    version varchar(100) not null,
    question_id integer not null,
    created_at timestamptz not null,
    primary key (student_account_id, version, question_id),
    constraint private_bookmarks_student_fk foreign key (student_account_id)
        references accounts(id) on delete no action,
    constraint private_bookmarks_version_fk foreign key (version)
        references content_versions(version) on delete no action,
    constraint private_bookmarks_question_fk foreign key (version, question_id)
        references questions(version, question_id) on delete no action
);
