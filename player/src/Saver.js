class Saver {
  static save(data) {
    if (global.features.saveToClipboard) {
      copyToClipBoard(data);
    } else {
      console.info(data);
    }
  }
}

function copyToClipBoard(data) {
  const copyTextarea = document.createElement("textarea");

  copyTextarea.textContent = JSON.stringify(data, null, 2);

  document.body.appendChild(copyTextarea);
  copyTextarea.select();

  document.execCommand("copy");

  document.body.removeChild(copyTextarea);
}

// eslint-disable-next-line no-unused-vars
function writeToClipBoard(data) {
  // sadly fails on Firefox, can't even catch the TypeError thrown by the "query"
  // for permission
  try {
    navigator.permissions
      .query({
        name: "clipboard-write",
      })
      .then((permission) => {
        if (permission.value === "granted") {
          navigator.clipboard.writeText(JSON.stringify(data, null, 2));
        }
      });
  } catch (e) {
    console.info(data);
  }
}

export { Saver };
