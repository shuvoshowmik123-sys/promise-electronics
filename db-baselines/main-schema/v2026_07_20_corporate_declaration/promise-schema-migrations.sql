--
-- PostgreSQL database dump
--


-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: promise_schema_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('0000_promise_schema_migrations_ledger', '937d93fd25e4bd80', '2026-07-18 15:05:28.845521+06', 'local', 0);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('0001_test_injected_failure', 'fc26bc1b53c5c118', '2026-07-18 15:05:28.847154+06', 'local', 2);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_b2b_rule_profile', '89af80ef369a05eb', '2026-07-18 15:05:28.849765+06', 'local', 6);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_manual_payment_tables', '52804ab27cf7aa72', '2026-07-18 15:05:28.856812+06', 'local', 2);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_customer_repair_journey', 'a24cd70dd047f0a2', '2026-07-18 15:05:28.859509+06', 'local', 3);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_staff_reset_codes', '134cde6e4969b299', '2026-07-18 15:05:28.863723+06', 'local', 1);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_password_changed_at', '2ff5ac596902f5dc', '2026-07-18 15:05:28.865038+06', 'local', 1);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_operational_fields_ddl', '481e054c43bbc3c8', '2026-07-18 15:05:28.866222+06', 'local', 3);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_call_attempts', 'fbad848e09cf2c66', '2026-07-18 15:05:28.869497+06', 'local', 1);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_staff_invitations', 'c32a70c6483e2a0b', '2026-07-18 15:05:28.871187+06', 'local', 1);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_corporate_setup_tokens', 'c64eb31f8ea33f43', '2026-07-18 15:05:28.872701+06', 'local', 0);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_logistics_tasks_ddl', '226f159ebc3373d0', '2026-07-18 15:05:28.873698+06', 'local', 1);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_service_area_ddl', 'ba0f8323bed985f7', '2026-07-18 15:05:28.875416+06', 'local', 5);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_job_ng_reports', 'd6cbba85337b2fb3', '2026-07-18 15:05:28.88105+06', 'local', 1);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_job_ng_customer_decisions', '85c51c97deb32761', '2026-07-18 15:05:28.882813+06', 'local', 3);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_service_request_intake_ddl', 'c3b55ca1ad5485a8', '2026-07-18 15:05:28.88605+06', 'local', 2);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_retail_quote_admin_acceptance', '7f4596972248174b', '2026-07-18 15:05:28.888315+06', 'local', 11);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_challan_ownership', '731926d0b54cd78e', '2026-07-18 15:05:28.899175+06', 'local', 1);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_attendance_location_ddl', 'c6dc7e4f29611b9d', '2026-07-18 15:05:28.900642+06', 'local', 2);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_job_model_serial_outcome', 'f8f105db7b703e36', '2026-07-18 15:05:28.902965+06', 'local', 1);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_job_warranty_columns', '6ceb643d9617c121', '2026-07-18 15:05:28.904394+06', 'local', 0);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_firebase_uid', '8e0126e43cda3a61', '2026-07-18 15:05:28.905401+06', 'local', 0);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_payment_blacklist', '707d1a3d1b28d20d', '2026-07-18 15:05:28.906167+06', 'local', 1);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_backup_metadata_r2_ddl', 'e130b199ac1eb28b', '2026-07-18 15:05:28.907003+06', 'local', 1);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_hot_path_indexes', 'ecce55d6130d092f', '2026-07-18 15:05:28.907926+06', 'local', 1);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_pos_integrity', 'f13c55f26f700ab2', '2026-07-18 15:05:28.909522+06', 'local', 19);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_17_pos_idempotency', '384477c8ca6b41ab', '2026-07-18 15:05:28.929799+06', 'local', 1);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_19_scheduler_delivery_claim_ddl', '5d79d5adeb88a75d', '2026-07-19 02:20:13.837235+06', 'local', 19);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_19_scheduled_backup_runs_ddl', 'f08a83e1f1e153ad', '2026-07-19 02:42:55.340574+06', 'local', 26);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_19_drawer_day_close_runs_ddl', 'a53b60800d27ce6d', '2026-07-19 13:19:08.657133+06', 'local', 68);
INSERT INTO public.promise_schema_migrations (id, checksum, applied_at, applied_by, duration_ms) VALUES ('2026_07_20_corporate_declaration', '77385452b6643f7e', '2026-07-20 03:22:50.28807+06', 'local', 46);


--
-- PostgreSQL database dump complete
--
