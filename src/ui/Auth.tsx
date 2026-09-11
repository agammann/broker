import { useState } from "react";
import { api } from "./api.js";
import { Field, Form, text } from "./primitives.js";
export function Auth({
  initialized,
  onDone,
}: {
  initialized: boolean;
  onDone: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="auth">
      <a className="brand" href="/">
        ◈ <strong>Broker</strong>
      </a>
      <h1>{initialized ? "Welcome back" : "Keep control of account access"}</h1>
      <p>
        {initialized
          ? "Sign in to your owner dashboard."
          : "Create your owner login and a separate vault passphrase. Both stay inside Broker."}
      </p>
      <Form
        busy={busy}
        onSubmit={async (d, f) => {
          setBusy(true);
          setError("");
          try {
            if (!initialized) {
              if (text(d, "passphrase") !== text(d, "confirm"))
                throw Error("Vault passphrases do not match");
              await api("setup", {
                setup_token: text(d, "setup_token"),
                password: text(d, "password"),
                passphrase: text(d, "passphrase"),
              });
            }
            await api("login", { password: text(d, "password") });
            f.reset();
            onDone();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {!initialized && (
          <Field
            name="setup_token"
            label="Private setup token"
            type="password"
          />
        )}
        <Field name="password" label="Owner password" type="password" />
        {!initialized && (
          <>
            <Field name="passphrase" label="Vault passphrase" type="password" />
            <Field
              name="confirm"
              label="Confirm vault passphrase"
              type="password"
            />
            <p className="muted">
              Use different passwords, each at least 12 characters. Keep your
              vault passphrase safe: Broker cannot recover it.
            </p>
            <p className="muted">
              Find your private setup token in the file created by the
              installation command. Enter secrets here, never in agent chat.
            </p>
          </>
        )}
        <button type="submit">
          {busy
            ? "Please wait…"
            : initialized
              ? "Sign in"
              : "Create owner account"}
        </button>
      </Form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </main>
  );
}
