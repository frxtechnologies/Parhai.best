revoke all on public.paper_check_submissions,public.paper_check_answers from anon,authenticated;
grant select on public.paper_check_submissions,public.paper_check_answers to authenticated;
revoke all on sequence public.paper_check_answers_id_seq from anon,authenticated;
