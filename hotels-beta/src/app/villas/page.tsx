import PageShell from "@/components/site/PageShell";

export default function VillasPage() {
  return (
    <PageShell
      current="Villas"
      eyebrow="Villas"
      title="Private villas with space, privacy and character."
      intro="A future curated collection of refined private stays, from coastal estates to discreet countryside houses."
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
        Villas page placeholder.
      </div>
    </PageShell>
  );
}