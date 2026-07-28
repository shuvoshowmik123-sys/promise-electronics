from __future__ import annotations

import importlib.util
from pathlib import Path
import re
import sys
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parent.parent
MODULE_PATH = ROOT / "tools" / "windows_schema_migration.py"
SPEC = importlib.util.spec_from_file_location("windows_schema_migration", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def audit_payload(classification: str) -> str:
    blocked = classification != "healthy"
    return MODULE.json.dumps({
        "auditVersion": "1",
        "classification": classification,
        "blocked": blocked,
        "counts": {
            "registryCount": 10,
            "liveAppliedCount": 9,
            "missingCount": 1,
            "mismatchCount": 0,
            "extraCount": 0,
            "baselineEntryCount": 8,
            "baselineMissingFromLiveCount": 0,
            "baselineChecksumDisagreeCount": 0,
            "registryBeyondBaselineCount": 2,
        },
        "versions": {
            "currentLiveVersion": "v9",
            "registryHeadVersion": "v10",
            "requiredVersion": "v10",
            "baselineVersion": "baseline-v8",
            "baselineRegistryHead": "v8",
        },
        "evidenceFingerprint": "a" * 32,
        "adoptionDecision": "not_performed",
        "historicalLedgerMutation": "none",
    }, indent=2)


class FakeAuditProcess:
    def __init__(self, args, output: str, returncode: int, **kwargs):
        self.args = args
        self.environment = kwargs["env"].copy()
        self.shell = kwargs["shell"]
        self.output = output
        self.returncode = returncode
        self.killed = False

    def communicate(self, timeout=None):
        return self.output, None

    def kill(self):
        self.killed = True


class FakeMigrationProcess:
    def __init__(self, args, **kwargs):
        self.args = args
        self.environment = kwargs["env"].copy()
        self.shell = kwargs["shell"]
        self.stdout = iter(["[db:migrate:main] SUCCESS - complete\n"])

    def wait(self):
        return 0


class WindowsSchemaMigrationTests(unittest.TestCase):
    def _preflight(self, database_url: str, classification: str, raw_prefix: str = "", mode=None):
        captured = {}
        returncode = 0 if classification == "healthy" else 2
        if mode is None:
            host = MODULE.urlsplit(MODULE.normalize_database_url_input(database_url)).hostname or ""
            mode = MODULE.TargetMode.LOCAL_DISPOSABLE if host.lower() in {"localhost", "127.0.0.1"} else MODULE.TargetMode.DEVELOPMENT_REMOTE

        def factory(args, **kwargs):
            process = FakeAuditProcess(args, raw_prefix + audit_payload(classification), returncode, **kwargs)
            captured["process"] = process
            return process

        commands = MODULE.CanonicalCommands(
            audit=("npm.cmd", "run", "schema:audit:ledger"),
            migration=("npm.cmd", "run", "db:migrate:main"),
        )
        with patch.object(MODULE, "_canonical_commands", return_value=commands):
            result = MODULE.preflight_database_url(database_url, ROOT, mode, popen_factory=factory)
        return result, captured["process"]

    def test_rejects_empty_non_postgresql_and_missing_database_urls(self):
        values = (
            "",
            "   ",
            "https://user:example-password@example.com/db",
            "postgresql:///missing-host",
            "postgresql://user:example-password@example.com",
            "postgresql://user:example-password@example.com/",
            "postgresql://user:example-password@example.com/db?host=other.example.com",
        )
        for value in values:
            with self.subTest(value=value), self.assertRaises(MODULE.PreflightError):
                MODULE.validate_database_url(value)

    def test_normalizes_exact_env_and_psql_copy_paste_wrappers(self):
        direct = "postgresql://operator:example-password@ep-example-pooler.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
        wrappers = (
            f"DATABASE_URL={direct}",
            f"psql '{direct}'",
            f"DATABASE_URL=\"psql '{direct}'\"",
        )
        expected = MODULE.validate_database_url(direct)
        for wrapped in wrappers:
            with self.subTest(wrapped=wrapped):
                self.assertEqual(MODULE.normalize_database_url_input(wrapped), direct)
                self.assertEqual(MODULE.validate_database_url(wrapped), expected)

        for unsafe in (f"psql -c 'DROP DATABASE' '{direct}'", f"psql {direct}"):
            with self.subTest(unsafe=unsafe), self.assertRaises(MODULE.PreflightError):
                MODULE.validate_database_url(unsafe)

    def test_confirmation_identity_distinguishes_databases_without_credentials(self):
        first = MODULE.validate_database_url("postgresql://operator:first-example@db.prod.example.com:5432/promise_main")
        changed_credentials = MODULE.validate_database_url("postgresql://other:second-example@db.prod.example.com:5432/promise_main?sslmode=require")
        second_database = MODULE.validate_database_url("postgresql://operator:first-example@db.prod.example.com:5432/promise_archive")
        self.assertEqual(first.redacted, changed_credentials.redacted)
        self.assertEqual(first.target_fingerprint, changed_credentials.target_fingerprint)
        self.assertNotEqual(first.redacted, second_database.redacted)
        self.assertNotEqual(first.target_fingerprint, second_database.target_fingerprint)
        self.assertIn("promise_main", first.redacted)
        self.assertNotIn("operator", first.redacted)
        self.assertNotIn("first-example", first.redacted)
        self.assertNotIn("sslmode", changed_credentials.redacted)

    def test_read_only_preflight_allows_healthy_and_pending_only(self):
        healthy, _healthy_process = self._preflight(
            "postgresql://operator:example-password@localhost:5432/promise",
            "healthy",
        )
        pending, _pending_process = self._preflight(
            "postgresql://operator:example-password@localhost:5432/promise",
            "pending_only",
        )
        self.assertEqual(healthy.classification, "healthy")
        self.assertEqual(pending.classification, "pending_only")

    def test_read_only_preflight_blocks_bad_credentials_or_unavailable(self):
        database_url = "postgresql://operator:example-password@ep-example-pooler.aws.neon.tech:5432/promise"
        raw = f"connection failed for {database_url} password=example-password\n"
        with self.assertRaises(MODULE.PreflightError) as raised:
            self._preflight(database_url, "incomplete_or_unavailable", raw)
        message = str(raised.exception)
        self.assertIn("authentication, connectivity, or canonical ledger availability", message)
        self.assertNotIn(database_url, message)
        self.assertNotIn("example-password", message)

    def test_read_only_preflight_blocks_checksum_mismatch(self):
        with self.assertRaises(MODULE.PreflightError) as raised:
            self._preflight(
                "postgresql://operator:example-password@localhost:5432/promise",
                "checksum_mismatch",
            )
        self.assertIn("checksum mismatch", str(raised.exception))

    def test_audit_url_is_environment_only_and_not_argv(self):
        database_url = "postgresql://operator:example-password@localhost:5432/promise"
        result, process = self._preflight(database_url, "healthy")
        self.assertNotIn(database_url, process.args)
        self.assertEqual(process.environment["DATABASE_URL"], database_url)
        self.assertEqual(process.environment["NODE_ENV"], "development")
        self.assertFalse(process.shell)
        self.assertEqual(result.command, ("npm.cmd", "run", "db:migrate:main"))
        self.assertEqual(result.mode, MODULE.TargetMode.LOCAL_DISPOSABLE)

    def test_preflight_development_remote_uses_development_node_env(self):
        database_url = "postgresql://operator:example-password@ep-example-pooler.aws.neon.tech/neondb"
        result, process = self._preflight(database_url, "healthy", mode=MODULE.TargetMode.DEVELOPMENT_REMOTE)
        self.assertEqual(process.environment["NODE_ENV"], "development")
        self.assertNotIn("ALLOW_PROD_DB_MIGRATE_MAIN", process.environment)
        self.assertEqual(result.mode, MODULE.TargetMode.DEVELOPMENT_REMOTE)

    def test_production_remote_is_blocked_before_any_command_launch(self):
        database_url = "postgresql://operator:example-password@ep-example-pooler.aws.neon.tech/neondb"

        def factory(args, **kwargs):
            raise AssertionError("No command may be launched for production remote mode.")

        commands = MODULE.CanonicalCommands(
            audit=("npm.cmd", "run", "schema:audit:ledger"),
            migration=("npm.cmd", "run", "db:migrate:main"),
        )
        with patch.object(MODULE, "_canonical_commands", return_value=commands):
            with self.assertRaises(MODULE.PreflightError) as raised:
                MODULE.preflight_database_url(database_url, ROOT, MODULE.TargetMode.PRODUCTION_REMOTE, popen_factory=factory)
        self.assertIn("controlled production release procedure", str(raised.exception))

    def test_local_disposable_mode_rejects_non_local_url(self):
        database_url = "postgresql://operator:example-password@ep-example-pooler.aws.neon.tech/neondb"
        target = MODULE.validate_database_url(database_url)
        with self.assertRaises(MODULE.PreflightError) as raised:
            MODULE.resolve_target_mode(MODULE.TargetMode.LOCAL_DISPOSABLE, target)
        self.assertIn("Local disposable mode requires a local Database URL", str(raised.exception))

    def test_development_remote_mode_rejects_local_url(self):
        database_url = "postgresql://operator:example-password@localhost:5432/promise"
        target = MODULE.validate_database_url(database_url)
        with self.assertRaises(MODULE.PreflightError) as raised:
            MODULE.resolve_target_mode(MODULE.TargetMode.DEVELOPMENT_REMOTE, target)
        self.assertIn("Development remote mode requires a non-local Database URL", str(raised.exception))

    def test_development_remote_mode_accepts_a_safe_example_neon_tech_host(self):
        database_url = "postgresql://operator:example-password@ep-example-pooler.us-east-2.aws.neon.tech/neondb"
        target = MODULE.validate_database_url(database_url)
        # Must not raise.
        MODULE.resolve_target_mode(MODULE.TargetMode.DEVELOPMENT_REMOTE, target)

    def test_development_remote_mode_rejects_aiven_pattern_and_arbitrary_and_malformed_hosts(self):
        rejected_hosts = (
            "pg-example-12345678-promise.a.aivencloud.com",
            "db.example.com",
            "example.neon.tech.attacker.com",
            "notneon.tech",
            "myneon.tech",
            "203.0.113.10",
        )
        for host in rejected_hosts:
            database_url = f"postgresql://operator:example-password@{host}:5432/promise"
            with self.subTest(host=host):
                target = MODULE.validate_database_url(database_url)
                with self.assertRaises(MODULE.PreflightError) as raised:
                    MODULE.resolve_target_mode(MODULE.TargetMode.DEVELOPMENT_REMOTE, target)
                message = str(raised.exception)
                self.assertIn("recognized Neon development hosts", message)
                self.assertNotIn(host, message)

        # Bare "neon.tech" (no subdomain) is not a recognized endpoint pattern
        # either -- it must still be rejected, just without asserting the
        # substring isn't in the message (it trivially overlaps the pattern
        # description ".neon.tech").
        bare_target = MODULE.validate_database_url("postgresql://operator:example-password@neon.tech:5432/promise")
        with self.assertRaises(MODULE.PreflightError):
            MODULE.resolve_target_mode(MODULE.TargetMode.DEVELOPMENT_REMOTE, bare_target)

    def test_development_remote_rejected_targets_never_reach_a_subprocess(self):
        rejected_hosts = (
            "pg-example-12345678-promise.a.aivencloud.com",
            "db.example.com",
            "notneon.tech",
        )

        def factory(args, **kwargs):
            raise AssertionError(f"No subprocess may be launched for a rejected development remote host: {args!r}")

        commands = MODULE.CanonicalCommands(
            audit=("npm.cmd", "run", "schema:audit:ledger"),
            migration=("npm.cmd", "run", "db:migrate:main"),
        )
        for host in rejected_hosts:
            database_url = f"postgresql://operator:example-password@{host}:5432/promise"
            with self.subTest(host=host):
                with patch.object(MODULE, "_canonical_commands", return_value=commands):
                    with self.assertRaises(MODULE.PreflightError):
                        MODULE.preflight_database_url(database_url, ROOT, MODULE.TargetMode.DEVELOPMENT_REMOTE, popen_factory=factory)

    def test_development_remote_rejected_target_child_environment_never_built(self):
        database_url = "postgresql://operator:example-password@pg-example-12345678-promise.a.aivencloud.com:5432/promise"
        target = MODULE.validate_database_url(database_url)
        with self.assertRaises(MODULE.PreflightError):
            MODULE.build_child_environment(database_url, target, MODULE.TargetMode.DEVELOPMENT_REMOTE)

    def test_raw_audit_error_or_url_is_never_surfaced(self):
        database_url = "postgresql://operator:example-password@localhost:5432/promise"
        raw = f"FATAL raw error {database_url} password=example-password CREATE TABLE\n"
        captured = {}

        def factory(args, **kwargs):
            process = FakeAuditProcess(args, raw, 1, **kwargs)
            captured["process"] = process
            return process

        commands = MODULE.CanonicalCommands(
            audit=("npm.cmd", "run", "schema:audit:ledger"),
            migration=("npm.cmd", "run", "db:migrate:main"),
        )
        with patch.object(MODULE, "_canonical_commands", return_value=commands):
            with self.assertRaises(MODULE.PreflightError) as raised:
                MODULE.preflight_database_url(database_url, ROOT, MODULE.TargetMode.LOCAL_DISPOSABLE, popen_factory=factory)
        message = str(raised.exception)
        self.assertNotIn(database_url, message)
        self.assertNotIn("example-password", message)
        self.assertNotIn("CREATE TABLE", message)
        self.assertNotIn(database_url, captured["process"].args)

    def test_audit_json_with_unapproved_diagnostic_field_is_rejected(self):
        payload = MODULE.json.loads(audit_payload("healthy"))
        payload["diagnostic"] = "postgresql://operator:example-password@localhost/promise"
        self.assertIsNone(MODULE._extract_redacted_audit_classification(MODULE.json.dumps(payload)))

    def test_local_and_remote_run_guards_are_explicit(self):
        with patch.dict(MODULE.os.environ, {"MAIN_SCHEMA_TRUST_BASELINE_ADOPTION": "true", "MAIN_MIGRATION_TEST_INJECT_FAILURE": "true"}, clear=False):
            local = MODULE.build_child_environment(
                "postgresql://u:p@localhost/db",
                MODULE.validate_database_url("postgresql://u:p@localhost/db"),
                MODULE.TargetMode.LOCAL_DISPOSABLE,
            )
            remote = MODULE.build_child_environment(
                "postgresql://u:p@ep-example-pooler.aws.neon.tech/db",
                MODULE.validate_database_url("postgresql://u:p@ep-example-pooler.aws.neon.tech/db"),
                MODULE.TargetMode.DEVELOPMENT_REMOTE,
            )
        self.assertEqual(local["MAIN_MIGRATION_RELEASE_MODE"], "true")
        self.assertEqual(local["NODE_ENV"], "development")
        self.assertNotIn("ALLOW_PROD_DB_MIGRATE_MAIN", local)
        self.assertEqual(remote["MAIN_MIGRATION_RELEASE_MODE"], "true")
        self.assertEqual(remote["NODE_ENV"], "development")
        self.assertNotIn("ALLOW_PROD_DB_MIGRATE_MAIN", remote)
        self.assertNotIn("MAIN_SCHEMA_TRUST_BASELINE_ADOPTION", remote)
        self.assertNotIn("MAIN_MIGRATION_TEST_INJECT_FAILURE", remote)

    def test_production_remote_child_environment_is_blocked(self):
        target = MODULE.validate_database_url("postgresql://u:p@db.example.com/db")
        with self.assertRaises(MODULE.PreflightError):
            MODULE.build_child_environment("postgresql://u:p@db.example.com/db", target, MODULE.TargetMode.PRODUCTION_REMOTE)

    def test_production_remote_run_is_blocked_before_command_launch(self):
        database_url = "postgresql://u:p@db.example.com/db"
        target = MODULE.validate_database_url(database_url)
        preflight = MODULE.PreflightResult(
            target,
            MODULE.TargetMode.PRODUCTION_REMOTE,
            ("npm.cmd", "run", "db:migrate:main"),
            MODULE.hashlib.sha256(database_url.encode("utf-8")).digest(),
            "healthy",
        )

        def factory(args, **kwargs):
            raise AssertionError("No command may be launched for production remote mode.")

        outcome = MODULE.run_canonical_migration(database_url, preflight, ROOT, MODULE.TargetMode.PRODUCTION_REMOTE, popen_factory=factory)
        self.assertFalse(outcome.success)
        self.assertEqual(outcome.category, "invalid_target")

    def test_mode_change_after_preflight_is_rejected(self):
        database_url = "postgresql://u:p@localhost/db"
        target = MODULE.validate_database_url(database_url)
        preflight = MODULE.PreflightResult(
            target,
            MODULE.TargetMode.LOCAL_DISPOSABLE,
            ("npm.cmd", "run", "db:migrate:main"),
            MODULE.hashlib.sha256(database_url.encode("utf-8")).digest(),
            "healthy",
        )

        def factory(args, **kwargs):
            raise AssertionError("No command may be launched when the mode changed after preflight.")

        outcome = MODULE.run_canonical_migration(database_url, preflight, ROOT, MODULE.TargetMode.DEVELOPMENT_REMOTE, popen_factory=factory)
        self.assertFalse(outcome.success)
        self.assertEqual(outcome.category, "invalid_target")

    def test_child_environment_includes_windows_node_runtime_when_path_is_missing(self):
        node_directory = Path(r"C:\\Program Files\\nodejs")
        node_executable = node_directory / "node.exe"
        original_path = "C:\\Windows\\System32"
        with patch.object(MODULE.os, "name", "nt"), patch.dict(
            MODULE.os.environ,
            {"ProgramFiles": r"C:\\Program Files", "PATH": original_path},
            clear=False,
        ), patch.object(MODULE.Path, "is_file", return_value=True):
            environment = MODULE.build_preflight_environment(
                "postgresql://u:p@localhost/db",
                MODULE.validate_database_url("postgresql://u:p@localhost/db"),
                MODULE.TargetMode.LOCAL_DISPOSABLE,
            )
        self.assertEqual(environment["PATH"].split(MODULE.os.pathsep)[0], str(node_directory))
        self.assertIn(original_path, environment["PATH"])

    def test_migration_url_is_environment_only_and_result_is_sanitized(self):
        database_url = "postgresql://operator:example-password@localhost:5432/promise"
        target = MODULE.validate_database_url(database_url)
        preflight = MODULE.PreflightResult(
            target,
            MODULE.TargetMode.LOCAL_DISPOSABLE,
            ("npm.cmd", "run", "db:migrate:main"),
            MODULE.hashlib.sha256(database_url.encode("utf-8")).digest(),
            "healthy",
        )
        captured = {}

        def factory(args, **kwargs):
            process = FakeMigrationProcess(args, **kwargs)
            captured["process"] = process
            return process

        outcome = MODULE.run_canonical_migration(database_url, preflight, ROOT, MODULE.TargetMode.LOCAL_DISPOSABLE, popen_factory=factory)
        process = captured["process"]
        self.assertNotIn(database_url, process.args)
        self.assertEqual(process.environment["DATABASE_URL"], database_url)
        self.assertFalse(process.shell)
        self.assertNotIn("example-password", outcome.title)
        self.assertNotIn("example-password", outcome.detail)
        self.assertTrue(outcome.success)

    def test_rolled_back_failure_surfaces_only_reviewed_migration_id(self):
        database_url = "postgresql://operator:example-password@localhost:5432/promise"
        migration_id = "2026_07_19_scheduler_delivery_claim_ddl"
        raw = (
            f"[MainSchema] Migration {migration_id} FAILED (rolled back): "
            f"password=example-password {database_url} CREATE TABLE private_data\n"
        )
        target = MODULE.validate_database_url(database_url)
        preflight = MODULE.PreflightResult(
            target,
            MODULE.TargetMode.LOCAL_DISPOSABLE,
            ("npm.cmd", "run", "db:migrate:main"),
            MODULE.hashlib.sha256(database_url.encode("utf-8")).digest(),
            "healthy",
        )

        def factory(args, **kwargs):
            process = FakeMigrationProcess(args, **kwargs)
            process.stdout = iter([raw])
            process.wait = lambda: 1
            return process

        outcome = MODULE.run_canonical_migration(database_url, preflight, ROOT, MODULE.TargetMode.LOCAL_DISPOSABLE, popen_factory=factory)
        rendered = f"{outcome.title} {outcome.detail}"
        self.assertEqual(outcome.category, "migration_failed")
        self.assertIn(migration_id, rendered)
        self.assertNotIn("example-password", rendered)
        self.assertNotIn(database_url, rendered)
        self.assertNotIn("CREATE TABLE", rendered)
        self.assertNotIn(raw, rendered)

    def test_malformed_or_unreviewed_migration_id_does_not_surface(self):
        database_url = "postgresql://operator:example-password@localhost:5432/promise"
        target = MODULE.validate_database_url(database_url)
        preflight = MODULE.PreflightResult(
            target,
            MODULE.TargetMode.LOCAL_DISPOSABLE,
            ("npm.cmd", "run", "db:migrate:main"),
            MODULE.hashlib.sha256(database_url.encode("utf-8")).digest(),
            "healthy",
        )
        raw_lines = [
            "[MainSchema] Migration EVIL_MIGRATION FAILED (rolled back): password=example-password\n",
            "[MainSchema] Migration ../hostile FAILED (rolled back): password=example-password\n",
        ]

        def factory(args, **kwargs):
            process = FakeMigrationProcess(args, **kwargs)
            process.stdout = iter(raw_lines)
            process.wait = lambda: 1
            return process

        outcome = MODULE.run_canonical_migration(database_url, preflight, ROOT, MODULE.TargetMode.LOCAL_DISPOSABLE, popen_factory=factory)
        rendered = f"{outcome.title} {outcome.detail}"
        self.assertEqual(outcome.category, "failed")
        self.assertNotIn("EVIL_MIGRATION", rendered)
        self.assertNotIn("hostile", rendered)
        self.assertNotIn("example-password", rendered)
        self.assertTrue(all(raw_line not in rendered for raw_line in raw_lines))

    def test_failure_mapping_never_returns_raw_child_text(self):
        raw = "password=example-password CREATE TABLE private_data connection refused"
        outcome = MODULE._safe_outcome(1, [raw])
        rendered = f"{outcome.title} {outcome.detail}"
        self.assertNotIn("example-password", rendered)
        self.assertNotIn("CREATE TABLE", rendered)
        self.assertEqual(outcome.category, "failed")

    def test_fixed_result_categories_cover_noop_lock_and_integrity(self):
        self.assertEqual(MODULE._safe_outcome(0, ["skipped"]).category, "current")
        self.assertEqual(MODULE._safe_outcome(2, []).category, "lock_timeout")
        self.assertEqual(MODULE._safe_outcome(1, ["checksum mismatch"]).category, "integrity_blocked")

    def test_resolve_repo_root_uses_exe_directory_when_frozen(self):
        fake_exe_dir = ROOT / "tools" / "packaging" / "dist"
        with patch.object(MODULE.sys, "frozen", True, create=True), patch.object(
            MODULE.sys, "executable", str(fake_exe_dir / "PromiseSchemaMigration.exe")
        ):
            resolved = MODULE._resolve_repo_root()
        self.assertEqual(resolved, ROOT)

    def test_resolve_repo_root_falls_back_to_start_when_no_checkout_found(self):
        with patch.object(MODULE.sys, "frozen", True, create=True), patch.object(
            MODULE.sys, "executable", str(Path("C:/") / "standalone" / "PromiseSchemaMigration.exe")
        ):
            resolved = MODULE._resolve_repo_root()
        self.assertEqual(resolved, Path("C:/") / "standalone")

    def test_commands_are_canonical_and_python_has_no_sql_engine_or_persistence(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn('"db:migrate:main"', source)
        self.assertIn('"schema:audit:ledger"', source)
        self.assertIn('"server" / "db-migrate-main.ts"', source)
        self.assertIn('"scripts" / "ledger-reconciliation-audit.ts"', source)
        self.assertNotIn("psycopg", source.lower())
        self.assertNotIn("client.query", source.lower())
        self.assertNotIn("cursor.execute", source.lower())
        self.assertNotIn("sqlite", source.lower())
        self.assertNotIn("keyring", source.lower())

    def test_backup_metadata_write_text_is_the_only_persistence_and_carries_no_credentials(self):
        """PROMISE-SCHEMA-MIGRATION-TOOL-BACKUP-RESTORE-01A: the tool legitimately
        gained exactly one on-disk write — a small backup metadata sidecar
        (sha256/targetFingerprint/timestamp/tocEntryCount/masked db name).
        This replaces the prior blanket "never write_text" guard (which
        predates the backup feature) with a guard on the metadata dict's own
        keys, so a credential can never be added to it without this test
        failing.
        """
        source = MODULE_PATH.read_text(encoding="utf-8")
        write_text_calls = re.findall(r"(\w+)\.write_text\(", source)
        self.assertEqual(write_text_calls, ["metadata_path"])
        metadata_block = source.split("metadata = {", 1)[1].split("}", 1)[0]
        self.assertIn("targetFingerprint", metadata_block)
        self.assertIn("sha256", metadata_block)
        self.assertIn("createdAtUtc", metadata_block)
        self.assertIn("tocEntryCount", metadata_block)
        lowered_metadata_block = metadata_block.lower()
        self.assertNotIn("password", lowered_metadata_block)
        self.assertNotIn("database_url", lowered_metadata_block)
        self.assertNotIn("connectionstring", lowered_metadata_block)
        self.assertNotIn("pghost", lowered_metadata_block)
        self.assertNotIn("pguser", lowered_metadata_block)

    def test_backup_and_restore_never_pass_credentials_on_a_command_line(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn("_pg_connection_env", source)
        self.assertIn("PGPASSWORD", source)
        # pg_dump/pg_restore argv lists must never interpolate the database
        # URL or connection env directly.
        dump_argv = re.search(r"popen_factory\(\s*\[pg_dump_path,([^\]]*)\]", source)
        self.assertIsNotNone(dump_argv)
        self.assertNotIn("database_url", dump_argv.group(1))
        restore_list_argv = re.search(r"popen_factory\(\s*\[pg_restore_path, \"--list\"([^\]]*)\]", source)
        self.assertIsNotNone(restore_list_argv)
        restore_argv = re.search(r"pg_restore_path, \[\"--no-owner\"([^\]]*)\]", source)
        self.assertIsNotNone(restore_argv)
        self.assertNotIn("database_url", restore_argv.group(1))
        dropdb_argv_block = re.search(r"dropdb_args = \[([^\]]*)\](.*?)dropdb_args\.append\(target_database_name\)", source, re.DOTALL)
        self.assertIsNotNone(dropdb_argv_block)
        self.assertNotIn("database_url", dropdb_argv_block.group(0))
        dropdb_call = re.search(r"dropdb_path, dropdb_args,", source)
        self.assertIsNotNone(dropdb_call)
        createdb_argv = re.search(r"createdb_path, \[([^\]]*)\]", source)
        self.assertIsNotNone(createdb_argv)
        self.assertNotIn("database_url", createdb_argv.group(1))

    def test_system_settings_schema_surface_request_flow_is_client_safe(self):
        """SCHEMA-UPDATE-CONTROL-UX-01A: the control legitimately gained a password-
        confirmed "Request update" dialog that POSTs to the existing, reviewed
        `/api/admin/schema-updates/requests` endpoint. This replaces the prior
        purely-read-only guard (which predates that feature) with an updated
        guard: the browser may request an update, but must still never receive
        or reference raw SQL, checksums, a database URL, or child-process/
        migration-execution primitives directly in this component or API block.
        """
        component = (ROOT / "client" / "src" / "pages" / "admin" / "bento" / "tabs" / "settings" / "SchemaUpdateControl.tsx").read_text(encoding="utf-8")
        api = (ROOT / "client" / "src" / "lib" / "api" / "adminApi.ts").read_text(encoding="utf-8")
        self.assertIn("useMutation", component)
        self.assertIn("Dialog", component)
        self.assertIn("Request update", component)
        lowered_component = component.lower()
        self.assertNotIn("database_url", lowered_component)
        self.assertNotIn("child_process", lowered_component)
        self.assertNotIn("checksum", lowered_component)
        self.assertNotIn("create table", lowered_component)
        self.assertNotIn("drop table", lowered_component)
        self.assertNotIn("alter table", lowered_component)
        self.assertNotIn("backup", lowered_component)
        self.assertNotIn("runmainschemamigrations", lowered_component)
        self.assertNotIn("Ã‚", component)
        self.assertNotIn("Â·", component)
        schema_api = api.split("export const schemaUpdateApi =", 1)[1].split("};", 1)[0]
        self.assertIn("POST", schema_api)
        self.assertIn("confirm", schema_api)
        lowered_api_block = schema_api.lower()
        self.assertNotIn("database_url", lowered_api_block)
        self.assertNotIn("child_process", lowered_api_block)
        self.assertNotIn("checksum", lowered_api_block)


class FakeToolProcess:
    """Generic fake subprocess for pg_dump / pg_restore, driven by a callback
    that inspects argv and may write to the backup path to simulate a real
    dump being created, before returning fixed output/returncode."""

    def __init__(self, args, output: str, returncode: int, on_launch=None, **kwargs):
        self.args = args
        self.environment = kwargs["env"].copy()
        self.shell = kwargs["shell"]
        self.output = output
        self.returncode = returncode
        if on_launch:
            on_launch(args, kwargs["env"])

    def communicate(self, timeout=None):
        return self.output, None

    def kill(self):
        pass


class BackupRestoreTests(unittest.TestCase):
    def setUp(self):
        import tempfile

        self._tmp = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self._tmp.name)
        self.repo_root = self.tmp_path / "repo"
        self.repo_root.mkdir()
        self.backup_dir = self.tmp_path / "backups"
        self.target = MODULE.validate_database_url("postgresql://operator:example-password@localhost:5432/promise_disposable")

    def tearDown(self):
        self._tmp.cleanup()

    def _dump_factory(self, dump_returncode=0, dump_output="", list_returncode=0, list_output="; entry1\n1; 2; TABLE public foo\n2; 2; TABLE public bar\n"):
        def factory(args, **kwargs):
            if "--list" in args:
                return FakeToolProcess(args, list_output, list_returncode, **kwargs)

            def write_dump(argv, _env):
                file_index = argv.index("--file") + 1
                Path(argv[file_index]).write_bytes(b"fake-custom-format-dump-bytes")

            return FakeToolProcess(args, dump_output, dump_returncode, on_launch=write_dump, **kwargs)
        return factory

    def test_default_backup_directory_is_never_inside_the_repo(self):
        directory = MODULE.default_backup_directory(self.repo_root)
        self.assertNotEqual(directory.resolve(), self.repo_root.resolve())
        self.assertNotIn(self.repo_root.resolve(), directory.resolve().parents)

    def test_default_backup_directory_rejects_a_directory_inside_the_repo(self):
        with patch.dict(MODULE.os.environ, {"LOCALAPPDATA": str(self.repo_root / "inner")}, clear=False):
            with self.assertRaises(MODULE.PreflightError):
                MODULE.default_backup_directory(self.repo_root)

    def test_pg_connection_env_never_includes_the_raw_url_and_sets_libpq_vars(self):
        env = MODULE._pg_connection_env("postgresql://operator:example-password@localhost:5432/promise?sslmode=require", {})
        self.assertEqual(env["PGHOST"], "localhost")
        self.assertEqual(env["PGPORT"], "5432")
        self.assertEqual(env["PGDATABASE"], "promise")
        self.assertEqual(env["PGUSER"], "operator")
        self.assertEqual(env["PGPASSWORD"], "example-password")
        self.assertEqual(env["PGSSLMODE"], "require")
        self.assertNotIn("postgresql://", json_dump_safe(env))

    def test_create_backup_writes_outside_repo_and_verifies_sha256_and_toc(self):
        with patch.object(MODULE, "_find_pg_tool", side_effect=lambda name: f"/fake/{name}"):
            result = MODULE.create_backup(
                "postgresql://operator:example-password@localhost:5432/promise_disposable",
                self.target,
                self.repo_root,
                backup_directory=self.backup_dir,
                popen_factory=self._dump_factory(),
            )
        self.assertTrue(result.success)
        self.assertIsNotNone(result.backup_path)
        self.assertTrue(result.backup_path.is_file())
        self.assertNotIn(str(self.repo_root), str(result.backup_path))
        self.assertEqual(result.sha256, MODULE._sha256_of_file(result.backup_path))
        self.assertEqual(result.toc_entry_count, 2)
        metadata_path = result.backup_path.parent / f"{result.backup_path.name}.json"
        self.assertTrue(metadata_path.is_file())
        metadata = MODULE.json.loads(metadata_path.read_text(encoding="utf-8"))
        self.assertEqual(metadata["targetFingerprint"], self.target.target_fingerprint)
        self.assertEqual(metadata["sha256"], result.sha256)
        self.assertNotIn("password", MODULE.json.dumps(metadata).lower())
        self.assertNotIn("postgres://", MODULE.json.dumps(metadata).lower())

    def test_create_backup_removes_file_when_verification_fails(self):
        with patch.object(MODULE, "_find_pg_tool", side_effect=lambda name: f"/fake/{name}"):
            result = MODULE.create_backup(
                "postgresql://operator:example-password@localhost:5432/promise_disposable",
                self.target,
                self.repo_root,
                backup_directory=self.backup_dir,
                popen_factory=self._dump_factory(list_returncode=1, list_output=""),
            )
        self.assertFalse(result.success)
        self.assertEqual(list(self.backup_dir.glob("*.dump")), [])

    def test_create_backup_failure_never_leaks_credentials_in_message(self):
        database_url = "postgresql://operator:example-password@localhost:5432/promise_disposable"
        with patch.object(MODULE, "_find_pg_tool", side_effect=lambda name: f"/fake/{name}"):
            result = MODULE.create_backup(
                database_url,
                self.target,
                self.repo_root,
                backup_directory=self.backup_dir,
                popen_factory=self._dump_factory(dump_returncode=1, dump_output=f"FATAL password=example-password {database_url}\n"),
            )
        self.assertFalse(result.success)
        self.assertNotIn("example-password", result.message)
        self.assertNotIn(database_url, result.message)

    def _make_verified_backup(self):
        with patch.object(MODULE, "_find_pg_tool", side_effect=lambda name: f"/fake/{name}"):
            return MODULE.create_backup(
                "postgresql://operator:example-password@localhost:5432/promise_disposable",
                self.target,
                self.repo_root,
                backup_directory=self.backup_dir,
                popen_factory=self._dump_factory(),
            )

    def test_verify_backup_for_restore_accepts_matching_backup(self):
        backup = self._make_verified_backup()
        with patch.object(MODULE, "_find_pg_tool", side_effect=lambda name: f"/fake/{name}"):
            verification = MODULE.verify_backup_for_restore(backup.backup_path, self.target, popen_factory=self._dump_factory())
        self.assertTrue(verification.ok)

    def test_verify_backup_for_restore_rejects_tampered_file(self):
        backup = self._make_verified_backup()
        with backup.backup_path.open("ab") as handle:
            handle.write(b"tampered")
        with patch.object(MODULE, "_find_pg_tool", side_effect=lambda name: f"/fake/{name}"):
            verification = MODULE.verify_backup_for_restore(backup.backup_path, self.target, popen_factory=self._dump_factory())
        self.assertFalse(verification.ok)
        self.assertIn("SHA-256", verification.message)

    def test_verify_backup_for_restore_rejects_mismatched_target_fingerprint(self):
        backup = self._make_verified_backup()
        other_target = MODULE.validate_database_url("postgresql://operator:example-password@localhost:5432/a_completely_different_db")
        with patch.object(MODULE, "_find_pg_tool", side_effect=lambda name: f"/fake/{name}"):
            verification = MODULE.verify_backup_for_restore(backup.backup_path, other_target, popen_factory=self._dump_factory())
        self.assertFalse(verification.ok)
        self.assertIn("different database target", verification.message)

    def test_verify_backup_for_restore_rejects_missing_metadata(self):
        backup = self._make_verified_backup()
        metadata_path = backup.backup_path.parent / f"{backup.backup_path.name}.json"
        metadata_path.unlink()
        verification = MODULE.verify_backup_for_restore(backup.backup_path, self.target)
        self.assertFalse(verification.ok)
        self.assertIn("metadata", verification.message.lower())

    def test_run_restore_never_puts_database_url_on_argv(self):
        database_url = "postgresql://operator:example-password@localhost:5432/promise_disposable"
        captured = {}

        def factory(args, **kwargs):
            captured["args"] = args
            captured["env"] = kwargs["env"].copy()
            return FakeToolProcess(args, "", 0, **kwargs)

        with patch.object(MODULE, "_find_pg_tool", side_effect=lambda name: f"/fake/{name}"):
            outcome = MODULE.run_restore(database_url, self.tmp_path / "some.dump", MODULE.TargetMode.LOCAL_DISPOSABLE, popen_factory=factory)
        self.assertTrue(outcome.success)
        self.assertNotIn(database_url, captured["args"])
        self.assertEqual(captured["env"]["PGPASSWORD"], "example-password")

    def test_run_restore_failure_message_is_sanitized(self):
        database_url = "postgresql://operator:example-password@localhost:5432/promise_disposable"

        def factory(args, **kwargs):
            return FakeToolProcess(args, f"pg_restore: error: password={('example-password')} {database_url}\n", 1, **kwargs)

        with patch.object(MODULE, "_find_pg_tool", side_effect=lambda name: f"/fake/{name}"):
            outcome = MODULE.run_restore(database_url, self.tmp_path / "some.dump", MODULE.TargetMode.LOCAL_DISPOSABLE, popen_factory=factory)
        self.assertFalse(outcome.success)
        self.assertNotIn("example-password", outcome.detail)
        self.assertNotIn(database_url, outcome.detail)

    def test_run_restore_local_disposable_never_passes_force_flag(self):
        database_url = "postgresql://operator:example-password@localhost:5432/promise_disposable"
        captured_argv = []

        def factory(args, **kwargs):
            captured_argv.append(args)
            return FakeToolProcess(args, "", 0, **kwargs)

        with patch.object(MODULE, "_find_pg_tool", side_effect=lambda name: f"/fake/{name}"):
            outcome = MODULE.run_restore(database_url, self.tmp_path / "some.dump", MODULE.TargetMode.LOCAL_DISPOSABLE, popen_factory=factory)
        self.assertTrue(outcome.success)
        dropdb_call = next(args for args in captured_argv if "/fake/dropdb" in args)
        self.assertNotIn("--force", dropdb_call)

    def test_run_restore_development_remote_passes_force_flag_to_dropdb_only(self):
        database_url = "postgresql://operator:example-password@ep-example-pooler.aws.neon.tech/neondb"
        captured_argv = []

        def factory(args, **kwargs):
            captured_argv.append(args)
            return FakeToolProcess(args, "", 0, **kwargs)

        with patch.object(MODULE, "_find_pg_tool", side_effect=lambda name: f"/fake/{name}"):
            outcome = MODULE.run_restore(database_url, self.tmp_path / "some.dump", MODULE.TargetMode.DEVELOPMENT_REMOTE, popen_factory=factory)
        self.assertTrue(outcome.success)
        dropdb_call = next(args for args in captured_argv if "/fake/dropdb" in args)
        self.assertIn("--force", dropdb_call)
        createdb_call = next(args for args in captured_argv if "/fake/createdb" in args)
        self.assertNotIn("--force", createdb_call)
        pg_restore_call = next(args for args in captured_argv if "/fake/pg_restore" in args)
        self.assertNotIn("--force", pg_restore_call)

    def test_run_restore_development_remote_forced_drop_failure_stops_immediately(self):
        database_url = "postgresql://operator:example-password@ep-example-pooler.aws.neon.tech/neondb"

        def factory(args, **kwargs):
            if "/fake/dropdb" in args:
                return FakeToolProcess(args, "dropdb: error: database removal failed: ERROR: database is being accessed by other users\n", 1, **kwargs)
            raise AssertionError("createdb/pg_restore must never run when the forced dropdb step fails.")

        with patch.object(MODULE, "_find_pg_tool", side_effect=lambda name: f"/fake/{name}"):
            outcome = MODULE.run_restore(database_url, self.tmp_path / "some.dump", MODULE.TargetMode.DEVELOPMENT_REMOTE, popen_factory=factory)
        self.assertFalse(outcome.success)
        self.assertEqual(outcome.category, "restore_failed")
        self.assertNotIn(database_url, outcome.detail)
        self.assertIn("No other restore method was attempted", outcome.detail)

    def test_run_restore_strips_raw_sql_statements_from_pg_restore_errors(self):
        """A real Neon restore attempt surfaced a genuine pg_restore failure whose
        text echoed the literal failing SQL statement (ALTER DEFAULT PRIVILEGES /
        GRANT for Neon-internal roles). Raw database errors must never reach the
        UI, logs, or evidence verbatim."""
        database_url = "postgresql://operator:example-password@ep-example-pooler.aws.neon.tech/neondb"
        raw_pg_restore_error = (
            "pg_restore: error: could not execute query: ERROR:  permission denied to change default privileges\n"
            "Command was: ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public "
            "GRANT ALL ON SEQUENCES TO neon_superuser WITH GRANT OPTION;\n"
        )

        def factory(args, **kwargs):
            if "/fake/pg_restore" in args and "--list" not in args:
                return FakeToolProcess(args, raw_pg_restore_error, 1, **kwargs)
            return FakeToolProcess(args, "", 0, **kwargs)

        with patch.object(MODULE, "_find_pg_tool", side_effect=lambda name: f"/fake/{name}"):
            outcome = MODULE.run_restore(database_url, self.tmp_path / "some.dump", MODULE.TargetMode.DEVELOPMENT_REMOTE, popen_factory=factory)
        self.assertFalse(outcome.success)
        self.assertNotIn("ALTER DEFAULT PRIVILEGES", outcome.detail)
        self.assertNotIn("GRANT ALL", outcome.detail)
        self.assertNotIn("cloud_admin", outcome.detail)

    def test_run_restore_and_recheck_reports_ledger_even_when_restore_reports_failure(self):
        """pg_restore can exit non-zero on non-fatal statement errors while the
        actual data was substantively restored. The recheck must still run and
        be reported, without upgrading the reported success/failure outcome."""
        database_url = "postgresql://operator:example-password@ep-example-pooler.aws.neon.tech/neondb"

        def factory(args, **kwargs):
            if "/fake/pg_restore" in args and "--list" not in args:
                return FakeToolProcess(args, "pg_restore: error: could not execute query: ERROR: some error\n", 1, **kwargs)
            return FakeToolProcess(args, "", 0, **kwargs)

        with patch.object(MODULE, "_find_pg_tool", side_effect=lambda name: f"/fake/{name}"), \
             patch.object(MODULE, "_recheck_ledger_classification", return_value="healthy (31 applied)") as mock_recheck:
            outcome = MODULE.run_restore_and_recheck(
                database_url, self.tmp_path / "some.dump", self.repo_root, MODULE.TargetMode.DEVELOPMENT_REMOTE, popen_factory=factory,
            )
        mock_recheck.assert_called_once()
        self.assertFalse(outcome.success)
        self.assertIn("Ledger recheck: healthy (31 applied).", outcome.detail)

    def test_remote_restore_consent_text_is_explicit_and_unchecked_by_default(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn("REMOTE_RESTORE_CONSENT_TEXT", source)
        self.assertIn("end active connections", MODULE.REMOTE_RESTORE_CONSENT_TEXT.lower())
        self.assertIn("consent_var = tk.BooleanVar(value=False)", source)

    def test_remote_restore_dialog_never_shows_database_name_or_host(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        dialog_class = source.split("class RemoteRestoreConfirmDialog", 1)[1].split("\nclass ", 1)[0]
        self.assertNotIn("target.redacted", dialog_class)
        self.assertNotIn("target.database_name", dialog_class)

    def test_run_backup_and_migrate_blocks_before_backup_when_ledger_unsafe(self):
        database_url = "postgresql://operator:example-password@localhost:5432/promise_disposable"

        def blocked_audit_payload():
            return MODULE.json.dumps({
                "auditVersion": "1", "classification": "checksum_mismatch", "blocked": True,
                "counts": {"registryCount": 1, "liveAppliedCount": 1, "missingCount": 0, "mismatchCount": 1, "extraCount": 0, "baselineEntryCount": 1, "baselineMissingFromLiveCount": 0, "baselineChecksumDisagreeCount": 0, "registryBeyondBaselineCount": 0},
                "versions": {"currentLiveVersion": "v1", "registryHeadVersion": "v1", "requiredVersion": "v1", "baselineVersion": "b1", "baselineRegistryHead": "v1"},
                "evidenceFingerprint": "a" * 32, "adoptionDecision": "not_performed", "historicalLedgerMutation": "none",
            })

        def audit_factory(args, **kwargs):
            if "schema:audit:ledger" in args:
                return FakeToolProcess(args, blocked_audit_payload(), 2, **kwargs)
            raise AssertionError("No pg_dump/pg_restore process may launch when the ledger check itself is blocked.")

        commands = MODULE.CanonicalCommands(audit=("npm.cmd", "run", "schema:audit:ledger"), migration=("npm.cmd", "run", "db:migrate:main"))
        with patch.object(MODULE, "_canonical_commands", return_value=commands):
            outcome = MODULE.run_backup_and_migrate(database_url, self.target, MODULE.TargetMode.LOCAL_DISPOSABLE, self.repo_root, backup_directory=self.backup_dir, popen_factory=audit_factory)
        self.assertFalse(outcome.success)
        self.assertEqual(outcome.category, "backup_migrate_blocked")
        self.assertEqual(list(self.backup_dir.glob("*.dump")) if self.backup_dir.is_dir() else [], [])

    def test_run_backup_and_migrate_does_not_migrate_when_backup_fails(self):
        database_url = "postgresql://operator:example-password@localhost:5432/promise_disposable"

        def audit_payload():
            return MODULE.json.dumps({
                "auditVersion": "1", "classification": "healthy", "blocked": False,
                "counts": {"registryCount": 1, "liveAppliedCount": 1, "missingCount": 0, "mismatchCount": 0, "extraCount": 0, "baselineEntryCount": 1, "baselineMissingFromLiveCount": 0, "baselineChecksumDisagreeCount": 0, "registryBeyondBaselineCount": 0},
                "versions": {"currentLiveVersion": "v1", "registryHeadVersion": "v1", "requiredVersion": "v1", "baselineVersion": "b1", "baselineRegistryHead": "v1"},
                "evidenceFingerprint": "a" * 32, "adoptionDecision": "not_performed", "historicalLedgerMutation": "none",
            })

        migrate_was_called = {"value": False}

        def factory(args, **kwargs):
            if "schema:audit:ledger" in args:
                return FakeToolProcess(args, audit_payload(), 0, **kwargs)
            if "db:migrate:main" in args:
                migrate_was_called["value"] = True
                return FakeToolProcess(args, "[db:migrate:main] SUCCESS\n", 0, **kwargs)
            if "--list" in args:
                return FakeToolProcess(args, "", 1, **kwargs)  # verification fails
            return FakeToolProcess(args, "", 1, **kwargs)  # pg_dump also fails/unused

        commands = MODULE.CanonicalCommands(audit=("npm.cmd", "run", "schema:audit:ledger"), migration=("npm.cmd", "run", "db:migrate:main"))
        with patch.object(MODULE, "_canonical_commands", return_value=commands), patch.object(MODULE, "_find_pg_tool", side_effect=lambda name: f"/fake/{name}"):
            outcome = MODULE.run_backup_and_migrate(database_url, self.target, MODULE.TargetMode.LOCAL_DISPOSABLE, self.repo_root, backup_directory=self.backup_dir, popen_factory=factory)
        self.assertFalse(outcome.success)
        self.assertEqual(outcome.category, "backup_failed")
        self.assertFalse(migrate_was_called["value"])


def json_dump_safe(value):
    return MODULE.json.dumps(value)


if __name__ == "__main__":
    unittest.main()
