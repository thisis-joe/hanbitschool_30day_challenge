create table content_versions (
    version varchar(100) primary key,
    digest varchar(64) not null,
    active boolean not null default false,
    created_at timestamptz not null default now(),
    constraint content_versions_digest_sha256 check (digest ~ '^[0-9a-f]{64}$')
);

create unique index content_versions_one_active on content_versions (active) where active;

create table content_days (
    version varchar(100) not null,
    day integer not null,
    title text not null,
    primary key (version, day),
    constraint content_days_version_fk foreign key (version) references content_versions(version) on delete no action,
    constraint content_days_day_range check (day between 1 and 30),
    -- Java 21 Character.isWhitespace, explicitly excluding nonbreaking spaces.
    constraint content_days_title_nonblank check (
        btrim(title, U&'\0009\000A\000B\000C\000D\001C\001D\001E\001F\0020\1680\2000\2001\2002\2003\2004\2005\2006\2008\2009\200A\2028\2029\205F\3000') <> ''
    )
);

create table questions (
    version varchar(100) not null,
    question_id integer not null,
    day integer not null,
    position integer not null,
    text text not null,
    answer char(1) not null,
    explanation text not null,
    time_limit_seconds integer not null,
    primary key (version, question_id),
    constraint questions_day_fk foreign key (version, day) references content_days(version, day) on delete no action,
    constraint questions_position_unique unique (version, day, position),
    constraint questions_id_positive check (question_id > 0),
    constraint questions_position_range check (position between 1 and 5),
    constraint questions_id_matches_position check (question_id = (day - 1) * 5 + position),
    constraint questions_text_nonblank check (
        btrim(text, U&'\0009\000A\000B\000C\000D\001C\001D\001E\001F\0020\1680\2000\2001\2002\2003\2004\2005\2006\2008\2009\200A\2028\2029\205F\3000') <> ''
    ),
    constraint questions_answer_choice check (answer in ('O', 'X')),
    constraint questions_explanation_nonblank check (
        btrim(explanation, U&'\0009\000A\000B\000C\000D\001C\001D\001E\001F\0020\1680\2000\2001\2002\2003\2004\2005\2006\2008\2009\200A\2028\2029\205F\3000') <> ''
    ),
    constraint questions_time_limit_range check (time_limit_seconds between 10 and 15)
);
