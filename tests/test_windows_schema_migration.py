from __future__ import annotations

import importlib.util
import os
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


def audit_payload(classification: str, availability: str = "ledger_readable") -> str:
    blocked = classification != "healthy"
    return MODULE.json.dumps({
        "auditVersion": "2",
        "classification": classification,
        "availability": availability,
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

    def test_authentication_availability_maps_to_a_safe_operator_message(self):
        result = MODULE._extract_redacted_audit_result(
            audit_payload("incomplete_or_unavailable", "authentication_rejected")
        )
        self.assertEqual(result, ("incomplete_or_unavailable", "authentication_rejected"))
        message = MODULE._blocked_preflight_message(*result)
        self.assertIn("Aiven rejected database authentication", message)
        self.assertNotIn("password", message.lower())

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

    def test_production_remote_rejects_non_aiven_target_before_any_command_launch(self):
        database_url = "postgresql://operator:example-password@ep-example-pooler.aws.neon.tech/neondb"

        def factory(args, **kwargs):
            raise AssertionError("No command may be launched for a rejected production target.")

        commands = MODULE.CanonicalCommands(
            audit=("npm.cmd", "run", "schema:audit:ledger"),
            migration=("npm.cmd", "run", "db:migrate:main"),
        )
        with patch.object(MODULE, "_canonical_commands", return_value=commands):
            with self.assertRaises(MODULE.PreflightError) as raised:
                MODULE.preflight_database_url(database_url, ROOT, MODULE.TargetMode.PRODUCTION_REMOTE, popen_factory=factory)
        self.assertIn("requires a non-local Aiven Database URL", str(raised.exception))

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

    def test_aiven_test_mode_rejects_local_url(self):
        database_url = "postgresql://operator:example-password@localhost:5432/promise"
        target = MODULE.validate_database_url(database_url)
        with self.assertRaises(MODULE.PreflightError) as raised:
            MODULE.resolve_target_mode(MODULE.TargetMode.AIVEN_TEST_APPROVED, target, database_url)
        self.assertIn("Aiven test mode requires a non-local Database URL", str(raised.exception))

    def test_aiven_test_mode_rejects_non_aiven_hosts_even_with_no_approved_target_set(self):
        rejected_hosts = (
            "ep-example-pooler.aws.neon.tech",
            "db.example.com",
            "pg-example.a.aivencloud.com.attacker.com",
        )
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop(MODULE.AIVEN_TEST_APPROVED_URL_ENV_VAR, None)
            for host in rejected_hosts:
                database_url = f"postgresql://operator:example-password@{host}:18395/defaultdb"
                with self.subTest(host=host):
                    target = MODULE.validate_database_url(database_url)
                    with self.assertRaises(MODULE.PreflightError) as raised:
                        MODULE.resolve_target_mode(MODULE.TargetMode.AIVEN_TEST_APPROVED, target, database_url)
                    message = str(raised.exception)
                    self.assertNotIn(host, message)

    def test_aiven_test_mode_rejects_recognized_aiven_host_when_no_session_target_is_approved(self):
        # Host pattern alone must never authorize an Aiven target (requirement 3):
        # even a perfectly valid *.aivencloud.com host is rejected when the
        # session has not approved any AIVEN_TEST_DATABASE_URL at all.
        database_url = "postgresql://operator:example-password@pg-example-12345678-promise.a.aivencloud.com:18395/defaultdb"
        target = MODULE.validate_database_url(database_url)
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop(MODULE.AIVEN_TEST_APPROVED_URL_ENV_VAR, None)
            with self.assertRaises(MODULE.PreflightError) as raised:
                MODULE.resolve_target_mode(MODULE.TargetMode.AIVEN_TEST_APPROVED, target, database_url)
        message = str(raised.exception)
        self.assertIn("session-approved", message)
        self.assertNotIn("pg-example-12345678-promise", message)

    def test_aiven_test_mode_rejects_a_different_aiven_host_even_when_a_target_is_approved(self):
        # A recognized Aiven host that is NOT the exact session-approved target
        # must still be rejected -- proves the fingerprint check, not just the
        # host-suffix check, is load-bearing.
        approved_url = "postgresql://approved_user:approved_password@pg-approved-11111111-promise.a.aivencloud.com:18395/defaultdb"
        other_url = "postgresql://other_user:other_password@pg-other-22222222-promise.b.aivencloud.com:18395/defaultdb"
        with patch.dict(os.environ, {MODULE.AIVEN_TEST_APPROVED_URL_ENV_VAR: approved_url}):
            target = MODULE.validate_database_url(other_url)
            with self.assertRaises(MODULE.PreflightError) as raised:
                MODULE.resolve_target_mode(MODULE.TargetMode.AIVEN_TEST_APPROVED, target, other_url)
        message = str(raised.exception)
        self.assertIn("session-approved", message)
        self.assertNotIn("approved_user", message)
        self.assertNotIn("other_user", message)

    def test_aiven_test_mode_accepts_only_the_exact_session_approved_target(self):
        approved_url = "postgresql://approved_user:approved_password@pg-approved-11111111-promise.a.aivencloud.com:18395/defaultdb"
        with patch.dict(os.environ, {MODULE.AIVEN_TEST_APPROVED_URL_ENV_VAR: approved_url}):
            target = MODULE.validate_database_url(approved_url)
            # Must not raise.
            MODULE.resolve_target_mode(MODULE.TargetMode.AIVEN_TEST_APPROVED, target, approved_url)

    def test_aiven_test_mode_fingerprint_helpers_never_expose_the_raw_url(self):
        approved_url = "postgresql://approved_user:approved_password@pg-approved-11111111-promise.a.aivencloud.com:18395/defaultdb"
        with patch.dict(os.environ, {MODULE.AIVEN_TEST_APPROVED_URL_ENV_VAR: approved_url}):
            fingerprint = MODULE._session_approved_aiven_test_fingerprint()
        self.assertIsInstance(fingerprint, bytes)
        self.assertEqual(len(fingerprint), 32)
        self.assertNotIn(b"approved_user", fingerprint)
        self.assertNotIn(b"approved_password", fingerprint)

    def test_preflight_aiven_test_mode_uses_development_node_env(self):
        approved_url = "postgresql://operator:example-password@pg-example.a.aivencloud.com:18395/defaultdb"
        with patch.dict(os.environ, {MODULE.AIVEN_TEST_APPROVED_URL_ENV_VAR: approved_url}):
            result, process = self._preflight(approved_url, "healthy", mode=MODULE.TargetMode.AIVEN_TEST_APPROVED)
        self.assertEqual(process.environment["NODE_ENV"], "development")
        self.assertNotIn("ALLOW_PROD_DB_MIGRATE_MAIN", process.environment)
        self.assertEqual(result.mode, MODULE.TargetMode.AIVEN_TEST_APPROVED)

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
        self.assertIsNone(MODULE._extract_redacted_audit_result(MODULE.json.dumps(payload)))

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

    def test_production_remote_requires_an_aiven_target(self):
        database_url = "postgresql://u:p@pg-production-123.a.aivencloud.com:18395/defaultdb"
        target = MODULE.validate_database_url(database_url)
        MODULE.resolve_target_mode(MODULE.TargetMode.PRODUCTION_REMOTE, target, database_url)
        with self.assertRaises(MODULE.PreflightError):
            MODULE.resolve_target_mode(
                MODULE.TargetMode.PRODUCTION_REMOTE,
                MODULE.validate_database_url("postgresql://u:p@ep-example-pooler.aws.neon.tech/neondb"),
                "postgresql://u:p@ep-example-pooler.aws.neon.tech/neondb",
            )

    def test_production_remote_child_environment_has_real_production_flags(self):
        database_url = "postgresql://u:p@pg-production-123.a.aivencloud.com:18395/defaultdb"
        target = MODULE.validate_database_url(database_url)
        environment = MODULE.build_child_environment(database_url, target, MODULE.TargetMode.PRODUCTION_REMOTE)
        preflight_environment = MODULE.build_preflight_environment(database_url, target, MODULE.TargetMode.PRODUCTION_REMOTE)
        self.assertEqual(environment["NODE_ENV"], "production")
        self.assertEqual(environment["ALLOW_PROD_DB_MIGRATE_MAIN"], "true")
        self.assertEqual(preflight_environment["NODE_ENV"], "production")
        self.assertNotIn("ALLOW_PROD_DB_MIGRATE_MAIN", preflight_environment)

    def test_production_remote_direct_run_requires_verified_backup_before_command_launch(self):
        database_url = "postgresql://u:p@pg-production-123.a.aivencloud.com:18395/defaultdb"
        preflight = MODULE.PreflightResult(
            MODULE.validate_database_url(database_url),
            MODULE.TargetMode.PRODUCTION_REMOTE,
            ("npm.cmd", "run", "db:migrate:main"),
            MODULE.hashlib.sha256(database_url.encode("utf-8")).digest(),
            "healthy",
        )

        def factory(args, **kwargs):
            raise AssertionError("No command may be launched for production remote mode.")

        outcome = MODULE.run_canonical_migration(database_url, preflight, ROOT, MODULE.TargetMode.PRODUCTION_REMOTE, popen_factory=factory)
        self.assertFalse(outcome.success)
        self.assertEqual(outcome.category, "backup_required")

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

    def test_no_web_admin_schema_update_control_remains(self):
        """SCHEMA-UPDATE-CONTROL-RETIREMENT-01A: the web-admin schema-update
        control (SchemaUpdateControl.tsx, its dedicated API client block, and
        its dedicated backend route/service) was fully retired. Schema
        maintenance is manual through PromiseSchemaMigration.exe only."""
        self.assertFalse(
            (ROOT / "client" / "src" / "pages" / "admin" / "bento" / "tabs" / "settings" / "SchemaUpdateControl.tsx").exists()
        )
        self.assertFalse((ROOT / "server" / "routes" / "schema-update.routes.ts").exists())
        self.assertFalse((ROOT / "server" / "services" / "schema-update-run.service.ts").exists())
        api = (ROOT / "client" / "src" / "lib" / "api" / "adminApi.ts").read_text(encoding="utf-8")
        self.assertNotIn("schemaUpdateApi", api)
        self.assertNotIn("/admin/schema-updates/", api)


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

    def test_pg_connection_env_translates_no_verify_to_a_libpq_valid_sslmode(self):
        # node-postgres accepts sslmode=no-verify (skips cert-chain validation
        # for a self-signed CA, e.g. Aiven test targets); real libpq
        # (dropdb/createdb/pg_dump/pg_restore) does not recognize that value
        # at all and errors with "invalid sslmode value". Translating to
        # libpq's own "require" is the closest valid equivalent (by default,
        # libpq's "require" encrypts without checking the certificate chain)
        # -- but this is not an unconditional claim that the two values are
        # always identical: libpq's "require" upgrades to CA validation if a
        # root certificate is separately supplied (sslrootcert or a
        # discovered default file), which this tool never does.
        env = MODULE._pg_connection_env(
            "postgresql://operator:example-password@pg-example.a.aivencloud.com:18395/defaultdb?sslmode=no-verify", {}
        )
        self.assertEqual(env["PGSSLMODE"], "require")

    def test_pg_connection_env_passes_through_standard_libpq_sslmode_values_unchanged(self):
        for value in ("disable", "allow", "prefer", "require", "verify-ca", "verify-full"):
            with self.subTest(sslmode=value):
                env = MODULE._pg_connection_env(
                    f"postgresql://operator:example-password@localhost:5432/promise?sslmode={value}", {}
                )
                self.assertEqual(env["PGSSLMODE"], value)

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

    def test_run_restore_aiven_test_approved_returns_core_guard_blocked_outcome(self):
        """Replaces the obsolete expectation that Aiven restore calls dropdb
        --force. Aiven Test mode's in-place restore is impossible against
        that target (real pg_hba.conf rejection of the maintenance-database
        connection) -- run_restore now returns a safe blocked outcome before
        any PostgreSQL tool lookup, backup verification, file operation,
        subprocess, or database connection."""
        database_url = "postgresql://operator:example-password@pg-example-12345678-promise.a.aivencloud.com/defaultdb"

        def factory(args, **kwargs):
            raise AssertionError("No subprocess may ever be launched for Aiven Test mode restore.")

        with patch.object(MODULE, "_find_pg_tool", side_effect=lambda name: (_ for _ in ()).throw(AssertionError("_find_pg_tool must never be called for Aiven Test mode restore."))):
            outcome = MODULE.run_restore(database_url, self.tmp_path / "some.dump", MODULE.TargetMode.AIVEN_TEST_APPROVED, popen_factory=factory)
        self.assertFalse(outcome.success)
        self.assertEqual(outcome.category, "restore_unavailable")
        self.assertEqual(outcome.detail, MODULE.AIVEN_RESTORE_PROVIDER_CONTROLLED_MESSAGE)

    def test_run_restore_production_remote_returns_core_guard_before_tool_lookup(self):
        database_url = "postgresql://operator:example-password@pg-production-123.a.aivencloud.com:18395/defaultdb"

        def factory(args, **kwargs):
            raise AssertionError("No subprocess may ever be launched for Production Aiven restore.")

        with patch.object(MODULE, "_find_pg_tool", side_effect=lambda name: (_ for _ in ()).throw(AssertionError("_find_pg_tool must never be called for Production Aiven restore."))):
            outcome = MODULE.run_restore(database_url, self.tmp_path / "some.dump", MODULE.TargetMode.PRODUCTION_REMOTE, popen_factory=factory)
        self.assertFalse(outcome.success)
        self.assertEqual(outcome.category, "restore_unavailable")
        self.assertEqual(outcome.detail, MODULE.AIVEN_RESTORE_PROVIDER_CONTROLLED_MESSAGE)

    def test_run_restore_and_recheck_aiven_test_approved_returns_immediately_without_recheck(self):
        """Core guard proof for run_restore_and_recheck: it must not call
        run_restore, must not call the ledger recheck, must not call
        _find_pg_tool or verify_backup_for_restore, must never launch a
        subprocess, and must return the exact provider-controlled message."""
        database_url = "postgresql://operator:example-password@pg-example-12345678-promise.a.aivencloud.com/defaultdb"

        def factory(args, **kwargs):
            raise AssertionError("No subprocess may ever be launched for Aiven Test mode restore.")

        with patch.object(MODULE, "run_restore") as mock_run_restore, \
             patch.object(MODULE, "_recheck_ledger_classification") as mock_recheck, \
             patch.object(MODULE, "verify_backup_for_restore") as mock_verify, \
             patch.object(MODULE, "_find_pg_tool") as mock_find_pg_tool:
            outcome = MODULE.run_restore_and_recheck(
                database_url, self.tmp_path / "some.dump", self.repo_root, MODULE.TargetMode.AIVEN_TEST_APPROVED, popen_factory=factory,
            )
        mock_run_restore.assert_not_called()
        mock_recheck.assert_not_called()
        mock_verify.assert_not_called()
        mock_find_pg_tool.assert_not_called()
        self.assertFalse(outcome.success)
        self.assertEqual(outcome.category, "restore_unavailable")
        self.assertEqual(outcome.detail, MODULE.AIVEN_RESTORE_PROVIDER_CONTROLLED_MESSAGE)

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

    def test_run_restore_strips_connection_diagnostics_from_dropdb_pg_hba_rejection(self):
        """A real managed-Postgres restore attempt (originally observed
        against an Aiven test target, before Aiven restore was blocked
        entirely by the core guard) surfaced a genuine dropdb connection
        failure whose text echoed the literal target hostname, its resolved
        IP, the connecting client's IP, the username, and the maintenance
        database name in one FATAL line (a pg_hba.conf rejection for the
        maintenance-database connection dropdb/createdb require). None of
        these may ever reach the UI, logs, or evidence. Exercised here via
        Development remote (Neon), the only mode that still reaches dropdb
        with --force, to keep this sanitizer behavior under real test
        coverage now that Aiven Test mode never reaches this code at all."""
        database_url = "postgresql://operator:example-password@pg-example-12345678-promise.a.aivencloud.com:18395/defaultdb".replace(
            "pg-example-12345678-promise.a.aivencloud.com", "ep-example-pooler.aws.neon.tech"
        )
        raw_dropdb_error = (
            'dropdb: error: connection to server at "pg-example-12345678-promise.a.aivencloud.com" '
            '(143.110.177.238), port 18395 failed: FATAL:  pg_hba.conf rejects connection for host '
            '"103.35.156.218", user "operator", database "template1", SSL encryption\n'
        )

        def factory(args, **kwargs):
            if "/fake/dropdb" in args:
                return FakeToolProcess(args, raw_dropdb_error, 1, **kwargs)
            raise AssertionError("createdb/pg_restore must never run when the forced dropdb step fails.")

        with patch.object(MODULE, "_find_pg_tool", side_effect=lambda name: f"/fake/{name}"):
            outcome = MODULE.run_restore(database_url, self.tmp_path / "some.dump", MODULE.TargetMode.DEVELOPMENT_REMOTE, popen_factory=factory)
        self.assertFalse(outcome.success)
        for leaked_fragment in (
            "pg-example-12345678-promise.a.aivencloud.com",
            "143.110.177.238",
            "103.35.156.218",
            '"operator"',
            '"template1"',
            "pg_hba.conf",
            "connection to server at",
        ):
            self.assertNotIn(leaked_fragment, outcome.detail)

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

    def test_remote_restore_dialog_is_parameterized_by_remote_kind_not_hardcoded_to_neon(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        dialog_class = source.split("class RemoteRestoreConfirmDialog", 1)[1].split("\nclass ", 1)[0]
        self.assertIn("remote_kind", dialog_class)
        # The dialog's warning text must be built from the remote_kind
        # parameter, not a hardcoded "Neon"/"development" literal, so Aiven
        # test mode gets an accurate warning instead of a misleading one.
        self.assertIn("{remote_kind}", dialog_class)

    def test_aiven_test_mode_label_and_dialog_are_visually_distinct(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn('TargetMode.AIVEN_TEST_APPROVED: "Aiven test (session approved)"', source)
        # A dedicated ttk style with its own color distinguishes the Aiven
        # test radio button from both Neon development (plain text) and the
        # disabled, red-labeled Production remote option.
        self.assertIn('style.configure("AivenTest.TRadiobutton"', source)
        self.assertIn('style="AivenTest.TRadiobutton"', source)
        # The restore-confirmation call site passes a distinct remote_kind
        # string for Aiven vs Neon, so the dialog text itself differs too.
        self.assertIn('"Aiven test (session approved)"', source)

    def test_production_mode_requires_the_dedicated_two_factor_dialog(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn('TargetMode.PRODUCTION_REMOTE: "Production Aiven"', source)
        self.assertIn("class ProductionMigrationConfirmDialog", source)
        self.assertIn('Type "PRODUCTION MIGRATE" exactly to continue.', source)
        self.assertIn("I understand this changes the production database after backup verification.", source)

    def test_run_backup_and_migrate_blocks_before_backup_when_ledger_unsafe(self):
        database_url = "postgresql://operator:example-password@localhost:5432/promise_disposable"

        def blocked_audit_payload():
            return MODULE.json.dumps({
                "auditVersion": "2", "classification": "checksum_mismatch", "availability": "ledger_readable", "blocked": True,
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
                "auditVersion": "2", "classification": "healthy", "availability": "ledger_readable", "blocked": False,
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

    def test_production_backup_path_marks_the_canonical_run_as_backup_verified(self):
        database_url = "postgresql://operator:example-password@pg-production-123.a.aivencloud.com:18395/defaultdb"
        target = MODULE.validate_database_url(database_url)
        preflight = MODULE.PreflightResult(
            target,
            MODULE.TargetMode.PRODUCTION_REMOTE,
            ("npm.cmd", "run", "db:migrate:main"),
            MODULE.hashlib.sha256(database_url.encode("utf-8")).digest(),
            "pending_only",
        )
        backup = MODULE.BackupResult(True, self.backup_dir / "safe.dump", "a" * 64, 7, "Backup verified.")
        observed = {}

        def fake_run(*args, **kwargs):
            observed["backup_verified"] = kwargs["backup_verified"]
            return MODULE.MigrationOutcome(True, "complete", "Schema migration complete", "Completed.")

        with patch.object(MODULE, "preflight_database_url", return_value=preflight), \
             patch.object(MODULE, "create_backup", return_value=backup), \
             patch.object(MODULE, "run_canonical_migration", side_effect=fake_run), \
             patch.object(MODULE, "_recheck_ledger_classification", return_value="healthy"):
            outcome = MODULE.run_backup_and_migrate(
                database_url,
                target,
                MODULE.TargetMode.PRODUCTION_REMOTE,
                self.repo_root,
                backup_directory=self.backup_dir,
            )
        self.assertTrue(outcome.success)
        self.assertTrue(observed["backup_verified"])


class AivenRestoreBoundaryTests(unittest.TestCase):
    """Real Tkinter behavioral tests: Aiven Test mode must never reach the
    file picker, backup verification, or any restore subprocess. Local and
    Neon Development remote restore must remain fully enabled."""

    def setUp(self):
        try:
            self.root = MODULE.tk.Tk()
        except MODULE.tk.TclError as error:
            self.skipTest(f"No display available for Tkinter in this environment: {error}")
        self.root.withdraw()
        self.app = MODULE.SchemaMigrationApp(self.root, ROOT)

    def tearDown(self):
        self.root.destroy()

    def test_aiven_test_mode_disables_restore_before_any_file_picker(self):
        self.app.target_mode.set(MODULE.TargetMode.AIVEN_TEST_APPROVED.value)
        self.app.database_url.set(
            "postgresql://operator:example-password@pg-example-12345678-promise.a.aivencloud.com:18395/defaultdb"
        )
        with patch.object(MODULE.filedialog, "askopenfilename") as mock_picker, \
             patch.object(MODULE, "verify_backup_for_restore") as mock_verify, \
             patch.object(MODULE, "RemoteRestoreConfirmDialog") as mock_dialog:
            self.app._restore_backup()
        mock_picker.assert_not_called()
        mock_verify.assert_not_called()
        mock_dialog.assert_not_called()
        self.assertEqual(self.app.status_text.get(), MODULE.AIVEN_RESTORE_PROVIDER_CONTROLLED_MESSAGE)

    def test_aiven_test_mode_restore_button_disabled_and_notice_shown(self):
        self.app.target_mode.set(MODULE.TargetMode.AIVEN_TEST_APPROVED.value)
        self.assertEqual(str(self.app.restore_button["state"]), "disabled")
        self.assertEqual(self.app.aiven_restore_notice_var.get(), MODULE.AIVEN_RESTORE_PROVIDER_CONTROLLED_MESSAGE)

    def test_production_mode_restore_button_disabled_and_notice_shown(self):
        self.app.target_mode.set(MODULE.TargetMode.PRODUCTION_REMOTE.value)
        self.assertEqual(str(self.app.restore_button["state"]), "disabled")
        self.assertEqual(self.app.aiven_restore_notice_var.get(), MODULE.AIVEN_RESTORE_PROVIDER_CONTROLLED_MESSAGE)

    def test_production_mode_restore_stops_before_file_picker(self):
        self.app.target_mode.set(MODULE.TargetMode.PRODUCTION_REMOTE.value)
        with patch.object(MODULE.filedialog, "askopenfilename") as mock_picker:
            self.app._restore_backup()
        mock_picker.assert_not_called()
        self.assertEqual(self.app.status_text.get(), MODULE.AIVEN_RESTORE_PROVIDER_CONTROLLED_MESSAGE)

    def test_local_disposable_restore_button_remains_enabled(self):
        self.app.target_mode.set(MODULE.TargetMode.LOCAL_DISPOSABLE.value)
        self.assertEqual(str(self.app.restore_button["state"]), "normal")
        self.assertEqual(self.app.aiven_restore_notice_var.get(), "")

    def test_development_remote_restore_button_remains_enabled(self):
        self.app.target_mode.set(MODULE.TargetMode.DEVELOPMENT_REMOTE.value)
        self.assertEqual(str(self.app.restore_button["state"]), "normal")
        self.assertEqual(self.app.aiven_restore_notice_var.get(), "")

    def test_switching_away_from_aiven_mode_re_enables_restore_and_clears_notice(self):
        self.app.target_mode.set(MODULE.TargetMode.AIVEN_TEST_APPROVED.value)
        self.assertEqual(str(self.app.restore_button["state"]), "disabled")
        self.app.target_mode.set(MODULE.TargetMode.LOCAL_DISPOSABLE.value)
        self.assertEqual(str(self.app.restore_button["state"]), "normal")
        self.assertEqual(self.app.aiven_restore_notice_var.get(), "")

    def test_development_remote_restore_still_reaches_the_file_picker(self):
        # Regression guard: only Aiven Test mode is blocked; Neon Development
        # remote restore behavior must be completely unchanged.
        self.app.target_mode.set(MODULE.TargetMode.DEVELOPMENT_REMOTE.value)
        self.app.database_url.set("postgresql://operator:example-password@ep-example-pooler.aws.neon.tech/neondb")
        with patch.object(MODULE.filedialog, "askopenfilename", return_value="") as mock_picker:
            self.app._restore_backup()
        mock_picker.assert_called_once()

    def test_local_disposable_restore_still_reaches_the_file_picker(self):
        self.app.target_mode.set(MODULE.TargetMode.LOCAL_DISPOSABLE.value)
        self.app.database_url.set("postgresql://operator:example-password@localhost:5432/promise_disposable")
        with patch.object(MODULE.filedialog, "askopenfilename", return_value="") as mock_picker:
            self.app._restore_backup()
        mock_picker.assert_called_once()


class AivenFingerprintGuardStillIntactTests(unittest.TestCase):
    """Confirms this hotfix did not weaken the exact session-approved
    fingerprint gate added in the prior phase."""

    def test_aiven_test_mode_still_requires_exact_session_approved_fingerprint(self):
        approved_url = "postgresql://approved_user:approved_password@pg-approved-11111111-promise.a.aivencloud.com:18395/defaultdb"
        other_url = "postgresql://other_user:other_password@pg-other-22222222-promise.b.aivencloud.com:18395/defaultdb"
        with patch.dict(os.environ, {MODULE.AIVEN_TEST_APPROVED_URL_ENV_VAR: approved_url}):
            approved_target = MODULE.validate_database_url(approved_url)
            MODULE.resolve_target_mode(MODULE.TargetMode.AIVEN_TEST_APPROVED, approved_target, approved_url)  # must not raise
            other_target = MODULE.validate_database_url(other_url)
            with self.assertRaises(MODULE.PreflightError):
                MODULE.resolve_target_mode(MODULE.TargetMode.AIVEN_TEST_APPROVED, other_target, other_url)

    def test_aiven_test_mode_still_rejects_when_no_target_approved(self):
        database_url = "postgresql://operator:example-password@pg-example-12345678-promise.a.aivencloud.com:18395/defaultdb"
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop(MODULE.AIVEN_TEST_APPROVED_URL_ENV_VAR, None)
            target = MODULE.validate_database_url(database_url)
            with self.assertRaises(MODULE.PreflightError):
                MODULE.resolve_target_mode(MODULE.TargetMode.AIVEN_TEST_APPROVED, target, database_url)


class SslModeWordingTests(unittest.TestCase):
    def test_sslmode_translation_comment_does_not_claim_unconditional_identical_behavior(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        comment_block = source.split("_LIBPQ_SSLMODE_TRANSLATION = ", 1)[0][-2000:]
        self.assertNotIn("exact same practical behavior", comment_block)
        # Must acknowledge the real libpq nuance: require can upgrade to CA
        # verification when a root certificate is supplied.
        self.assertIn("sslrootcert", comment_block)
        self.assertIn("not", comment_block.lower())


def json_dump_safe(value):
    return MODULE.json.dumps(value)


if __name__ == "__main__":
    unittest.main()
