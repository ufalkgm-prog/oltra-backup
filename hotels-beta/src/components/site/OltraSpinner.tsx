type Props = {
  size?: number;
  label?: string;
};

export default function OltraSpinner({ size = 16, label = "Loading" }: Props) {
  return (
    <span
      className="oltra-spinner"
      style={{ width: size, height: size, borderWidth: Math.max(1, Math.round(size / 8)) }}
      role="status"
      aria-label={label}
    />
  );
}
