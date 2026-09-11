import { api, type Snapshot, when } from "./api.js";
import { Field, Form, Panel, text } from "./primitives.js";
import type { Run } from "./Accounts.js";
export function Maintenance({
  state,
  run,
  busy,
  refreshAuth,
}: {
  state: Snapshot;
  run: Run;
  busy: boolean;
  refreshAuth: () => void;
}) {
  return (
    <>
      <Panel title="Vault">
        <div className="pad">
          <p>
            {state.vault.unlocked
              ? `Unlocked until ${when(state.vault.locks_at)}. Unattended tasks stop when it locks.`
              : "Locked. Unlock to authenticate accounts and run tasks."}
          </p>
          {state.vault.unlocked ? (
            <button
              disabled={busy}
              onClick={() =>
                void run(
                  () => api("vault/lock", {}),
                  "Vault locked. Sessions closed and pending work cancelled.",
                )
              }
            >
              Lock vault now
            </button>
          ) : (
            <Form
              busy={busy}
              onSubmit={(d, f) =>
                run(async () => {
                  await api("vault/unlock", {
                    passphrase: text(d, "passphrase"),
                  });
                  f.reset();
                }, "Vault unlocked.")
              }
            >
              <Field
                name="passphrase"
                label="Vault passphrase"
                type="password"
              />
              <button>Unlock vault</button>
            </Form>
          )}
        </div>
      </Panel>
      <Panel title="Automatic lock and retention">
        <div className="pad">
          <Form
            busy={busy}
            onSubmit={(d) =>
              run(
                () =>
                  api("settings", {
                    lock_seconds: Number(text(d, "lock_seconds")),
                    retention_days: Number(text(d, "retention_days")),
                  }),
                "Settings saved.",
              )
            }
          >
            <div className="form-grid">
              <Field
                name="lock_seconds"
                label="Lock after seconds (60–86400)"
                type="number"
                value={state.settings.lock_seconds}
              />
              <Field
                name="retention_days"
                label="Activity retention days (1–365)"
                type="number"
                value={state.settings.retention_days}
              />
            </div>
            <button>Save settings</button>
          </Form>
        </div>
      </Panel>
      <Panel title="Change vault passphrase">
        <div className="pad">
          <Form
            busy={busy}
            onSubmit={(d, f) =>
              run(async () => {
                if (text(d, "next") !== text(d, "confirm"))
                  throw Error("Passphrases do not match");
                await api("vault/passphrase", {
                  current: text(d, "current"),
                  next: text(d, "next"),
                });
                f.reset();
              }, "Passphrase changed. Existing backups still need the old passphrase.")
            }
          >
            <div className="form-grid">
              <Field
                name="current"
                label="Current passphrase"
                type="password"
              />
              <Field name="next" label="New passphrase" type="password" />
              <Field
                name="confirm"
                label="Confirm new passphrase"
                type="password"
              />
            </div>
            <button>Change passphrase</button>
          </Form>
        </div>
      </Panel>
      <Panel title="Encrypted backup and restore">
        <div className="pad">
          <p>
            Backups contain encrypted credentials and access configuration.
            Restoring replaces accounts, revokes restored agents and requires
            account verification. Your current owner login remains.
          </p>
          <button
            disabled={busy || !state.vault.unlocked}
            onClick={() =>
              void run(async () => {
                const b = await api("vault/backup", {}),
                  u = URL.createObjectURL(
                    new Blob([JSON.stringify(b)], { type: "application/json" }),
                  ),
                  a = document.createElement("a");
                a.href = u;
                a.download = `broker-${new Date().toISOString().slice(0, 10)}.backup`;
                a.click();
                URL.revokeObjectURL(u);
              }, "Encrypted backup downloaded.")
            }
          >
            Download encrypted backup
          </button>
          <hr />
          <Form
            busy={busy}
            onSubmit={(d, f) =>
              run(async () => {
                if (
                  !confirm(
                    "Replace all accounts and grants with this backup? Current sessions will close and restored agents will be revoked.",
                  )
                )
                  return;
                const file = d.get("backup") as File;
                if (file.size > 8 * 1024 * 1024)
                  throw Error("Backup is too large");
                await api("vault/restore", {
                  backup: JSON.parse(await file.text()),
                  passphrase: text(d, "passphrase"),
                  confirmation: text(d, "confirmation"),
                });
                f.reset();
                refreshAuth();
              }, "Backup restored. Sign in again.")
            }
          >
            <Field name="backup" label="Encrypted backup file" type="file" />
            <Field
              name="passphrase"
              label="Backup vault passphrase"
              type="password"
            />
            <Field
              name="confirmation"
              label="Type RESTORE to replace current data"
            />
            <button className="danger">Restore backup</button>
          </Form>
        </div>
      </Panel>
    </>
  );
}
