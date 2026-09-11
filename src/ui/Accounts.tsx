import { useState } from "react";
import { api, type Snapshot } from "./api.js";
import {
  Badge,
  Empty,
  Field,
  Form,
  Panel,
  Select,
  text,
} from "./primitives.js";
export type Run = (
  fn: () => Promise<unknown>,
  success?: string,
) => Promise<void>;
export function Accounts({
  state,
  run,
  busy,
}: {
  state: Snapshot;
  run: Run;
  busy: boolean;
}) {
  const [edit, setEdit] = useState<string | undefined>();
  return (
    <>
      <Panel
        title={edit ? "Replace account credentials" : "Connect an account"}
      >
        <div className="pad">
          <p>
            Enter credentials privately. The authenticator secret must already
            be enrolled at the destination.
          </p>
          {!state.adapters.length ? (
            <p className="notice">
              No real portal adapter is installed. Choose a portal for
              integration. The bundled test portal can be enabled using the
              development instructions.
            </p>
          ) : (
            <Form
              busy={busy || !state.vault.unlocked}
              onSubmit={(d, f) =>
                run(async () => {
                  await api(
                    edit ? `accounts/${edit}/credentials` : "accounts",
                    {
                      label: text(d, "label"),
                      adapter: text(d, "adapter"),
                      username: text(d, "username"),
                      password: text(d, "password"),
                      totp: text(d, "totp"),
                    },
                  );
                  f.reset();
                  setEdit(undefined);
                }, "Credentials encrypted. Test the connection to verify account identity.")
              }
            >
              <div className="form-grid">
                <Field name="label" label="Account label" />
                <Select name="adapter" label="Installed adapter">
                  {state.adapters.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </Select>
                <Field name="username" label="Account username" />
                <Field
                  name="password"
                  label="Account password"
                  type="password"
                />
                <Field
                  name="totp"
                  label="Authenticator secret or otpauth URI"
                  type="password"
                />
              </div>
              <button type="submit">
                {edit ? "Replace credentials" : "Save account privately"}
              </button>
              {edit && (
                <button
                  className="secondary"
                  type="button"
                  onClick={() => setEdit(undefined)}
                >
                  Cancel replacement
                </button>
              )}
            </Form>
          )}
          {!state.vault.unlocked && (
            <p className="muted">
              Unlock the vault before entering credentials.
            </p>
          )}
        </div>
      </Panel>
      <Panel title="Accounts">
        {!state.accounts.length ? (
          <Empty title="No accounts connected">
            Your saved accounts will appear here.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Status</th>
                  <th>Who has access</th>
                  <th>Controls</th>
                </tr>
              </thead>
              <tbody>
                {state.accounts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.label}</strong>
                      <small>{a.adapter}</small>
                      <small className="mono">{a.id}</small>
                    </td>
                    <td>
                      <Badge>{a.state.replaceAll("_", " ")}</Badge>
                    </td>
                    <td>
                      {state.grants
                        .filter(
                          (g) => !g.revoked && g.config.account_id === a.id,
                        )
                        .map(
                          (g) =>
                            state.agents.find(
                              (agent) => agent.id === g.config.agent_id,
                            )?.label,
                        )
                        .join(", ") || "No agents"}
                    </td>
                    <td>
                      <div className="actions">
                        <button
                          disabled={busy || !state.vault.unlocked}
                          onClick={() =>
                            void run(
                              () => api(`accounts/${a.id}/verify`, {}),
                              "Account identity verified.",
                            )
                          }
                        >
                          Test connection
                        </button>
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => setEdit(a.id)}
                        >
                          Replace credentials
                        </button>
                        <button
                          className="danger"
                          disabled={busy}
                          onClick={() => {
                            if (
                              confirm(
                                `Revoke all access to ${a.label}? Active tasks will stop.`,
                              )
                            )
                              void run(
                                () =>
                                  api("revoke", {
                                    kind: "account",
                                    id: a.id,
                                    confirmation: "REVOKE",
                                  }),
                                "Account access revoked.",
                              );
                          }}
                        >
                          Revoke
                        </button>
                        <button
                          className="danger"
                          disabled={busy}
                          onClick={() => {
                            if (
                              confirm(
                                `Delete ${a.label}, its credentials, grants and requests? This cannot be undone without a backup.`,
                              )
                            )
                              void run(
                                () =>
                                  api("delete-account", {
                                    id: a.id,
                                    confirmation: "DELETE",
                                  }),
                                "Account deleted.",
                              );
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
