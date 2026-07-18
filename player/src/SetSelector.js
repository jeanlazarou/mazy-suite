import { SIcon } from "./ui";

import { useIsMobile } from "./utils";

function SetHalf({ set, index, side, isActive, isMobile, canSelect, onSelect }) {
  const count = set.range[1] - set.range[0] + 1;

  return (
    <div
      className={`set-half set-half--${side}`}
      onClick={() => canSelect && onSelect(String(index))}
      style={{ cursor: canSelect ? "pointer" : "default" }}
    >
      <div className={`set-overlay${isActive ? " set-overlay--active" : ""}${isMobile ? " set-overlay--visible" : ""}`}>
        <span className="set-label">{set.label}</span>
        <span className="set-count">{count} tracks</span>
        {isActive && <SIcon name="check circle outline" style={{ marginTop: 8, fontSize: "1.2em" }} />}
      </div>
    </div>
  );
}

export function SetSelector({ sets, coverUrl, activeIndex, canSelect = true, onSelect, onClose, mode = "gate" }) {
  const isMobile = useIsMobile();
  const isModal = mode === "modal";
  const totalTracks = sets ? sets[sets.length - 1].range[1] + 1 : 0;

  return (
    <div className={`set-selector-backdrop${isModal ? " set-selector-backdrop--modal" : ""}`}>
      {isModal && (
        <button className="set-selector-close" onClick={onClose} aria-label="Close">
          <SIcon name="close" size="large" />
        </button>
      )}

      <div className={`set-selector-image-wrap${isMobile ? " set-selector-image-wrap--vertical" : ""}`}>
        {coverUrl && <img src={coverUrl} alt="Cover" className="set-cover" />}

        {sets && sets.map((set, i) => (
          <SetHalf
            key={i}
            set={set}
            index={i}
            side={isMobile ? (i === 0 ? "top" : "bottom") : (i === 0 ? "left" : "right")}
            isActive={activeIndex === String(i)}
            isMobile={isMobile}
            canSelect={canSelect}
            onSelect={onSelect}
          />
        ))}
      </div>

      <div className="set-selector-footer">
        <button
          className={`set-full-btn${activeIndex === "all" ? " set-full-btn--active" : ""}`}
          onClick={() => onSelect("all")}
        >
          {activeIndex === "all" && <SIcon name="check circle outline" />}
          Play Full Set · {totalTracks} tracks
        </button>
      </div>
    </div>
  );
}
