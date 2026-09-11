import type { ReactNode, FormEvent } from "react";
export function Field({
  name,
  label,
  type = "text",
  value,
  required = true,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  value?: string | number;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="field">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        placeholder={placeholder}
        autoComplete={type === "password" ? "new-password" : "off"}
      />
    </label>
  );
}
export function Select({
  name,
  label,
  children,
}: {
  name: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      {label}
      <select name={name} aria-label={label} required>
        {children}
      </select>
    </label>
  );
}
export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span aria-hidden="true" className="empty-mark">
        ◇
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}
export function Form({
  children,
  onSubmit,
  busy = false,
}: {
  children: ReactNode;
  onSubmit: (data: FormData, form: HTMLFormElement) => void | Promise<void>;
  busy?: boolean;
}) {
  return (
    <form
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!busy)
          void onSubmit(new FormData(e.currentTarget), e.currentTarget);
      }}
    >
      <fieldset disabled={busy}>{children}</fieldset>
    </form>
  );
}
export const text = (d: FormData, k: string) => String(d.get(k) ?? "");
