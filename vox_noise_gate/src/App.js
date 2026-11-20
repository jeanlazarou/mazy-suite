import { useEffect } from "react";
import Box from "@mui/material/Box";

import "./App.css";

import { Editor } from "./Editor";
import packageJson from "../package.json";

function App() {
  useEffect(() => {
    console.info(`Vox Noise Gate v${packageJson.version}`);
  }, []);

  return (
    <Box
      component="main"
      sx={{
        height: "100vh",
        // pin the shell to the viewport: a zoomed waveform must scroll
        // inside itself, not widen the page
        width: "100vw",
        maxWidth: "100vw",
        overflow: "auto",
        position: "relative",
      }}
    >
      <Editor />
    </Box>
  );
}

export default App;
