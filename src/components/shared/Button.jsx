import "./Button.css";

export default function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  fullWidth = false,
  type = "button",
}) {
  return (
    <button
      type={type}
      className={[
        "ch-btn",
        `ch-btn--${variant}`,
        `ch-btn--${size}`,
        fullWidth ? "ch-btn--full" : "",
        loading ? "ch-btn--loading" : "",
      ].join(" ").trim()}
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? <span className="ch-btn-spinner" /> : children}
    </button>
  );
}
