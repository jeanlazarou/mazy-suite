import { useState } from "react";
import { useAtom } from "jotai";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import DeleteIcon from "@mui/icons-material/Delete";
import ThumbUpOffAltIcon from "@mui/icons-material/ThumbUpOffAlt";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";

import { currentSong } from "./Lyrics";
import { mapTimings, timingsQuickFix, toSMPTETimecode } from "./utils";

const warningCell = { backgroundColor: "#fffaf3", color: "#573a08" };

function Timing({ text, start, end, warning, onClick, removed }) {
  return (
    <TableRow
      className={removed ? "removed-timing" : ""}
      sx={{ "&:nth-of-type(odd)": { backgroundColor: "action.hover" } }}
    >
      <TableCell sx={warning ? warningCell : undefined} width={40}>
        {warning ? <WarningAmberIcon fontSize="small" /> : null}
      </TableCell>
      <TableCell>{text}</TableCell>
      <TableCell sx={warning ? warningCell : undefined}>
        {toSMPTETimecode(start)}
      </TableCell>
      <TableCell>{toSMPTETimecode(end)}</TableCell>
      <TableCell width={40}>
        <IconButton
          size="small"
          aria-label={removed ? "restore" : "remove"}
          onClick={() => onClick(start)}
        >
          {removed ? (
            <ThumbUpOffAltIcon fontSize="small" />
          ) : (
            <DeleteIcon fontSize="small" />
          )}
        </IconButton>
      </TableCell>
    </TableRow>
  );
}

function TimingsReport({ song, onClick, removed }) {
  return mapTimings(song, (text, start, end, overlaps) => {
    return (
      <Timing
        key={start}
        text={text}
        start={start}
        end={end}
        warning={overlaps}
        onClick={onClick}
        removed={removed.has(start)}
      />
    );
  });
}

function FixedTimingsReport({ song, onClick, removed }) {
  return timingsQuickFix(song).map(({ text, start, end }) => (
    <Timing
      key={start}
      text={text}
      start={start}
      end={end}
      onClick={onClick}
      removed={removed.has(start)}
    />
  ));
}

export function TimingsCheck({ open, onClose }) {
  const [song, setSong] = useAtom(currentSong);

  const [quickFix, setQuickFix] = useState(false);
  const [toRemove, setToRemove] = useState(new Set());

  const toggleRemove = (start) => {
    const current = new Set(toRemove.values());

    if (current.has(start)) {
      current.delete(start);
    } else {
      current.add(start);
    }

    setToRemove(current);
  };

  const canApply = quickFix || toRemove.size > 0;

  const apply = () => {
    const timings = timingsQuickFix(song)
      .filter(({ start }) => !toRemove.has(start))
      .reduce((acc, { start, end }, i) => {
        acc.push([start, i + 1]);
        acc.push([end, null]);

        return acc;
      }, []);

    const newSong = { ...song, timings };

    setSong(newSong);

    onClose();
  };

  return (
    <Dialog open={!!open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        Timings of <i>{song.title}</i>
      </DialogTitle>
      <DialogContent dividers>
        {song.lyrics.length === 0 || song.timings.length === 0 ? (
          "No timings yet..."
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell></TableCell>
                <TableCell>Verse</TableCell>
                <TableCell>From</TableCell>
                <TableCell>To</TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {quickFix ? (
                <FixedTimingsReport
                  song={song}
                  onClick={toggleRemove}
                  removed={toRemove}
                />
              ) : (
                <TimingsReport
                  song={song}
                  onClick={toggleRemove}
                  removed={toRemove}
                />
              )}
            </TableBody>
          </Table>
        )}
      </DialogContent>
      <DialogActions>
        <FormControlLabel
          sx={{ marginRight: "auto", marginLeft: 1 }}
          control={
            <Checkbox
              checked={quickFix}
              onChange={(e) => setQuickFix(e.target.checked)}
            />
          }
          label="Quick fix"
        />
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="success"
          onClick={apply}
          disabled={!canApply}
        >
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}
