/* The star after a hotel or restaurant name when the member has it as a
 * favourite (Ulrik, 2026-09-24): on every card, after the name rather than
 * before it, with "Your favourite" as a popup on hover (.oltra-favourite-star
 * in oltra-theme.css). */
export default function FavouriteStar() {
  return (
    <span
      className="oltra-favourite-star"
      role="img"
      aria-label="Your favourite"
      data-tip="Your favourite"
    >
      ★
    </span>
  );
}
