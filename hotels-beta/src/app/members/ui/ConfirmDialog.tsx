"use client";

/* The members area's Yes / No question - the one Delete trip asks - for any
   removal that cannot be undone (2026-10-05). A favourite went at a single
   click, and the next row's Delete slid under the pointer, so a double-click
   removed two. */
export default function ConfirmDialog({
  text,
  onYes,
  onNo,
}: {
  text: string;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div className="members-leave-overlay" onClick={onNo}>
      <div
        className="oltra-glass oltra-panel members-leave-modal"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="members-leave-modal__text">{text}</div>
        <div className="members-leave-modal__actions">
          <div className="oltra-btn-pair">
            <button type="button" className="oltra-btn oltra-btn--destructive" onClick={onYes}>
              Yes
            </button>
            <button type="button" className="oltra-btn" onClick={onNo}>
              No
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
