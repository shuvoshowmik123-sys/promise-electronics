from __future__ import annotations

import datetime
import hashlib
import ipaddress
import json
import os
import re
import sys
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
import shutil
import subprocess
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog, ttk
from typing import Callable, Iterable
from urllib.parse import parse_qsl, unquote, urlsplit


class TargetMode(str, Enum):
    """Explicit migration target modes.

    Replaces the previous "every remote target is production" assumption.
    Only ``LOCAL_DISPOSABLE`` and ``DEVELOPMENT_REMOTE`` may ever launch a
    command in version 1; ``PRODUCTION_REMOTE`` is always blocked before any
    command is built, with a message pointing to the controlled release
    procedure.
    """

    LOCAL_DISPOSABLE = "local_disposable"
    DEVELOPMENT_REMOTE = "development_remote"
    PRODUCTION_REMOTE = "production_remote"


TARGET_MODE_LABELS: dict[TargetMode, str] = {
    TargetMode.LOCAL_DISPOSABLE: "Local disposable",
    TargetMode.DEVELOPMENT_REMOTE: "Development remote (approved Neon development only)",
    TargetMode.PRODUCTION_REMOTE: "Production remote (disabled in this version)",
}

# Development remote is scoped to recognized Neon endpoint hosts only. This is
# a hostname *pattern* (Neon's own domain), never a specific project/database
# hostname, credential, or database name — it does not identify any single
# private Neon endpoint.
DEVELOPMENT_REMOTE_HOST_SUFFIX = ".neon.tech"


def _is_recognized_development_remote_host(host: str) -> bool:
    return host.endswith(DEVELOPMENT_REMOTE_HOST_SUFFIX)


def resolve_target_mode(mode: TargetMode, target: DatabaseTarget) -> None:
    """Validate an explicit target mode against the classified host.

    Raises before any command is built or launched. Production remote is
    always rejected in version 1, regardless of host. Development remote
    accepts only recognized Neon endpoint hosts (hostname ends with
    ``.neon.tech``) — any other remote host (Aiven-pattern, arbitrary, or
    malformed) is rejected here, before any audit or migration subprocess
    is ever started.
    """
    if mode is TargetMode.PRODUCTION_REMOTE:
        raise PreflightError(
            "Production remote migrations are disabled in this version. "
            "Use the controlled production release procedure instead."
        )
    if mode is TargetMode.LOCAL_DISPOSABLE and not target.is_local:
        raise PreflightError(
            "Local disposable mode requires a local Database URL (localhost or 127.0.0.1)."
        )
    if mode is TargetMode.DEVELOPMENT_REMOTE:
        if target.is_local:
            raise PreflightError(
                "Development remote mode requires a non-local Database URL. "
                "Use Local disposable mode for localhost/127.0.0.1 targets."
            )
        if not _is_recognized_development_remote_host(target.host):
            raise PreflightError(
                "Development remote mode only accepts recognized Neon development hosts "
                f'(the hostname must end with "{DEVELOPMENT_REMOTE_HOST_SUFFIX}"). '
                "This target was rejected before any connection was attempted."
            )


@dataclass(frozen=True)
class DatabaseTarget:
    is_local: bool
    host: str
    redacted: str
    database_name: str
    target_fingerprint: str


@dataclass(frozen=True)
class CanonicalCommands:
    audit: tuple[str, ...]
    migration: tuple[str, ...]


@dataclass(frozen=True)
class PreflightResult:
    target: DatabaseTarget
    mode: TargetMode
    command: tuple[str, ...]
    url_fingerprint: bytes
    classification: str


@dataclass(frozen=True)
class MigrationOutcome:
    success: bool
    category: str
    title: str
    detail: str


class PreflightError(ValueError):
    pass


AUDIT_CLASSIFICATIONS = {
    "healthy",
    "pending_only",
    "checksum_mismatch",
    "unexpected_extra",
    "incomplete_or_unavailable",
    "baseline_live_checksum_drift",
}
MIGRATION_ID_PATTERN = re.compile(r"^[A-Za-z0-9_]{1,100}$")
ROLLED_BACK_PREFIX_PATTERN = re.compile(
    r"^\[MainSchema\] Migration ([A-Za-z0-9_]{1,100}) FAILED \(rolled back\):"
)
PSQL_WRAPPED_URL_PATTERN = re.compile(
    r'''^psql\s+(["'])(postgres(?:ql)?://.+)\1$''',
    re.IGNORECASE,
)


def _redacted_host(host: str, is_local: bool) -> str:
    if is_local:
        return host
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        labels = host.split(".")
        if len(labels) >= 3:
            return f"***.{'.'.join(labels[-2:])}"
        return "***"
    if address.version == 4:
        pieces = host.split(".")
        return f"{pieces[0]}.{pieces[1]}.***.***"
    return "****:****:****:****"


def normalize_database_url_input(raw_value: str) -> str:
    """Accept common copy/paste wrappers while yielding one unambiguous URL.

    The utility never accepts arbitrary shell snippets.  It only unwraps an exact
    ``DATABASE_URL=...`` assignment and/or an exact quoted ``psql 'URL'`` command,
    both of which are common in local developer notes.  The resulting value still
    goes through the normal PostgreSQL URL validation before any child process runs.
    """
    value = raw_value.strip()
    if value.upper().startswith("DATABASE_URL="):
        value = value.partition("=")[2].strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        value = value[1:-1].strip()
    wrapped = PSQL_WRAPPED_URL_PATTERN.fullmatch(value)
    if wrapped:
        value = wrapped.group(2)
    return value


def validate_database_url(raw_value: str) -> DatabaseTarget:
    value = normalize_database_url_input(raw_value)
    if not value:
        raise PreflightError("Enter a PostgreSQL Database URL before continuing.")
    if any(character.isspace() or ord(character) < 32 for character in value):
        raise PreflightError("The Database URL is not valid PostgreSQL connection information.")
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError as error:
        raise PreflightError("The Database URL is not valid PostgreSQL connection information.") from error
    if parsed.scheme.lower() not in {"postgres", "postgresql"} or not parsed.hostname:
        raise PreflightError("Use a PostgreSQL URL beginning with postgres:// or postgresql://.")
    routing_query_keys = {"host", "hostname", "port", "database", "dbname", "user", "username", "password"}
    if any(key.lower() in routing_query_keys for key, _value in parse_qsl(parsed.query, keep_blank_values=True)):
        raise PreflightError("Put target and credential fields in the standard URL authority and database path, not query parameters.")
    encoded_database_name = parsed.path[1:] if parsed.path.startswith("/") else ""
    database_name = unquote(encoded_database_name)
    if not database_name or "/" in database_name or len(database_name) > 128:
        raise PreflightError("The Database URL must include one explicit database name in its path.")
    if any(character.isspace() or ord(character) < 32 for character in database_name):
        raise PreflightError("The Database URL contains an invalid database name.")
    host = parsed.hostname.lower()
    is_local = host in {"localhost", "127.0.0.1"}
    display_host = _redacted_host(host, is_local)
    display_port = f":{port}" if port is not None else ""
    display_database_name = re.sub(r"[^A-Za-z0-9_.-]", "_", database_name)[:64]
    target_fingerprint = hashlib.sha256(
        f"{host}:{port or 5432}/{database_name}".encode("utf-8")
    ).hexdigest()[:12].upper()
    target_class = "Local" if is_local else "Remote"
    redacted = (
        f"{target_class}: postgresql://***:***@{display_host}{display_port}/"
        f"{display_database_name} [target {target_fingerprint}]"
    )
    return DatabaseTarget(
        is_local=is_local,
        host=host,
        redacted=redacted,
        database_name=display_database_name,
        target_fingerprint=target_fingerprint,
    )


