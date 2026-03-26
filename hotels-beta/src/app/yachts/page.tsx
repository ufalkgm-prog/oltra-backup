import PageShell from "@/components/site/PageShell";

export default function YachtsPage() {
  return (
    <PageShell
      current="Yachts"
      eyebrow="Yachts"
      title="Yachts selected with the same restrained luxury lens."
      intro="A future section for charter discovery, editorial highlights and considered maritime journeys."
    >
      <div
        style={{
          borderRadius: "28px",
          padding: "28px",
          background: "rgba(255,255,255,0.18)",
          border: "1px solid rgba(255,255,255,0.22)",
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
          color: "#fff",
        }}
      >
        Yachts page placeholder.
      </div>
    </PageShell>
  );
}