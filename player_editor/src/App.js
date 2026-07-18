import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";

import "./App.css";

import { loadAlbums } from "./api";

import { AlbumsList } from "./AlbumsList";
import { currentTrack, Editor } from "./Editor";
import packageJson from "../package.json";

const SIDEBAR_WIDTH = 350;

function App() {
  const [visible, setVisible] = useState(true);
  const [albums, setAlbums] = useState([]);
  const [track, setTrack] = useAtom(currentTrack);

  useEffect(() => {
    console.info(`Player Editor v${packageJson.version}`);

    loadAlbums().then((lists) => {
      setAlbums(
        lists.sort((a, b) => a.playlist.title.localeCompare(b.playlist.title))
      );
    });
  }, []);

  return (
    <Box
      sx={{
        display: "flex",
        height: "100vh",
        // pin the shell to the viewport: #root is a grid with auto tracks,
        // so without this a zoomed waveform would widen the whole page
        width: "100vw",
        maxWidth: "100vw",
        overflow: "hidden",
      }}
    >
      <Drawer
        variant="persistent"
        anchor="left"
        open={visible}
        sx={{
          width: visible ? SIDEBAR_WIDTH : 0,
          flexShrink: 0,
          transition: "width 225ms ease",
        }}
        PaperProps={{
          sx: {
            width: SIDEBAR_WIDTH,
            backgroundColor: "#1b1c1d",
            color: "rgb(234, 235, 224)",
            overflowX: "hidden",
          },
        }}
      >
        <AlbumsList
          albums={albums}
          onSelectTrack={(track) => setTrack(track)}
        />
      </Drawer>

      <Box
        component="main"
        sx={{
          // basis 0 so wide content (zoomed waveform) can never grow the
          // pane and retrigger WaveSurfer's ResizeObserver in a loop
          flex: "1 1 0",
          minWidth: 0,
          overflow: "auto",
          position: "relative",
          // containing block for the fixed-positioned sidebar handle
          transform: "translateX(0)",
        }}
      >
        <Editor
          track={track}
          sideVisible={visible}
          onSidebarToggle={() => setVisible(!visible)}
        />
      </Box>
    </Box>
  );
}

export default App;