def _canonical_commands(repo_root: Path) -> CanonicalCommands:
    migration_entrypoint = repo_root / "server" / "db-migrate-main.ts"
    audit_entrypoint = repo_root / "scripts" / "ledger-reconciliation-audit.ts"
    package_file = repo_root / "package.json"
    if not migration_entrypoint.is_file() or not audit_entrypoint.is_file() or not package_file.is_file():
        raise PreflightError("The canonical MAIN migration files were not found. Open this utility from the project checkout.")
    try:
        package = json.loads(package_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise PreflightError("The project migration command could not be verified.") from error
    scripts = package.get("scripts", {})
    if scripts.get("db:migrate:main") != "tsx server/db-migrate-main.ts":
        raise PreflightError("The canonical MAIN migration command does not match the reviewed project command.")
    if scripts.get("schema:audit:ledger") != "tsx scripts/ledger-reconciliation-audit.ts":
        raise PreflightError("The canonical read-only ledger audit command does not match the reviewed project command.")
    npm = shutil.which("npm.cmd") or shutil.which("npm")
    if not npm and os.name == "nt":
        program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
        candidate = Path(program_files) / "nodejs" / "npm.cmd"
        if candidate.is_file():
            npm = str(candidate)
    if not npm:
        raise PreflightError("Node.js/npm was not found. Install the project runtime and reopen this utility.")
    return CanonicalCommands(
        audit=(npm, "run", "schema:audit:ledger"),
        migration=(npm, "run", "db:migrate:main"),
    )


def _with_node_runtime_path(child_environment: dict[str, str]) -> dict[str, str]:
    """Ensure npm's node.exe is resolvable in a GUI-launched child process.

    Windows can find npm.cmd by its absolute Program Files path while the
    environment inherited by a GUI launcher lacks that same directory on PATH.
    npm then starts but cannot locate node.exe.  This only repairs process
    launch; it does not add credentials or change migration authorization.
    """
    if os.name != "nt":
        return child_environment
    program_files = os.environ.get("ProgramFiles", r"C:\\Program Files")
    node_directory = Path(program_files) / "nodejs"
    if not (node_directory / "node.exe").is_file():
        return child_environment
    existing_path = child_environment.get("PATH", "")
    existing_entries = [entry for entry in existing_path.split(os.pathsep) if entry]
    if any(Path(entry).resolve() == node_directory.resolve() for entry in existing_entries):
        return child_environment
    child_environment["PATH"] = str(node_directory) + (
        os.pathsep + existing_path if existing_path else ""
    )
    return child_environment


def build_preflight_environment(database_url: str, target: DatabaseTarget, mode: TargetMode) -> dict[str, str]:
    resolve_target_mode(mode, target)
    child_environment = os.environ.copy()
    child_environment["DATABASE_URL"] = database_url
    child_environment["NODE_ENV"] = "development"
    child_environment.pop("MAIN_MIGRATION_RELEASE_MODE", None)
    child_environment.pop("ALLOW_PROD_DB_MIGRATE_MAIN", None)
    child_environment.pop("MAIN_SCHEMA_TRUST_BASELINE_ADOPTION", None)
    child_environment.pop("MAIN_MIGRATION_TEST_INJECT_FAILURE", None)
    return _with_node_runtime_path(child_environment)


def _extract_redacted_audit_classification(raw_output: str) -> str | None:
    decoder = json.JSONDecoder()
    expected_keys = {
        "auditVersion",
        "classification",
        "blocked",
        "counts",
        "versions",
        "evidenceFingerprint",
        "adoptionDecision",
        "historicalLedgerMutation",
    }
    expected_count_keys = {
        "registryCount",
        "liveAppliedCount",
        "missingCount",
        "mismatchCount",
        "extraCount",
        "baselineEntryCount",
        "baselineMissingFromLiveCount",
        "baselineChecksumDisagreeCount",
        "registryBeyondBaselineCount",
    }
    expected_version_keys = {
        "currentLiveVersion",
        "registryHeadVersion",
        "requiredVersion",
        "baselineVersion",
        "baselineRegistryHead",
    }
    for index, character in enumerate(raw_output):
        if character != "{":
            continue
        try:
            payload, _end = decoder.raw_decode(raw_output[index:])
        except json.JSONDecodeError:
            continue
        if not isinstance(payload, dict):
            continue
        if set(payload) != expected_keys:
            continue
        classification = payload.get("classification")
        if classification not in AUDIT_CLASSIFICATIONS:
            continue
        if payload.get("auditVersion") != "1":
            continue
        if payload.get("adoptionDecision") != "not_performed":
            continue
        if payload.get("historicalLedgerMutation") != "none":
            continue
        counts = payload.get("counts")
        versions = payload.get("versions")
        if not isinstance(counts, dict) or set(counts) != expected_count_keys:
            continue
        if any(not isinstance(value, int) or isinstance(value, bool) or value < 0 for value in counts.values()):
            continue
        if not isinstance(versions, dict) or set(versions) != expected_version_keys:
            continue
        if any(value is not None and not isinstance(value, str) for value in versions.values()):
            continue
        fingerprint = payload.get("evidenceFingerprint")
        if not isinstance(fingerprint, str) or re.fullmatch(r"[a-f0-9]{32}", fingerprint) is None:
            continue
        expected_blocked = classification != "healthy"
        if payload.get("blocked") is not expected_blocked:
            continue
        serialized = json.dumps(payload, separators=(",", ":"))
        if re.search(r"postgres(?:ql)?://|password|database_url|create table|alter table|insert into|stack", serialized, re.IGNORECASE):
            continue
        if re.search(r'"checksum"\s*:', serialized, re.IGNORECASE):
            continue
        return classification
    return None


def _blocked_preflight_message(classification: str) -> str:
    if classification == "checksum_mismatch":
        return "Preflight blocked: the canonical migration ledger has a checksum mismatch. Reconciliation is required."
    if classification == "unexpected_extra":
        return "Preflight blocked: the database ledger contains an unexpected migration entry. Reconciliation is required."
    if classification == "baseline_live_checksum_drift":
        return "Preflight blocked: the live ledger differs from the trusted baseline evidence. Reconciliation is required."
    return "Preflight blocked: database authentication, connectivity, or canonical ledger availability could not be verified."


def _run_read_only_audit(
    database_url: str,
    target: DatabaseTarget,
    mode: TargetMode,
    repo_root: Path,
    command: tuple[str, ...],
    popen_factory: Callable[..., subprocess.Popen[str]],
) -> str:
    child_environment = build_preflight_environment(database_url, target, mode)
    creation_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    raw_output = ""
    try:
        process = popen_factory(
            list(command),
            cwd=repo_root,
            env=child_environment,
            shell=False,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=creation_flags,
        )
        try:
            raw_output, _unused = process.communicate(timeout=45)
        except subprocess.TimeoutExpired as error:
            process.kill()
            process.communicate()
            raise PreflightError("Preflight blocked: the canonical read-only ledger audit timed out.") from error
        classification = _extract_redacted_audit_classification(raw_output)
        if classification is None or process.returncode not in {0, 2}:
            raise PreflightError("Preflight blocked: the canonical read-only ledger audit was unavailable or returned an invalid result.")
        if classification in {"healthy", "pending_only"}:
            return classification
        raise PreflightError(_blocked_preflight_message(classification))
    except PreflightError:
        raise
    except (OSError, subprocess.SubprocessError) as error:
        raise PreflightError("Preflight blocked: the canonical read-only ledger audit could not be started.") from error
    finally:
        raw_output = ""
        child_environment["DATABASE_URL"] = ""


def preflight_database_url(
    raw_value: str,
    repo_root: Path,
    mode: TargetMode,
    popen_factory: Callable[..., subprocess.Popen[str]] = subprocess.Popen,
) -> PreflightResult:
    normalized_value = normalize_database_url_input(raw_value)
    target = validate_database_url(normalized_value)
    resolve_target_mode(mode, target)
    commands = _canonical_commands(repo_root)
    classification = _run_read_only_audit(
        normalized_value,
        target,
        mode,
        repo_root,
        commands.audit,
        popen_factory,
    )
    return PreflightResult(
        target=target,
        mode=mode,
        command=commands.migration,
        url_fingerprint=hashlib.sha256(normalized_value.encode("utf-8")).digest(),
        classification=classification,
    )


def build_child_environment(database_url: str, target: DatabaseTarget, mode: TargetMode) -> dict[str, str]:
    """Build the migration child environment for an explicit, pre-validated target mode.

    Production remote is always rejected by ``resolve_target_mode`` before this
    point is reached. Both remaining modes (local disposable, development
    remote) run with ``NODE_ENV=development`` and never set
    ``ALLOW_PROD_DB_MIGRATE_MAIN`` — only the controlled release procedure sets
    that flag for a real production run.
    """
    resolve_target_mode(mode, target)
    child_environment = os.environ.copy()
    child_environment["DATABASE_URL"] = database_url
    child_environment["MAIN_MIGRATION_RELEASE_MODE"] = "true"
    child_environment["NODE_ENV"] = "development"
    child_environment.pop("ALLOW_PROD_DB_MIGRATE_MAIN", None)
    child_environment.pop("MAIN_SCHEMA_TRUST_BASELINE_ADOPTION", None)
    child_environment.pop("MAIN_MIGRATION_TEST_INJECT_FAILURE", None)
    return _with_node_runtime_path(child_environment)


def _reviewed_migration_ids(repo_root: Path) -> frozenset[str]:
    registry_path = repo_root / "server" / "services" / "main-schema-migrate.service.ts"
    try:
        source = registry_path.read_text(encoding="utf-8")
    except OSError:
        return frozenset()
    return frozenset(
        migration_id
        for migration_id in re.findall(r'^\s*id:\s*"([A-Za-z0-9_]{1,100})",', source, re.MULTILINE)
        if MIGRATION_ID_PATTERN.fullmatch(migration_id)
    )


def _safe_outcome(return_code: int, output: Iterable[str]) -> MigrationOutcome:
    saw_skipped = False
    saw_lock_timeout = False
    saw_checksum_failure = False
    saw_invalid_target = False
    failed_migration_id = None
    for line in output:
        lowered = line.lower()
        saw_skipped = saw_skipped or lowered == "skipped" or "[db:migrate:main] skipped" in lowered
        saw_lock_timeout = saw_lock_timeout or lowered == "lock timeout" or "lock timeout" in lowered
        saw_checksum_failure = saw_checksum_failure or lowered == "checksum mismatch" or "checksum mismatch" in lowered
        saw_invalid_target = saw_invalid_target or lowered == "invalid database configuration" or "invalid database configuration" in lowered
        if lowered.startswith("migration_failed:"):
            candidate = line.partition(":")[2]
            if MIGRATION_ID_PATTERN.fullmatch(candidate):
                failed_migration_id = candidate
    if return_code == 0 and saw_skipped:
        return MigrationOutcome(True, "current", "Schema already current", "The canonical MAIN registry reported no pending schema changes.")
    if return_code == 0:
        return MigrationOutcome(True, "complete", "Schema migration complete", "The canonical MAIN migration command completed successfully. The database ledger contains the durable record.")
    if return_code == 2 or saw_lock_timeout:
        return MigrationOutcome(False, "lock_timeout", "Migration lock unavailable", "Another migration process owns the advisory lock. Wait for it to finish, then run preflight again.")
    if saw_checksum_failure:
        return MigrationOutcome(False, "integrity_blocked", "Schema integrity blocked", "The canonical checksum guard rejected the run. Reconcile the migration ledger through the reviewed audit process.")
    if saw_invalid_target:
        return MigrationOutcome(False, "invalid_target", "Target rejected", "The canonical migration command rejected the database configuration. Re-enter the URL and run preflight again.")
    if failed_migration_id:
        return MigrationOutcome(False, "migration_failed", "Migration rolled back", f"Migration {failed_migration_id} failed and was rolled back. Share this migration ID for review; raw database details were not displayed.")
    return MigrationOutcome(False, "failed", "Schema migration failed safely", "The canonical migration command did not complete. No raw database error was displayed; review approved server-side diagnostics before retrying.")


def run_canonical_migration(
    database_url: str,
    preflight: PreflightResult,
    repo_root: Path,
    mode: TargetMode,
    popen_factory: Callable[..., subprocess.Popen[str]] = subprocess.Popen,
) -> MigrationOutcome:
    try:
        normalized_url = normalize_database_url_input(database_url)
        validate_database_url(normalized_url)
    except PreflightError:
        return MigrationOutcome(
            False,
            "invalid_target",
            "Target rejected",
            "The Database URL is no longer valid. Re-enter it and run Test / Preflight again.",
        )
    if hashlib.sha256(normalized_url.encode("utf-8")).digest() != preflight.url_fingerprint:
        return MigrationOutcome(
            False,
            "invalid_target",
            "Target changed",
            "The Database URL changed after preflight. Run Test / Preflight again before starting a migration.",
        )
    if mode is not preflight.mode:
        return MigrationOutcome(
            False,
            "invalid_target",
            "Target mode changed",
            "The target mode changed after preflight. Run Test / Preflight again before starting a migration.",
        )
    try:
        child_environment = build_child_environment(normalized_url, preflight.target, mode)
    except PreflightError as error:
        return MigrationOutcome(False, "invalid_target", "Target rejected", str(error))
    reviewed_migration_ids = _reviewed_migration_ids(repo_root)
    creation_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    try:
        process = popen_factory(
            list(preflight.command),
            cwd=repo_root,
            env=child_environment,
            shell=False,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=creation_flags,
        )
        output = process.stdout if process.stdout is not None else ()
        safe_markers = []
        for line in output:
            lowered = line.lower()
            if "[db:migrate:main] skipped" in lowered:
                safe_markers.append("skipped")
            elif "lock timeout" in lowered:
                safe_markers.append("lock timeout")
            elif "checksum mismatch" in lowered:
                safe_markers.append("checksum mismatch")
            elif "invalid database configuration" in lowered:
                safe_markers.append("invalid database configuration")
            else:
                rolled_back = ROLLED_BACK_PREFIX_PATTERN.match(line.rstrip("\r\n"))
                if rolled_back and rolled_back.group(1) in reviewed_migration_ids:
                    safe_markers.append(f"migration_failed:{rolled_back.group(1)}")
        line = ""
        outcome = _safe_outcome(process.wait(), safe_markers)
    except (OSError, subprocess.SubprocessError):
        outcome = MigrationOutcome(False, "launcher_error", "Migration command could not start", "The canonical npm command could not be launched. Run preflight again after verifying the project runtime.")
    finally:
        child_environment["DATABASE_URL"] = ""
    return outcome


# --- Backup / restore (pg_dump / pg_restore only — no migration SQL here) --------
#
# This section never authors schema/DDL. It only creates and verifies a
# pg_dump custom-format backup and, on restore, invokes pg_restore against the
# selected file. The reviewed Node migration command remains the only thing
# that ever changes the MAIN schema. Credentials are passed to pg_dump/
# pg_restore exclusively via child-process environment variables (PGHOST/
# PGPORT/PGDATABASE/PGUSER/PGPASSWORD/PGSSLMODE) — never on any command line
# and never written to disk, logs, or backup metadata.

BACKUP_FILE_SUFFIX = ".dump"
BACKUP_METADATA_SUFFIX = ".json"
MIGRATE_CONFIRMATION_TEXT = "MIGRATE"
RESTORE_CONFIRMATION_TEXT = "RESTORE"


@dataclass(frozen=True)
class BackupResult:
    success: bool
    backup_path: Path | None
    sha256: str | None
    toc_entry_count: int | None
    message: str


@dataclass(frozen=True)
class RestoreVerification:
    ok: bool
    message: str
    toc_entry_count: int | None


def default_backup_directory(repo_root: Path) -> Path:
    """Backup destination, always outside the project checkout.

    Uses the platform's local application-data directory (never the repo)
    so a backup can never be accidentally tracked or shipped with the
    checkout. Defensively refuses if the resolved path is somehow inside
    repo_root.
    """
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA") or str(Path.home())
    directory = Path(base) / "PromiseSchemaMigrationBackups"
    resolved_directory = directory.resolve()
    resolved_repo_root = repo_root.resolve()
    if resolved_directory == resolved_repo_root or resolved_repo_root in resolved_directory.parents:
        raise PreflightError("Refusing to use a backup directory inside the project checkout.")
    return directory


def _find_pg_tool(tool_name: str) -> str:
    found = shutil.which(tool_name) or shutil.which(f"{tool_name}.exe")
    if found:
        return found
    if os.name == "nt":
        program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
        pg_root = Path(program_files) / "PostgreSQL"
        if pg_root.is_dir():
            for version_dir in sorted(pg_root.iterdir(), reverse=True):
                candidate = version_dir / "bin" / f"{tool_name}.exe"
                if candidate.is_file():
                    return str(candidate)
    raise PreflightError(f"{tool_name} was not found. Install the PostgreSQL client tools and reopen this utility.")


def _pg_connection_env(database_url: str, base_environment: dict[str, str]) -> dict[str, str]:
    """Build libpq environment variables from the URL.

    Never places the URL, host, database name, username, or password on any
    process command line — only in the immediate child process's
    environment, which callers zero out again immediately afterward.
    """
    parsed = urlsplit(database_url)
    environment = base_environment.copy()
    environment["PGHOST"] = parsed.hostname or ""
    environment["PGPORT"] = str(parsed.port or 5432)
    database_name = unquote(parsed.path[1:]) if parsed.path.startswith("/") else ""
    environment["PGDATABASE"] = database_name
    if parsed.username:
        environment["PGUSER"] = unquote(parsed.username)
    if parsed.password:
        environment["PGPASSWORD"] = unquote(parsed.password)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    if "sslmode" in query:
        environment["PGSSLMODE"] = query["sslmode"]
    return environment


def _clear_pg_env(environment: dict[str, str]) -> None:
    for key in ("PGPASSWORD", "PGUSER", "PGHOST", "PGDATABASE", "PGSSLMODE", "PGPORT"):
        if key in environment:
            environment[key] = ""


_UNSAFE_TOOL_OUTPUT_PATTERN = re.compile(
    r"postgres(?:ql)?://"
    r"|password"
    r"|\balter\s+(?:table|default|role|database)\b"
    r"|\bgrant\b"
    r"|\bcreate\s+(?:table|role|database|schema|index)\b"
    r"|\bdrop\s+(?:table|role|database|schema|index)\b"
    r"|\binsert\s+into\b"
    r"|\bselect\b.+\bfrom\b",
    re.IGNORECASE,
)


def _sanitize_tool_output(text: str) -> str:
    """Strip anything resembling a credential/connection string or a raw SQL
    statement before this text is ever shown or returned to the caller.
    Matches the same discipline already used on the Node/TypeScript side
    (``sanitizeErrorMessage``) — a real database error from pg_dump/
    pg_restore/dropdb/createdb often echoes the literal failing SQL
    statement, which must never reach the UI, logs, or evidence verbatim."""
    lines = [line for line in text.splitlines() if not _UNSAFE_TOOL_OUTPUT_PATTERN.search(line)]
    joined = "\n".join(lines).strip()
    return joined[:400] if joined else ""


def _sha256_of_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _pg_restore_list(pg_restore_path: str, backup_path: Path, popen_factory: Callable[..., subprocess.Popen[str]]) -> tuple[bool, int]:
    """Read-only archive inspection — never connects to any database."""
    creation_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    try:
        process = popen_factory(
            [pg_restore_path, "--list", str(backup_path)],
            cwd=backup_path.parent,
            env=os.environ.copy(),
            shell=False,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=creation_flags,
        )
        raw_output, _unused = process.communicate(timeout=60)
    except subprocess.TimeoutExpired:
        process.kill()
        process.communicate()
        return False, 0
    except (OSError, subprocess.SubprocessError):
        return False, 0
    if process.returncode != 0:
        return False, 0
    entry_count = sum(1 for line in raw_output.splitlines() if line.strip() and not line.strip().startswith(";"))
    return entry_count > 0, entry_count


def create_backup(
    database_url: str,
    target: DatabaseTarget,
    repo_root: Path,
    backup_directory: Path | None = None,
    popen_factory: Callable[..., subprocess.Popen[str]] = subprocess.Popen,
) -> BackupResult:
    """Create and verify a pg_dump custom-format backup outside the checkout.

    Verification is pg_restore --list (archive readable, non-empty TOC) plus
    a SHA-256 recorded in a sidecar metadata file alongside the backup — the
    metadata never contains the database URL, host, username, or password.
    """
    try:
        directory = backup_directory if backup_directory is not None else default_backup_directory(repo_root)
        directory.mkdir(parents=True, exist_ok=True)
    except (OSError, PreflightError) as error:
        return BackupResult(False, None, None, None, f"Could not prepare the backup directory: {error}")

    try:
        pg_dump_path = _find_pg_tool("pg_dump")
        pg_restore_path = _find_pg_tool("pg_restore")
    except PreflightError as error:
        return BackupResult(False, None, None, None, str(error))

    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_path = directory / f"{target.database_name}_{target.target_fingerprint}_{timestamp}{BACKUP_FILE_SUFFIX}"

    child_environment = _with_node_runtime_path(_pg_connection_env(database_url, os.environ.copy()))
    creation_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    try:
        process = popen_factory(
            [pg_dump_path, "--format=custom", "--no-password", "--file", str(backup_path)],
            cwd=directory,
            env=child_environment,
            shell=False,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            creationflags=creation_flags,
        )
        raw_output, _unused = process.communicate(timeout=300)
        return_code = process.returncode
    except subprocess.TimeoutExpired:
        process.kill()
        process.communicate()
        return BackupResult(False, None, None, None, "The backup command timed out.")
    except (OSError, subprocess.SubprocessError):
        return BackupResult(False, None, None, None, "The backup command could not be started.")
    finally:
        _clear_pg_env(child_environment)

    if return_code != 0 or not backup_path.is_file():
        detail = _sanitize_tool_output(raw_output)
        if backup_path.is_file():
            backup_path.unlink(missing_ok=True)
        return BackupResult(False, None, None, None, f"Backup failed. {detail or 'No safe diagnostic detail was returned.'}")

    verified, toc_entry_count = _pg_restore_list(pg_restore_path, backup_path, popen_factory)
    if not verified:
        backup_path.unlink(missing_ok=True)
        return BackupResult(False, None, None, None, "Backup verification failed: pg_restore --list could not read the archive. The unverified backup file was removed.")

    sha256 = _sha256_of_file(backup_path)
    metadata = {
        "targetFingerprint": target.target_fingerprint,
        "sha256": sha256,
        "createdAtUtc": timestamp,
        "tocEntryCount": toc_entry_count,
        "databaseNameMasked": target.database_name,
    }
    metadata_path = backup_path.parent / f"{backup_path.name}{BACKUP_METADATA_SUFFIX}"
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    return BackupResult(True, backup_path, sha256, toc_entry_count, f"Backup created and verified ({toc_entry_count} archive entries).")


def verify_backup_for_restore(
    backup_path: Path,
    target: DatabaseTarget,
    popen_factory: Callable[..., subprocess.Popen[str]] = subprocess.Popen,
) -> RestoreVerification:
    """Verify SHA-256 and saved target fingerprint before any restore runs."""
    if not backup_path.is_file():
        return RestoreVerification(False, "The selected backup file was not found.", None)

    metadata_path = backup_path.parent / f"{backup_path.name}{BACKUP_METADATA_SUFFIX}"
    if not metadata_path.is_file():
        return RestoreVerification(False, "Backup metadata was not found next to this file. Refusing to restore an unverified backup.", None)
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return RestoreVerification(False, "Backup metadata could not be read. Refusing to restore an unverified backup.", None)

    saved_sha256 = metadata.get("sha256")
    saved_fingerprint = metadata.get("targetFingerprint")
    if not isinstance(saved_sha256, str) or not isinstance(saved_fingerprint, str):
        return RestoreVerification(False, "Backup metadata is incomplete. Refusing to restore an unverified backup.", None)

    actual_sha256 = _sha256_of_file(backup_path)
    if actual_sha256 != saved_sha256:
        return RestoreVerification(False, "The backup file's SHA-256 no longer matches its recorded value. Refusing to restore a changed or corrupted backup.", None)

    if saved_fingerprint != target.target_fingerprint:
        return RestoreVerification(False, "This backup was created from a different database target. Refusing to restore into a mismatched database.", None)

    try:
        pg_restore_path = _find_pg_tool("pg_restore")
    except PreflightError as error:
        return RestoreVerification(False, str(error), None)

    verified, toc_entry_count = _pg_restore_list(pg_restore_path, backup_path, popen_factory)
    if not verified:
        return RestoreVerification(False, "pg_restore --list could not read this backup archive. Refusing to restore.", None)

    return RestoreVerification(True, f"Backup verified: SHA-256 and target fingerprint match ({toc_entry_count} archive entries).", toc_entry_count)


def _run_pg_tool(
    tool_path: str,
    args: list[str],
    cwd: Path,
    environment: dict[str, str],
    popen_factory: Callable[..., subprocess.Popen[str]],
    timeout: int = 120,
) -> tuple[int, str]:
    creation_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    process = popen_factory(
        [tool_path, *args],
        cwd=cwd,
        env=environment,
        shell=False,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=creation_flags,
    )
    raw_output, _unused = process.communicate(timeout=timeout)
    return process.returncode, raw_output


def run_restore(
    database_url: str,
    backup_path: Path,
    mode: TargetMode,
    popen_factory: Callable[..., subprocess.Popen[str]] = subprocess.Popen,
) -> MigrationOutcome:
    """Restore a verified backup by dropping and recreating the target
    database, then running a plain pg_restore into the fresh, empty
    database. This is the standard, dependency-order-safe pattern for a
    full-database custom-format restore — restoring in place with
    ``--clean`` can fail on cross-table foreign-key/constraint dependency
    ordering that ``--if-exists`` alone does not resolve. ``dropdb`` and
    ``createdb`` are trusted PostgreSQL client tools, the same family as
    pg_dump/pg_restore; no SQL is authored here.

    For ``TargetMode.DEVELOPMENT_REMOTE`` only, ``dropdb`` is invoked with
    PostgreSQL's own ``--force`` flag (``DROP DATABASE ... WITH (FORCE)``,
    PostgreSQL 13+), which disconnects other sessions from the target before
    dropping it. This is a first-class, PostgreSQL-supported CLI option —
    never handwritten SQL, never a direct ``pg_terminate_backend`` call, and
    never used for local disposable targets (local restore behavior is
    unchanged from before this hotfix). The caller (the GUI) is responsible
    for only reaching this function in development-remote mode after both of
    the required explicit confirmations have been satisfied.
    """
    try:
        dropdb_path = _find_pg_tool("dropdb")
        createdb_path = _find_pg_tool("createdb")
        pg_restore_path = _find_pg_tool("pg_restore")
    except PreflightError as error:
        return MigrationOutcome(False, "launcher_error", "Restore command could not start", str(error))

    child_environment = _with_node_runtime_path(_pg_connection_env(database_url, os.environ.copy()))
    # pg_restore, dropdb, and createdb all take the target database name as
    # an explicit argument. The database name is not a credential, so this
    # does not violate the "never put credentials on a command line" rule
    # (only PGPASSWORD/PGUSER/PGHOST stay environment-only). dropdb/createdb
    # connect to a maintenance database to act on the named target, so
    # PGDATABASE must not point at that same target while they run.
    target_database_name = child_environment.get("PGDATABASE", "")
    maintenance_environment = child_environment.copy()
    maintenance_environment.pop("PGDATABASE", None)

    use_forced_drop = mode is TargetMode.DEVELOPMENT_REMOTE
    dropdb_args = ["--if-exists", "--no-password"]
    if use_forced_drop:
        dropdb_args.append("--force")
    dropdb_args.append(target_database_name)

    try:
        drop_code, drop_output = _run_pg_tool(
            dropdb_path, dropdb_args,
            backup_path.parent, maintenance_environment, popen_factory,
        )
        if drop_code != 0:
            detail = _sanitize_tool_output(drop_output)
            if use_forced_drop:
                reason = detail or "PostgreSQL's forced-drop option could not disconnect the other session(s) and remove the target database."
                return MigrationOutcome(False, "restore_failed", "Restore failed", f"{reason} No other restore method was attempted.")
            return MigrationOutcome(False, "restore_failed", "Restore failed", detail or "Could not drop the target database before restoring.")

        create_code, create_output = _run_pg_tool(
            createdb_path, ["--no-password", target_database_name],
            backup_path.parent, maintenance_environment, popen_factory,
        )
        if create_code != 0:
            return MigrationOutcome(False, "restore_failed", "Restore failed", _sanitize_tool_output(create_output) or "Could not recreate the target database before restoring.")

        restore_code, restore_output = _run_pg_tool(
            pg_restore_path, ["--no-owner", "--no-password", "--dbname", target_database_name, str(backup_path)],
            backup_path.parent, child_environment, popen_factory, timeout=300,
        )
    except subprocess.TimeoutExpired:
        return MigrationOutcome(False, "restore_timeout", "Restore timed out", "A restore step did not complete in time.")
    except (OSError, subprocess.SubprocessError):
        return MigrationOutcome(False, "launcher_error", "Restore command could not start", "A restore step could not be launched.")
    finally:
        _clear_pg_env(child_environment)
        _clear_pg_env(maintenance_environment)

    detail = _sanitize_tool_output(restore_output)
    if restore_code == 0:
        return MigrationOutcome(True, "restore_complete", "Restore complete", "The target database was recreated and the selected backup was restored successfully.")
    return MigrationOutcome(False, "restore_failed", "Restore failed", detail or "pg_restore did not complete successfully. No raw database error was displayed.")


def _recheck_ledger_classification(
    database_url: str,
    repo_root: Path,
    mode: TargetMode,
    popen_factory: Callable[..., subprocess.Popen[str]] = subprocess.Popen,
) -> str:
    """Best-effort read-only ledger recheck. Returns a safe classification
    string or a safe unavailable message — never raises to the caller."""
    try:
        result = preflight_database_url(database_url, repo_root, mode, popen_factory)
        return result.classification
    except PreflightError as error:
        return f"unavailable ({error})"


def run_backup_and_migrate(
    database_url: str,
    target: DatabaseTarget,
    mode: TargetMode,
    repo_root: Path,
    backup_directory: Path | None = None,
    popen_factory: Callable[..., subprocess.Popen[str]] = subprocess.Popen,
) -> MigrationOutcome:
    """Schema check -> verified backup -> reviewed migration -> ledger recheck.

    Never runs the migration unless the read-only schema check first reports
    the ledger safe (healthy or pending-only), and never runs the migration
    unless the backup was created and verified successfully.
    """
    try:
        preflight = preflight_database_url(database_url, repo_root, mode, popen_factory)
    except PreflightError as error:
        return MigrationOutcome(False, "backup_migrate_blocked", "Backup and migrate blocked", f"Schema check failed before any backup was attempted. {error}")

    backup_result = create_backup(database_url, target, repo_root, backup_directory, popen_factory)
    if not backup_result.success:
        return MigrationOutcome(False, "backup_failed", "Backup and migrate failed", f"{backup_result.message} No migration was attempted.")

    migration_outcome = run_canonical_migration(database_url, preflight, repo_root, mode, popen_factory)
    recheck = _recheck_ledger_classification(database_url, repo_root, mode, popen_factory)

    backup_detail = (
        f"Backup verified before migrating: {backup_result.backup_path.name if backup_result.backup_path else 'unknown'} "
        f"(SHA-256 {backup_result.sha256[:12] if backup_result.sha256 else 'unknown'}..., "
        f"{backup_result.toc_entry_count} archive entries)."
    )
    combined_detail = f"{backup_detail} {migration_outcome.detail} Ledger recheck: {recheck}."
    return MigrationOutcome(migration_outcome.success, migration_outcome.category, migration_outcome.title, combined_detail)


def run_restore_and_recheck(
    database_url: str,
    backup_path: Path,
    repo_root: Path,
    mode: TargetMode,
    popen_factory: Callable[..., subprocess.Popen[str]] = subprocess.Popen,
) -> MigrationOutcome:
    """Restore a verified backup, then run a best-effort read-only ledger
    recheck regardless of the restore's own reported outcome. pg_restore's
    exit code reflects whether every statement in the archive succeeded, not
    necessarily whether the data was substantively restored — a non-fatal
    class of error (e.g. a managed provider's own internal default-privilege
    grants that the ordinary owner role cannot replay) can make pg_restore
    exit non-zero even though every actual table and row was restored.
    Reporting the true ledger state either way, without changing the
    reported success/failure outcome, lets the operator see what actually
    happened instead of only a bare pass/fail exit code."""
    restore_outcome = run_restore(database_url, backup_path, mode, popen_factory)
    recheck = _recheck_ledger_classification(database_url, repo_root, mode, popen_factory)
    combined_detail = f"{restore_outcome.detail} Ledger recheck: {recheck}."
    return MigrationOutcome(restore_outcome.success, restore_outcome.category, restore_outcome.title, combined_detail)


REMOTE_RESTORE_CONSENT_TEXT = (
    "I understand this will end active connections to this development test database."
)


class RemoteRestoreConfirmDialog(tk.Toplevel):
    """Two-factor confirmation required before a Development remote restore
    may use PostgreSQL's forced-drop option.

    Requires BOTH an explicit, unchecked-by-default consent checkbox AND a
    typed "RESTORE" confirmation before OK does anything. Shows only the
    target fingerprint and the verification result — never the database
    name, host, or any part of the URL — even though the tool's other,
    already-reviewed confirmation dialogs show a masked database name; this
    dialog intentionally omits it as well, minimizing what a screenshot of
    this specific warning could ever reveal.
    """

    def __init__(self, parent: tk.Misc, target_fingerprint: str, verification_message: str):
        super().__init__(parent)
        self.title("Type to confirm remote restore")
        self.result = False
        self.resizable(False, False)
        self.transient(parent)

        outer = ttk.Frame(self, padding=20)
        outer.pack(fill="both", expand=True)

        ttk.Label(
            outer,
            text=(
                "Restoring a remote development database requires ending its active "
                "connections first. This is a development-only Neon test target — "
                f"[target {target_fingerprint}]."
            ),
            foreground="#a94442",
            wraplength=480,
            justify="left",
        ).pack(anchor="w")
        ttk.Label(outer, text=verification_message, wraplength=480, justify="left").pack(anchor="w", pady=(8, 0))

        self.consent_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            outer,
            text=REMOTE_RESTORE_CONSENT_TEXT,
            variable=self.consent_var,
        ).pack(anchor="w", pady=(12, 0))

        ttk.Label(outer, text=f'Type "{RESTORE_CONFIRMATION_TEXT}" exactly to continue.').pack(anchor="w", pady=(12, 4))
        self.typed_var = tk.StringVar()
        entry = ttk.Entry(outer, textvariable=self.typed_var, width=50)
        entry.pack(anchor="w", fill="x")

        self.hint_var = tk.StringVar(value="")
        ttk.Label(outer, textvariable=self.hint_var, foreground="#a94442").pack(anchor="w", pady=(4, 0))

        button_row = ttk.Frame(outer)
        button_row.pack(fill="x", pady=(16, 0))
        ttk.Button(button_row, text="OK", command=self._on_ok).pack(side="left")
        ttk.Button(button_row, text="Cancel", command=self._on_cancel).pack(side="left", padx=(10, 0))

        self.protocol("WM_DELETE_WINDOW", self._on_cancel)
        entry.focus_set()
        self.grab_set()
        self.wait_window(self)

    def _on_ok(self) -> None:
        if not self.consent_var.get():
            self.hint_var.set("Check the box to confirm you understand active connections will be ended.")
            return
        if self.typed_var.get() != RESTORE_CONFIRMATION_TEXT:
            self.hint_var.set(f'Type "{RESTORE_CONFIRMATION_TEXT}" exactly (case-sensitive) to continue.')
            return
        self.result = True
        self.destroy()

    def _on_cancel(self) -> None:
        self.result = False
        self.destroy()


