// Small bridge over MUI replacing the semantic-ui-react primitives this app
// used everywhere. SIcon keeps semantic's class names (`volume up icon`) so
// existing CSS rules and tour selectors keep working.
import React from "react";

import AddIcon from "@mui/icons-material/Add";
import AppsIcon from "@mui/icons-material/Apps";
import ArrowRightAltIcon from "@mui/icons-material/ArrowRightAlt";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import BuildIcon from "@mui/icons-material/Build";
import CheckIcon from "@mui/icons-material/Check";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CloseIcon from "@mui/icons-material/Close";
import CloseFullscreenIcon from "@mui/icons-material/CloseFullscreen";
import ContrastIcon from "@mui/icons-material/Contrast";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import CancelPresentationIcon from "@mui/icons-material/CancelPresentation";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import HeadphonesIcon from "@mui/icons-material/Headphones";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import HistoryIcon from "@mui/icons-material/History";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import ImportExportIcon from "@mui/icons-material/ImportExport";
import InfoIcon from "@mui/icons-material/Info";
import LightModeIcon from "@mui/icons-material/LightMode";
import MenuIcon from "@mui/icons-material/Menu";
import MicIcon from "@mui/icons-material/Mic";
import MinimizeIcon from "@mui/icons-material/Minimize";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import MusicNoteIcon from "@mui/icons-material/MusicNote";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RedoIcon from "@mui/icons-material/Redo";
import RepeatIcon from "@mui/icons-material/Repeat";
import SaveIcon from "@mui/icons-material/Save";
import SettingsIcon from "@mui/icons-material/Settings";
import ShuffleIcon from "@mui/icons-material/Shuffle";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import SkipPreviousIcon from "@mui/icons-material/SkipPrevious";
import StarIcon from "@mui/icons-material/Star";
import StopIcon from "@mui/icons-material/Stop";
import TuneIcon from "@mui/icons-material/Tune";
import UndoIcon from "@mui/icons-material/Undo";
import UploadIcon from "@mui/icons-material/Upload";
import VolumeUpIcon from "@mui/icons-material/VolumeUp";

const ICONS = {
  add: AddIcon,
  adjust: ContrastIcon,
  bars: MenuIcon,
  cancel: CloseIcon,
  check: CheckIcon,
  "check circle outline": CheckCircleOutlineIcon,
  checkmark: CheckIcon,
  close: CloseIcon,
  cog: SettingsIcon,
  compress: CloseFullscreenIcon,
  "ellipsis horizontal": MoreHorizIcon,
  expand: OpenInFullIcon,
  "external alternate": OpenInNewIcon,
  filter: FilterAltIcon,
  headphones: HeadphonesIcon,
  help: HelpOutlineIcon,
  history: HistoryIcon,
  "hourglass start": HourglassTopIcon,
  info: InfoIcon,
  "long arrow alternate right": ArrowRightAltIcon,
  microphone: MicIcon,
  moon: DarkModeIcon,
  music: MusicNoteIcon,
  pause: PauseIcon,
  play: PlayArrowIcon,
  redo: RedoIcon,
  remove: CloseIcon,
  retweet: RepeatIcon,
  save: SaveIcon,
  shuffle: ShuffleIcon,
  "sliders horizontal": TuneIcon,
  sort: ImportExportIcon,
  sound: GraphicEqIcon,
  spinner: AutorenewIcon,
  star: StarIcon,
  "step backward": SkipPreviousIcon,
  "step forward": SkipNextIcon,
  stop: StopIcon,
  sun: LightModeIcon,
  th: AppsIcon,
  undo: UndoIcon,
  upload: UploadIcon,
  "window close outline": CancelPresentationIcon,
  "window minimize": MinimizeIcon,
  "volume up": VolumeUpIcon,
  wrench: BuildIcon,
  x: CloseIcon,
};

// semantic-ui palette
export const COLORS = {
  blue: "#2185d0",
  gray: "#767676",
  green: "#21ba45",
  grey: "#767676",
  olive: "#b5cc18",
  orange: "#f2711c",
  purple: "#a333c8",
  red: "#db2828",
  teal: "#00b5ad",
  yellow: "#fbbd08",
};

const SIZES = {
  mini: "0.4em",
  tiny: "0.6em",
  small: "0.75em",
  large: "1.5em",
  big: "2em",
  huge: "4em",
};

export function SIcon({
  name,
  size,
  color,
  loading,
  className = "",
  style,
  ...rest
}) {
  const Component = ICONS[name] || HelpOutlineIcon;

  return (
    <Component
      className={`${name} icon${color ? ` ${color}` : ""}${
        loading ? " loading" : ""
      }${className ? ` ${className}` : ""}`}
      style={{
        fontSize: SIZES[size] || "1em",
        verticalAlign: "middle",
        color: COLORS[color],
        ...style,
      }}
      {...rest}
    />
  );
}

const LABEL_SIZES = {
  mini: "0.64em",
  tiny: "0.71em",
  small: "0.78em",
  large: "1em",
};

// Replaces semantic <Label>: a colored pill. Keeps the `label` + color class
// names so the existing CSS overrides still apply.
export function SLabel({
  color,
  size,
  floating,
  circular,
  basic,
  className = "",
  style,
  children,
  ...rest
}) {
  const classes = [
    "label",
    color,
    circular ? "circular" : "",
    basic ? "basic" : "",
    floating ? "floating" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classes}
      style={{
        display: "inline-block",
        backgroundColor: basic ? "transparent" : COLORS[color] || "#e8e8e8",
        color: basic ? COLORS[color] : color ? "white" : "rgba(0,0,0,.6)",
        border: basic ? `1px solid ${COLORS[color] || "#e8e8e8"}` : "none",
        fontSize: LABEL_SIZES[size] || "0.85em",
        fontWeight: 700,
        lineHeight: 1,
        padding: circular ? "0.5em" : "0.5833em 0.833em",
        borderRadius: circular ? "500rem" : "0.28571429rem",
        minWidth: circular ? "2em" : undefined,
        minHeight: circular ? "2em" : undefined,
        textAlign: "center",
        position: floating ? "absolute" : undefined,
        zIndex: floating ? 100 : undefined,
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}

// Replaces semantic <Icon.Group> with a corner icon.
export function SIconGroup({ size, children, style }) {
  return (
    <span
      className="icons"
      style={{
        display: "inline-block",
        position: "relative",
        fontSize: SIZES[size] || "1em",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// Replaces semantic <Menu icon> toolbars: a flex bar of .item entries whose
// look lives in index.css.
export function MenuBar({ children, className = "", ...rest }) {
  return (
    <div className={`menu-bar${className ? ` ${className}` : ""}`} {...rest}>
      {children}
    </div>
  );
}

export function MenuBarItem({
  active,
  disabled,
  position,
  onClick,
  className = "",
  children,
  style,
  ...rest
}) {
  const classes = [
    "item",
    active ? "active" : "",
    disabled ? "disabled" : "",
    position === "right" ? "right-item" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      onClick={disabled ? undefined : onClick}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
}
