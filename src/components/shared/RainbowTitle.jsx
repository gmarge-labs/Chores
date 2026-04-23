import "./RainbowTitle.css";

const LETTERS = [
  { char: "C", color: "#d44719" },
  { char: "h", color: "#ee9412" },
  { char: "o", color: "#1465cf" },
  { char: "r", color: "#0a907f" },
  { char: "e", color: "#7042d6" },
  { char: "H", color: "#c22f7e" },
  { char: "e", color: "#d44719" },
  { char: "r", color: "#ee9412" },
  { char: "o", color: "#1465cf" },
  { char: "e", color: "#0a907f" },
  { char: "s", color: "#7042d6" },
];

export default function RainbowTitle({ size = "md", subtitle }) {
  return (
    <div className={`rainbow-title-wrap rainbow-title-wrap--${size}`}>
      {subtitle && <p className="rainbow-subtitle">{subtitle}</p>}
      <h1 className="rainbow-title" aria-label="ChoreHeroes">
        <span className="title-star" aria-hidden="true">✦</span>
        {LETTERS.map((l, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="title-letter"
            style={{ color: l.color, animationDelay: `${i * 80}ms` }}
          >
            {l.char}
          </span>
        ))}
        <span className="title-star" aria-hidden="true">✦</span>
      </h1>
    </div>
  );
}