class SchemaMigrationApp:
    def __init__(self, root: tk.Tk, repo_root: Path):
        self.root = root
        self.repo_root = repo_root
        self.database_url = tk.StringVar()
        self.show_url = tk.BooleanVar(value=False)
        self.target_mode = tk.StringVar(value=TargetMode.LOCAL_DISPOSABLE.value)
        self.status_text = tk.StringVar(value="Enter a PostgreSQL Database URL, then run Test / Preflight.")
        self.preflight_result: PreflightResult | None = None
        self.running = False
        self._build()
        self.database_url.trace_add("write", self._on_url_changed)
        self.target_mode.trace_add("write", self._on_url_changed)
        self.root.protocol("WM_DELETE_WINDOW", self._close)

    def _build(self) -> None:
        self.root.title("Promise Electronics - Schema Migration")
        self.root.geometry("700x760")
        self.root.minsize(660, 700)
        outer = ttk.Frame(self.root, padding=24)
        outer.pack(fill="both", expand=True)

        ttk.Label(outer, text="Windows Schema Migration Utility", font=("Segoe UI", 16, "bold")).pack(anchor="w")
        ttk.Label(
            outer,
            text=(
                "Runs only the reviewed TypeScript MAIN migration registry (npm run db:migrate:main). "
                "Backups use pg_dump/pg_restore only — no migration SQL is ever authored here. "
                "Credentials are never saved to disk, logs, evidence, registry, config, or crash reports. "
                "This utility must be run from a verified project checkout — it is not a standalone server installer."
            ),
            wraplength=650,
        ).pack(anchor="w", pady=(4, 16))

        ttk.Label(outer, text="Target mode").pack(anchor="w")
        mode_frame = ttk.Frame(outer)
        mode_frame.pack(fill="x", pady=(4, 12))
        ttk.Radiobutton(
            mode_frame,
            text=TARGET_MODE_LABELS[TargetMode.LOCAL_DISPOSABLE],
            variable=self.target_mode,
            value=TargetMode.LOCAL_DISPOSABLE.value,
        ).pack(anchor="w")
        ttk.Radiobutton(
            mode_frame,
            text=TARGET_MODE_LABELS[TargetMode.DEVELOPMENT_REMOTE],
            variable=self.target_mode,
            value=TargetMode.DEVELOPMENT_REMOTE.value,
        ).pack(anchor="w")
        ttk.Radiobutton(
            mode_frame,
            text=TARGET_MODE_LABELS[TargetMode.PRODUCTION_REMOTE],
            variable=self.target_mode,
            value=TargetMode.PRODUCTION_REMOTE.value,
            state="disabled",
        ).pack(anchor="w")
        ttk.Label(
            mode_frame,
            text="Production uses the controlled release procedure and is not available from this utility.",
            foreground="#a94442",
            wraplength=630,
        ).pack(anchor="w", pady=(2, 0))

        ttk.Label(outer, text="PostgreSQL Database URL").pack(anchor="w")
        entry_row = ttk.Frame(outer)
        entry_row.pack(fill="x", pady=(6, 8))
        self.url_entry = ttk.Entry(entry_row, textvariable=self.database_url, show="*", font=("Consolas", 10))
        self.url_entry.pack(side="left", fill="x", expand=True)
        self.show_check = ttk.Checkbutton(entry_row, text="Show", variable=self.show_url, command=self._toggle_visibility)
        self.show_check.pack(side="left", padx=(10, 0))

        ttk.Label(
            outer,
            text="Preflight connects read-only through the canonical ledger audit. Development remote runs require a separate redacted confirmation.",
            foreground="#5f6368",
            wraplength=650,
        ).pack(anchor="w")

        status_frame = ttk.LabelFrame(outer, text="Status", padding=14)
        status_frame.pack(fill="x", pady=(20, 16))
        ttk.Label(status_frame, textvariable=self.status_text, wraplength=610).pack(anchor="w")
        self.progress = ttk.Progressbar(status_frame, mode="indeterminate")
        self.progress.pack(fill="x", pady=(12, 0))

        action_row = ttk.Frame(outer)
        action_row.pack(fill="x")
        self.preflight_button = ttk.Button(action_row, text="Test / Preflight", command=self._preflight)
        self.preflight_button.pack(side="left")
        self.run_button = ttk.Button(action_row, text="Run Schema", command=self._run, state="disabled")
        self.run_button.pack(side="right")
        ttk.Button(action_row, text="Clear", command=self._clear).pack(side="right", padx=(0, 10))

        ttk.Label(
            outer,
            text="Backup and restore",
            font=("Segoe UI", 11, "bold"),
        ).pack(anchor="w", pady=(20, 2))
        ttk.Label(
            outer,
            text=(
                "Backup and migrate runs the schema check, then a verified pg_dump backup outside this "
                "checkout, then the reviewed migration command. Restore backup verifies a prior backup's "
                "SHA-256 and saved target fingerprint before running pg_restore. Non-local targets require "
                "typed confirmation."
            ),
            foreground="#5f6368",
            wraplength=650,
        ).pack(anchor="w", pady=(0, 8))
        backup_action_row = ttk.Frame(outer)
        backup_action_row.pack(fill="x")
        self.backup_migrate_button = ttk.Button(backup_action_row, text="Backup and Migrate", command=self._backup_and_migrate)
        self.backup_migrate_button.pack(side="left")
        self.restore_button = ttk.Button(backup_action_row, text="Restore Backup", command=self._restore_backup)
        self.restore_button.pack(side="left", padx=(10, 0))

        self.url_entry.focus_set()

    def _selected_mode(self) -> TargetMode:
        return TargetMode(self.target_mode.get())

    def _toggle_visibility(self) -> None:
        self.url_entry.configure(show="" if self.show_url.get() else "*")

    def _on_url_changed(self, *_args: object) -> None:
        if self.running:
            return
        self.preflight_result = None
        self.run_button.configure(state="disabled")

    def _set_busy(self, busy: bool) -> None:
        self.running = busy
        state = "disabled" if busy else "normal"
        self.preflight_button.configure(state=state)
        self.url_entry.configure(state=state)
        self.show_check.configure(state=state)
        self.backup_migrate_button.configure(state=state)
        self.restore_button.configure(state=state)
        if busy:
            self.run_button.configure(state="disabled")
            self.progress.start(12)
        else:
            self.progress.stop()

    def _preflight(self) -> None:
        database_url = self.database_url.get()
        mode = self._selected_mode()
        self._set_busy(True)
        self.status_text.set("Running the canonical read-only ledger audit. No schema changes are being applied...")
        threading.Thread(target=self._preflight_worker, args=(database_url, mode), daemon=True).start()

    def _preflight_worker(self, database_url: str, mode: TargetMode) -> None:
        try:
            result = preflight_database_url(database_url, self.repo_root, mode)
        except PreflightError as error:
            self.root.after(0, self._finish_preflight, None, str(error))
            return
        self.root.after(0, self._finish_preflight, result, None)

    def _finish_preflight(self, result: PreflightResult | None, error: str | None) -> None:
        self._set_busy(False)
        if result is None:
            self.preflight_result = None
            self.run_button.configure(state="disabled")
            self.status_text.set(error or "Preflight could not be completed safely.")
            return
        self.preflight_result = result
        state_label = "ledger healthy" if result.classification == "healthy" else "reviewed migrations pending"
        self.status_text.set(f"Preflight passed ({state_label}). {result.target.redacted}")
        self.run_button.configure(state="normal")

    def _run(self) -> None:
        preflight = self.preflight_result
        database_url = self.database_url.get().strip()
        mode = self._selected_mode()
        if preflight is None:
            self.status_text.set("Run Test / Preflight before starting a schema migration.")
            return
        if mode is not preflight.mode:
            self.status_text.set("The target mode changed after preflight. Run Test / Preflight again.")
            self.preflight_result = None
            self.run_button.configure(state="disabled")
            return
        try:
            current_target = validate_database_url(database_url)
            resolve_target_mode(mode, current_target)
        except PreflightError as error:
            self.status_text.set(str(error))
            self.run_button.configure(state="disabled")
            return
        current_fingerprint = hashlib.sha256(database_url.encode("utf-8")).digest()
        if current_fingerprint != preflight.url_fingerprint:
            self.status_text.set("The target changed after preflight. Run Test / Preflight again.")
            self.preflight_result = None
            self.run_button.configure(state="disabled")
            return
        if mode is TargetMode.DEVELOPMENT_REMOTE:
            confirmed = messagebox.askyesno(
                "Confirm development remote schema migration",
                (
                    "Run the reviewed MAIN migrations against this redacted development target?\n\n"
                    f"{current_target.redacted}\n\n"
                    "This runs with NODE_ENV=development. The production execution flag "
                    "(ALLOW_PROD_DB_MIGRATE_MAIN) is never set by this utility."
                ),
                icon="warning",
            )
            if not confirmed:
                self.status_text.set("Development remote schema migration cancelled. No command was started.")
                return
        self._set_busy(True)
        self.status_text.set(f"Running canonical MAIN migrations. {current_target.redacted}")
        self.database_url.set("")
        threading.Thread(target=self._run_worker, args=(database_url, preflight, mode), daemon=True).start()

    def _run_worker(self, database_url: str, preflight: PreflightResult, mode: TargetMode) -> None:
        outcome = run_canonical_migration(database_url, preflight, self.repo_root, mode)
        self.root.after(0, self._finish, outcome)

    def _finish(self, outcome: MigrationOutcome) -> None:
        self._set_busy(False)
        self.preflight_result = None
        self.run_button.configure(state="disabled")
        self.status_text.set(f"{outcome.title}. {outcome.detail}")
        if outcome.success:
            messagebox.showinfo(outcome.title, outcome.detail)
        else:
            messagebox.showerror(outcome.title, outcome.detail)

    def _clear(self) -> None:
        if self.running:
            return
        self.database_url.set("")
        self.show_url.set(False)
        self._toggle_visibility()
        self.status_text.set("Enter a PostgreSQL Database URL, then run Test / Preflight.")
        self.url_entry.focus_set()

    def _backup_and_migrate(self) -> None:
        database_url = self.database_url.get().strip()
        mode = self._selected_mode()
        try:
            target = validate_database_url(database_url)
            resolve_target_mode(mode, target)
        except PreflightError as error:
            self.status_text.set(str(error))
            return
        if mode is not TargetMode.LOCAL_DISPOSABLE:
            typed = simpledialog.askstring(
                "Type to confirm migration",
                "This will back up, verify, and then run the reviewed migration against this "
                f"redacted non-local target:\n\n{target.redacted}\n\n"
                f'Type "{MIGRATE_CONFIRMATION_TEXT}" exactly to continue.',
                parent=self.root,
            )
            if typed != MIGRATE_CONFIRMATION_TEXT:
                self.status_text.set("Backup and migrate cancelled. No command was started.")
                return
        self._set_busy(True)
        self.status_text.set(f"Running canonical read-only ledger audit before backup. {target.redacted}")
        submitted_url = database_url
        self.database_url.set("")
        threading.Thread(target=self._backup_and_migrate_worker, args=(submitted_url, target, mode), daemon=True).start()

    def _backup_and_migrate_worker(self, database_url: str, target: DatabaseTarget, mode: TargetMode) -> None:
        outcome = run_backup_and_migrate(database_url, target, mode, self.repo_root)
        self.root.after(0, self._finish, outcome)

    def _restore_backup(self) -> None:
        database_url = self.database_url.get().strip()
        mode = self._selected_mode()
        try:
            target = validate_database_url(database_url)
            resolve_target_mode(mode, target)
        except PreflightError as error:
            self.status_text.set(str(error))
            return
        backup_directory = default_backup_directory(self.repo_root)
        chosen = filedialog.askopenfilename(
            title="Choose a prior backup to restore",
            initialdir=str(backup_directory) if backup_directory.is_dir() else str(Path.home()),
            filetypes=[("Schema migration backups", f"*{BACKUP_FILE_SUFFIX}")],
            parent=self.root,
        )
        if not chosen:
            self.status_text.set("Restore cancelled. No backup was selected.")
            return
        backup_path = Path(chosen)
        verification = verify_backup_for_restore(backup_path, target)
        if not verification.ok:
            self.status_text.set(verification.message)
            messagebox.showerror("Backup verification failed", verification.message)
            return
        if mode is TargetMode.DEVELOPMENT_REMOTE:
            dialog = RemoteRestoreConfirmDialog(self.root, target.target_fingerprint, verification.message)
            confirmed = dialog.result
        else:
            typed = simpledialog.askstring(
                "Type to confirm restore",
                "This will overwrite objects in this redacted target database with the selected "
                f"backup:\n\n{target.redacted}\n\n{verification.message}\n\n"
                f'Type "{RESTORE_CONFIRMATION_TEXT}" exactly to continue.',
                parent=self.root,
            )
            confirmed = typed == RESTORE_CONFIRMATION_TEXT
        if not confirmed:
            self.status_text.set("Restore cancelled. No command was started.")
            return
        self._set_busy(True)
        self.status_text.set(f"Restoring backup. {target.redacted}")
        submitted_url = database_url
        self.database_url.set("")
        threading.Thread(target=self._restore_worker, args=(submitted_url, backup_path, mode), daemon=True).start()

    def _restore_worker(self, database_url: str, backup_path: Path, mode: TargetMode) -> None:
        outcome = run_restore_and_recheck(database_url, backup_path, self.repo_root, mode)
        self.root.after(0, self._finish, outcome)

    def _close(self) -> None:
        if self.running:
            messagebox.showwarning("Operation in progress", "Keep this utility open until the current safety check or migration finishes.")
            return
        self.database_url.set("")
        self.root.destroy()


def _resolve_repo_root() -> Path:
    """Resolve the verified project checkout this instance is running from.

    In a normal source checkout, that is simply the parent of ``tools/``.
    When frozen into a PyInstaller executable, ``__file__`` resolves inside
    the temporary bundle extraction directory (``sys._MEIPASS``), not
    wherever the .exe itself is actually launched from, so that path is
    useless for finding the reviewed Node migration sources next to it.
    Instead, search upward from the real .exe location for the reviewed
    project sentinel files. If none is found, ``_canonical_commands`` fails
    closed with a clear error — this utility never claims to be a
    standalone installer.
    """
    if getattr(sys, "frozen", False):
        start = Path(sys.executable).resolve().parent
    else:
        start = Path(__file__).resolve().parent
    for candidate in (start, *start.parents):
        if (candidate / "package.json").is_file() and (candidate / "server" / "db-migrate-main.ts").is_file():
            return candidate
    return start


def _icon_path() -> Path | None:
    """Locate the packaged application icon, in both source and frozen-exe layouts."""
    bundle_root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    for base in (bundle_root, Path(__file__).resolve().parent):
        candidate = base / "packaging" / "assets" / "windows_schema_migration_icon.ico"
        if candidate.is_file():
            return candidate
    return None


def main() -> None:
    repo_root = _resolve_repo_root()
    root = tk.Tk()
    style = ttk.Style(root)
    if "vista" in style.theme_names():
        style.theme_use("vista")
    icon_path = _icon_path()
    if icon_path is not None:
        try:
            root.iconbitmap(default=str(icon_path))
        except tk.TclError:
            pass
    SchemaMigrationApp(root, repo_root)
    root.mainloop()


if __name__ == "__main__":
    main()
